/**
 * Properties of switching, checked by fast-check on many generated evenings at a
 * shared display: taps on accounts, the page renewing and losing its session,
 * Autodarts ending sessions and going offline, an Autodarts tab that is gone, the
 * page loading while an account is being added or long after, and passwords kept,
 * wrong or changed, in any order.
 *
 * A fake Autodarts rotates the refresh tokens as the real one does: a renewed token
 * is spent. Whatever happens, the extension keeps the rule of `switch.ts` and loses
 * no session that it could still use.
 *
 * The evenings run one action after the other. The last tests let taps and the
 * renewal overlap instead, as a double tap or the alarm during a switch do, with the
 * scheduler of fast-check picking the order in which Autodarts and the page answer.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import fc from "fast-check";

import { AuthError, type Fetch } from "../src/autodarts.ts";
import { createQueue, type Queue } from "../src/queue.ts";
import {
  find,
  forget,
  forgetCredentials,
  isAdding,
  parked,
  parseState,
  rememberCredentials,
  type State,
} from "../src/state.ts";
import {
  ADD_WINDOW_MS,
  adoptCurrentSession,
  adoptNewSignIn,
  type Deps,
  type PagePort,
  type PickUp,
  refreshParked,
  signOutForNewAccount,
  type Store,
  type SwitchResult,
  switchTo,
  syncFromPage,
} from "../src/switch.ts";
import { jsonResponse, type PageFailure, sessionResponse } from "./helpers.ts";
import "./properties.ts";

/** The accounts of the evening; each signs in with its id as username. */
const ACCOUNTS = ["a", "b", "c"] as const;

/** Autodarts, with token rotation: a token is valid until it is renewed or its session ends. */
class FakeAutodarts {
  readonly tokens = new Map<string, { account: string; valid: boolean }>();
  readonly passwords = new Map<string, string>(ACCOUNTS.map((id) => [id, `${id}-1`]));
  /** Unreachable, by a failed request or by an error status, or reachable. */
  outage: "none" | "throws" | "503" = "none";
  /** The tokens sent to be renewed, in order. */
  readonly renewed: string[] = [];
  private issued = 0;

  /** A new session of the account, as a sign-in in the page or the extension makes one. */
  issue(account: string): string {
    this.issued += 1;
    const token = `rt-${account}-${this.issued}`;
    this.tokens.set(token, { account, valid: true });
    return token;
  }

  /** The account that a token can still make a session for. */
  holder(token: string | null): string | null {
    const entry = token === null ? undefined : this.tokens.get(token);
    return entry?.valid === true ? entry.account : null;
  }

  spend(token: string): void {
    const entry = this.tokens.get(token);
    if (entry !== undefined) {
      entry.valid = false;
    }
  }

  endSessions(account: string): void {
    for (const entry of this.tokens.values()) {
      if (entry.account === account) {
        entry.valid = false;
      }
    }
  }

  readonly fetch: Fetch = (url, init) => {
    if (this.outage === "throws") {
      return Promise.reject(new TypeError("Failed to fetch"));
    }
    if (this.outage === "503") {
      return Promise.resolve(jsonResponse({}, 503));
    }
    const body = JSON.parse(String(init.body)) as Record<string, string>;
    if (url.endsWith("/refresh")) {
      const token = body.refresh_token as string;
      this.renewed.push(token);
      const account = this.holder(token);
      if (account === null) {
        return Promise.resolve(jsonResponse({ error: "invalid_grant" }, 400));
      }
      this.spend(token);
      return Promise.resolve(sessionResponse(account, this.issue(account)));
    }
    if (url.endsWith("/login")) {
      const account = body.username as string;
      if (this.passwords.get(account) !== body.password) {
        return Promise.resolve(jsonResponse({ error: "invalid_grant" }, 401));
      }
      return Promise.resolve(sessionResponse(account, this.issue(account)));
    }
    return Promise.reject(new Error(`unexpected request to ${url}`));
  };
}

/** The error of an Autodarts tab that is gone, or of a page without the content script. */
class NoPage extends Error {}

/** The Autodarts page, where each request of the extension can fail on its own. */
class Page implements PagePort {
  token: string | null = null;
  failing = new Set<PageFailure>();

  readToken(): Promise<string | null> {
    return this.failing.has("read") ? Promise.reject(new NoPage()) : Promise.resolve(this.token);
  }

  writeToken(token: string): Promise<void> {
    if (this.failing.has("write")) {
      return Promise.reject(new NoPage());
    }
    this.token = token;
    return Promise.resolve();
  }

  clearToken(): Promise<void> {
    if (this.failing.has("clear")) {
      return Promise.reject(new NoPage());
    }
    this.token = null;
    return Promise.resolve();
  }
}

/** The storage of the browser, which keeps JSON, as chrome.storage does. */
class JsonStore implements Store {
  stored: unknown = null;

  load(): Promise<State> {
    return Promise.resolve(parseState(this.stored));
  }

  save(state: State): Promise<void> {
    this.stored = JSON.parse(JSON.stringify(state));
    return Promise.resolve();
  }

  get state(): State {
    return parseState(this.stored);
  }
}

const account = fc.constantFrom(...ACCOUNTS);
/** Mostly a page that answers, sometimes one that fails at a request, as when its tab closes. */
const failing = fc.oneof(
  { weight: 3, arbitrary: fc.constant<PageFailure[]>([]) },
  { weight: 1, arbitrary: fc.subarray<PageFailure>(["read", "write", "clear"], { minLength: 1 }) },
);

/** What the extension does, on a tap in the popup or on its timer; taps on accounts most often. */
const action = fc.oneof(
  { weight: 6, arbitrary: fc.record({ kind: fc.constant("switch" as const), id: account, failing }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant("adopt" as const), failing }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("signOut" as const), failing }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("sync" as const), failing }) },
  // An Autodarts page finished loading: the service worker saves a new sign-in.
  { weight: 3, arbitrary: fc.record({ kind: fc.constant("pageLoads" as const), failing }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("refresh" as const) }) },
  {
    weight: 1,
    arbitrary: fc.record({ kind: fc.constant("remember" as const), id: account, right: fc.boolean() }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("forgetPassword" as const), id: account }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("remove" as const), id: account }) },
);

/** What happens around the extension: in the page, at Autodarts and on the network. */
const event = fc.oneof(
  { weight: 4, arbitrary: fc.record({ kind: fc.constant("pageSignsIn" as const), id: account }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("pageRenews" as const) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("pageSignsOut" as const) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("sessionsEnd" as const), id: account }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("passwordChanges" as const), id: account }) },
  // Long enough for an account that is being added to be waited for no longer.
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("timePasses" as const) }) },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant("outage" as const),
      // Autodarts is back more often than it is gone.
      outage: fc.constantFrom("none" as const, "none" as const, "throws" as const, "503" as const),
    }),
  },
);

type Action = typeof action extends fc.Arbitrary<infer T> ? T : never;
type Event = typeof event extends fc.Arbitrary<infer T> ? T : never;
type Step = { by: "extension"; action: Action } | { by: "world"; event: Event };

const evening = fc.array(
  fc.oneof(
    { weight: 2, arbitrary: action.map((value): Step => ({ by: "extension", action: value })) },
    { weight: 1, arbitrary: event.map((value): Step => ({ by: "world", event: value })) },
  ),
  { maxLength: 60, size: "max" },
);

interface World {
  autodarts: FakeAutodarts;
  page: Page;
  store: JsonStore;
  deps: Deps;
  /** The time of the last reading of the clock, which each reading moves on. */
  clock: { now: number };
}

function world(): World {
  const autodarts = new FakeAutodarts();
  const page = new Page();
  const store = new JsonStore();
  const clock = { now: 0 };
  const deps: Deps = { fetcher: autodarts.fetch, page, store, now: () => ++clock.now, queue: createQueue() };
  return { autodarts, page, store, deps, clock };
}

/** Every account signs in on the page once and is saved, as on the first evening. */
async function saveEveryAccount(w: World): Promise<void> {
  for (const id of ACCOUNTS) {
    w.page.token = w.autodarts.issue(id);
    await adoptCurrentSession(w.deps);
    await signOutForNewAccount(w.deps);
  }
}

function happen(w: World, step: Event): void {
  const { autodarts, page } = w;
  switch (step.kind) {
    case "pageSignsIn": {
      // Someone signs in on the empty page, as the extension expects it: after "Add
      // account", or as the account that played last. Another account signed in
      // right in the page is left out until #30 is fixed: the extension takes its
      // session for the one of the account that played last.
      const active = w.store.state.activeId;
      if (page.token === null && (active === null || active === step.id)) {
        page.token = autodarts.issue(step.id);
      }
      return;
    }
    case "pageRenews": {
      const holder = autodarts.holder(page.token);
      if (page.token !== null && holder !== null) {
        autodarts.spend(page.token);
        page.token = autodarts.issue(holder);
      }
      return;
    }
    case "pageSignsOut":
      if (page.token !== null) {
        autodarts.spend(page.token);
        page.token = null;
      }
      return;
    case "sessionsEnd":
      autodarts.endSessions(step.id);
      return;
    case "passwordChanges":
      autodarts.passwords.set(step.id, `${autodarts.passwords.get(step.id)}+`);
      return;
    case "timePasses":
      w.clock.now += ADD_WINDOW_MS;
      return;
    case "outage":
      autodarts.outage = step.outage;
      return;
  }
}

type Result = SwitchResult | PickUp | Error | undefined;

/** Runs an action of the extension; the error it threw, if any, is the result. */
async function run(w: World, step: Action): Promise<Result> {
  const { autodarts, deps, page, store } = w;
  page.failing = new Set("failing" in step ? step.failing : []);
  try {
    switch (step.kind) {
      case "switch":
        return await switchTo(deps, step.id);
      case "adopt":
        await adoptCurrentSession(deps);
        return undefined;
      case "signOut":
        await signOutForNewAccount(deps);
        return undefined;
      case "sync":
        await syncFromPage(deps);
        return undefined;
      case "pageLoads":
        return await adoptNewSignIn(deps);
      case "refresh":
        await refreshParked(deps);
        return undefined;
      case "remember": {
        const password = step.right ? autodarts.passwords.get(step.id) : "wrong";
        const credentials = { username: step.id, password: password ?? "" };
        await store.save(rememberCredentials(store.state, step.id, credentials));
        return undefined;
      }
      case "forgetPassword":
        await store.save(forgetCredentials(store.state, step.id));
        return undefined;
      case "remove":
        await store.save(forget(store.state, step.id));
        return undefined;
    }
  } catch (error) {
    return error as Error;
  } finally {
    page.failing = new Set();
  }
}

/** The accounts that can still play without a person signing in again. */
function usable(w: World): Set<string> {
  const { autodarts, page } = w;
  const state = w.store.state;
  const result = new Set<string>();
  for (const profile of state.profiles) {
    const credentials = profile.credentials;
    if (
      autodarts.holder(profile.token) === profile.id ||
      (profile.id === state.activeId && autodarts.holder(page.token) === profile.id) ||
      (credentials !== null && autodarts.passwords.get(credentials.username) === credentials.password)
    ) {
      result.add(profile.id);
    }
  }
  return result;
}

/** What holds after every step of the evening. */
function assertSound(w: World): void {
  const { autodarts, page } = w;
  const state = w.store.state;
  const ids = state.profiles.map((profile) => profile.id);
  assert.equal(new Set(ids).size, ids.length, "each account is stored once");
  assert.ok(state.activeId === null || ids.includes(state.activeId), "the active account is stored");
  assert.ok(state.addingUntil === null || state.activeId === null, "a new account is waited for while nobody plays");
  assert.equal(
    state.activeId === null ? false : find(state, state.activeId)?.needsSignIn,
    false,
    "the active account needs no sign-in",
  );
  // Each session that still works has one keeper: two keepers would spend it for each other.
  const keepers = [page.token, ...parked(state).map((profile) => profile.token)].filter(
    (token) => autodarts.holder(token) !== null,
  );
  assert.equal(new Set(keepers).size, keepers.length, "no session is kept twice");
  for (const profile of state.profiles) {
    const holder = autodarts.holder(profile.token);
    assert.ok(holder === null || holder === profile.id, `${profile.id} keeps a session of ${holder}`);
  }
}

/** What the world looked like before an action of the extension. */
interface Before {
  state: State;
  page: string | null;
  /** The account signed in on the page, as far as Autodarts knows. */
  playing: string | null;
  usable: Set<string>;
  renewed: number;
  /** Whether a new sign-in is saved by itself at the next reading of the clock. */
  adding: boolean;
}

function snapshot(w: World): Before {
  const state = w.store.state;
  return {
    state,
    page: w.page.token,
    playing: w.autodarts.holder(w.page.token),
    usable: usable(w),
    renewed: w.autodarts.renewed.length,
    adding: isAdding(state, w.clock.now + 1),
  };
}

/** What an action of the extension promises, whatever it ended in. */
function assertKept(
  w: World,
  extension: Action,
  before: Before,
  result: Result,
): void {
  const { autodarts, page } = w;
  const after = w.store.state;
  // An action fails only because the page is gone, or, while adopting the
  // page's session, because Autodarts can't be reached.
  if (result instanceof Error) {
    assert.ok(
      result instanceof NoPage ||
        (extension.kind === "adopt" && result instanceof AuthError && result.kind === "unreachable"),
      `unexpected ${result.name}: ${result.message}`,
    );
  }
  // Only adopting renews the token that is live in the page, and saving a new sign-in
  // while an account is being added; both write the fresh one straight back.
  const adopts = extension.kind === "adopt" || (extension.kind === "pageLoads" && before.adding);
  if (!adopts && before.page !== null) {
    const renewed = autodarts.renewed.slice(before.renewed);
    assert.ok(!renewed.includes(before.page), "renewed the page's session");
  }
  // An account that could play before still can, unless a person removed it
  // or changed its stored password.
  const touched =
    extension.kind === "remember" || extension.kind === "forgetPassword" ? extension.id : null;
  for (const id of before.usable) {
    if (find(after, id) !== undefined && id !== touched) {
      assert.ok(usable(w).has(id), `${id} lost its session`);
    }
  }
  if (result === undefined && extension.kind === "adopt") {
    // The account of the page is saved and plays on, and a dead session leaves the page.
    assert.equal(after.activeId, before.playing);
    assert.equal(autodarts.holder(page.token), before.playing, "the page stays signed in");
    assert.ok(before.playing !== null || page.token === null);
  }
  if (result === undefined && extension.kind === "signOut") {
    assert.equal(page.token, null);
    assert.equal(after.activeId, null);
    assert.notEqual(after.addingUntil, null, "the new account is waited for");
  }
  if (extension.kind === "pageLoads") {
    assertPickedUp(w, before, result as PickUp | Error);
  }
  if (result === undefined && extension.kind === "sync" && page.token === null) {
    assert.equal(after.activeId, null);
  }
  if (extension.kind === "switch" && result !== undefined && !(result instanceof Error)) {
    const switched = result as SwitchResult;
    const target = find(before.state, extension.id);
    if (switched.ok) {
      assert.ok(target === undefined || after.activeId === extension.id);
      if (target !== undefined && before.state.activeId !== extension.id) {
        assert.equal(autodarts.holder(page.token), extension.id, "the page plays the account");
      }
    } else if (switched.reason === "unreachable") {
      assert.deepEqual(after, before.state);
      assert.equal(page.token, before.page);
    } else {
      assert.equal(find(after, extension.id)?.needsSignIn, true);
      assert.ok(!before.usable.has(extension.id), `${extension.id} could still play`);
    }
  }
}

/** What a page that finished loading promises: a sign-in is saved only while an account is being added. */
function assertPickedUp(w: World, before: Before, result: PickUp | Error): void {
  const { autodarts, page } = w;
  const after = w.store.state;
  if (!before.adding) {
    // Outside the window, nothing is saved and no token is spent; the window closes for good.
    assert.ok(!(result instanceof Error) && result.kind === "idle");
    assert.deepEqual(after, { ...before.state, addingUntil: null });
    assert.equal(autodarts.renewed.length, before.renewed, "spent a token outside the window");
    return;
  }
  if (!(result instanceof Error) && result.kind === "saved") {
    // The account of the page is saved, plays on, and is no longer waited for.
    assert.equal(result.identity.id, before.playing);
    assert.equal(after.activeId, before.playing);
    assert.equal(after.addingUntil, null);
    assert.equal(autodarts.holder(page.token), before.playing, "the page stays signed in");
    return;
  }
  // Without a sign-in to save yet, the window stays open for the next load.
  assert.notEqual(after.addingUntil, null, "the new account is still waited for");
}

test("over any evening, the extension loses no usable session and never renews the page's own", async () => {
  await fc.assert(
    fc.asyncProperty(fc.boolean(), evening, async (saved, steps) => {
      const w = world();
      if (saved) {
        await saveEveryAccount(w);
      }
      for (const step of steps) {
        if (step.by === "world") {
          happen(w, step.event);
          assertSound(w);
          continue;
        }
        const extension = step.action;
        const before = snapshot(w);
        const result = await run(w, extension);
        assertKept(w, extension, before, result);
        assertSound(w);
      }
    }),
  );
});

test("a switch between saved accounts plays the account and parks the one before", async () => {
  await fc.assert(
    fc.asyncProperty(fc.array(account, { minLength: 1, maxLength: 20 }), async (taps) => {
      const w = world();
      await saveEveryAccount(w);
      assert.deepEqual(usable(w), new Set(ACCOUNTS));
      for (const id of taps) {
        const result = await switchTo(w.deps, id);
        assert.ok(result.ok);
        assert.equal(w.store.state.activeId, id);
        assert.equal(w.autodarts.holder(w.page.token), id);
        assert.deepEqual(usable(w), new Set(ACCOUNTS));
        await refreshParked(w.deps);
        assert.deepEqual(usable(w), new Set(ACCOUNTS));
      }
    }),
  );
});

/** A page that answers every request. */
const answering = fc.constant<PageFailure[]>([]);

/** What the extension may do at the same time: taps in the popup or the switcher, and the renewal. */
const overlapping = fc.oneof(
  { weight: 4, arbitrary: fc.record({ kind: fc.constant("switch" as const), id: account, failing: answering }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("adopt" as const), failing: answering }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("signOut" as const), failing: answering }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("refresh" as const) }) },
);

/**
 * Taps and renewals that overlap, while each answer of Autodarts and of the page
 * comes back in an order that the scheduler picks: no refresh token is sent twice,
 * and every account keeps a session it can play with. `queue` makes the queue of
 * the extension.
 */
function overlapsAreSafe(queue: () => Queue) {
  return fc.asyncProperty(fc.scheduler(), fc.array(overlapping, { minLength: 2, maxLength: 6 }), async (s, steps) => {
    const w = world();
    w.deps.queue = queue();
    await saveEveryAccount(w);
    await switchTo(w.deps, "a");
    assert.deepEqual(usable(w), new Set(ACCOUNTS));
    const sentBefore = w.autodarts.renewed.length;
    w.deps.fetcher = s.scheduleFunction(w.autodarts.fetch);
    w.deps.page = {
      readToken: s.scheduleFunction(() => w.page.readToken()),
      writeToken: s.scheduleFunction((token: string) => w.page.writeToken(token)),
      clearToken: s.scheduleFunction(() => w.page.clearToken()),
    };
    await s.waitFor(Promise.all(steps.map((step) => run(w, step))));
    const sent = w.autodarts.renewed.slice(sentBefore);
    assert.equal(new Set(sent).size, sent.length, `a refresh token was sent twice: ${sent.join(", ")}`);
    assert.deepEqual(usable(w), new Set(ACCOUNTS), "an account lost its session");
    assertSound(w);
  });
}

test("taps and the renewal that overlap, in any order, spend no token twice and lose no session", async () => {
  await fc.assert(overlapsAreSafe(createQueue));
});

test("without the queue, the overlap test finds a token spent twice, as on the code before the queue", async () => {
  // Every operation runs at once, as before the queue came.
  const unqueued: Queue = (task) => task();
  const details = await fc.check(overlapsAreSafe(() => unqueued), { seed: 28, numRuns: 100 });
  assert.ok(details.failed, "no order of the overlapping taps broke a promise");
});
