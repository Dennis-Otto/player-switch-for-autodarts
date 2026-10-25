/**
 * Properties of the stored accounts, checked by fast-check on many generated
 * histories of changes and on stored data of any shape: whatever happened before,
 * the accounts stay in order, a stored password changes only when a person asks,
 * an account is waited for only while nobody plays, the popup never sees a session
 * or a password, a failing renewal is marked until a session works again, and what
 * the extension stores it reads back the same, in any version it knows, with no
 * session and no password in plain text, and never mistakes a value of another
 * version for accounts.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import fc from "fast-check";

import type { Identity } from "../src/autodarts.ts";
import {
  activate,
  type Credentials,
  deactivate,
  EMPTY,
  endSession,
  failRenewal,
  find,
  forget,
  forgetCredentials,
  isAdding,
  PLAIN_VERSION,
  park,
  parked,
  parseSealed,
  parseState,
  readStored,
  rememberCredentials,
  STATE_VERSION,
  type State,
  setActive,
  startAdding,
  stash,
  stopAdding,
  toStored,
  toView,
} from "../src/state.ts";
import { ACCOUNTS_KEY, createStore, type StorageArea } from "../src/storage.ts";
import { createVault, type KeyStore } from "../src/vault.ts";
import "./properties.ts";

/** Any text, beyond ASCII: names come from people, tokens from the network. */
const text = fc.string({ unit: "binary" });
const filled = fc.string({ unit: "binary", minLength: 1 });

/** A few accounts, so that the changes meet the same ones again and again. */
const id = fc.constantFrom("a", "b", "c", "d");
const identity: fc.Arbitrary<Identity> = fc.record({
  id,
  // Names that sort alike and apart, also the same name for two accounts.
  username: fc.oneof(fc.constantFrom("ada", "Ada", "bob", "zoë"), text),
  name: text,
  picture: fc.option(text, { nil: null }),
});
// A plain object, as the popup sends it in a message.
const credentials: fc.Arbitrary<Credentials> = fc.record(
  { username: filled, password: filled },
  { noNullPrototype: true },
);
const now = fc.nat();

/** One change of the stored accounts, as the extension makes them. */
const change = fc.oneof(
  fc.record({
    kind: fc.constant("park" as const),
    identity,
    token: filled,
    now,
  }),
  fc.record({ kind: fc.constant("stash" as const), id, token: filled, now }),
  fc.record({ kind: fc.constant("setActive" as const), identity }),
  fc.record({ kind: fc.constant("activate" as const), id }),
  fc.record({ kind: fc.constant("endSession" as const), id }),
  fc.record({ kind: fc.constant("failRenewal" as const), id, now }),
  fc.record({ kind: fc.constant("deactivate" as const) }),
  fc.record({ kind: fc.constant("forget" as const), id }),
  fc.record({
    kind: fc.constant("rememberCredentials" as const),
    id,
    credentials,
  }),
  fc.record({ kind: fc.constant("forgetCredentials" as const), id }),
  fc.record({ kind: fc.constant("startAdding" as const), until: now }),
  fc.record({ kind: fc.constant("stopAdding" as const) }),
);
type Change = typeof change extends fc.Arbitrary<infer T> ? T : never;

function apply(state: State, step: Change): State {
  switch (step.kind) {
    case "park":
      return park(state, step.identity, step.token, step.now);
    case "stash":
      return stash(state, step.id, step.token, step.now);
    case "setActive":
      return setActive(state, step.identity);
    case "activate":
      return activate(state, step.id);
    case "endSession":
      return endSession(state, step.id);
    case "failRenewal":
      return failRenewal(state, step.id, step.now);
    case "deactivate":
      return deactivate(state);
    case "forget":
      return forget(state, step.id);
    case "rememberCredentials":
      return rememberCredentials(state, step.id, step.credentials);
    case "forgetCredentials":
      return forgetCredentials(state, step.id);
    case "startAdding":
      return startAdding(state, step.until);
    case "stopAdding":
      return stopAdding(state);
  }
}

/** Every state the changes make: one after each change, from the empty one. */
function history(steps: Change[]): State[] {
  const states = [EMPTY];
  for (const step of steps) {
    states.push(apply(states.at(-1) as State, step));
  }
  return states;
}

const changes = fc.array(change, { maxLength: 40, size: "max" });

test("every change keeps each account once, in the order of the popup, and the active one among them", () => {
  fc.assert(
    fc.property(changes, (steps) => {
      for (const state of history(steps)) {
        const ids = state.profiles.map((profile) => profile.id);
        assert.equal(new Set(ids).size, ids.length);
        for (const [index, profile] of state.profiles.entries()) {
          const next = state.profiles[index + 1];
          if (next !== undefined) {
            const order =
              profile.username.localeCompare(next.username) ||
              profile.id.localeCompare(next.id);
            assert.ok(order < 0, `${profile.id} before ${next.id}`);
          }
        }
        assert.ok(state.activeId === null || ids.includes(state.activeId));
        // The active account never needs a new sign-in, and the background never renews it.
        assert.equal(
          state.activeId === null
            ? false
            : find(state, state.activeId)?.needsSignIn,
          false,
        );
        assert.ok(
          parked(state).every(
            (profile) =>
              profile.token !== null && profile.id !== state.activeId,
          ),
        );
        // A new account is waited for only while no account of the extension plays.
        assert.ok(state.addingUntil === null || state.activeId === null);
      }
    }),
  );
});

test("a new account is waited for from its start until a player comes on or it is stopped", () => {
  fc.assert(
    fc.property(changes, now, (steps, until) => {
      let state = EMPTY;
      for (const step of steps) {
        const before = state;
        state = apply(state, step);
        if (step.kind === "startAdding") {
          assert.equal(
            state.addingUntil,
            before.activeId === null ? step.until : before.addingUntil,
          );
        } else if (step.kind === "stopAdding" || state.activeId !== null) {
          assert.equal(state.addingUntil, null);
        } else {
          assert.equal(state.addingUntil, before.addingUntil);
        }
      }
      // The window is open up to its end, and closed from then on.
      const open = startAdding(deactivate(state), until);
      assert.ok(until === 0 || isAdding(open, until - 1));
      assert.ok(!isAdding(open, until));
      assert.ok(!isAdding(stopAdding(open), 0));
    }),
  );
});

test("a stored password changes only when a person keeps or drops it", () => {
  fc.assert(
    fc.property(changes, (steps) => {
      let state = EMPTY;
      const kept = new Map<string, Credentials | null>();
      for (const step of steps) {
        const known = "id" in step && find(state, step.id) !== undefined;
        state = apply(state, step);
        if (step.kind === "rememberCredentials" && known) {
          kept.set(step.id, step.credentials);
        } else if (
          (step.kind === "forgetCredentials" && known) ||
          step.kind === "forget"
        ) {
          kept.delete(step.id);
        }
        for (const profile of state.profiles) {
          assert.deepEqual(profile.credentials, kept.get(profile.id) ?? null);
        }
      }
    }),
  );
});

test("a session goes where the change puts it, whatever happened before", () => {
  fc.assert(
    fc.property(changes, change, (steps, step) => {
      const before = history(steps).at(-1) as State;
      const after = apply(before, step);
      const target =
        "identity" in step ? step.identity.id : "id" in step ? step.id : null;
      const profile = target === null ? undefined : find(after, target);
      const existed = target !== null && find(before, target) !== undefined;
      switch (step.kind) {
        case "park":
          // A parked session is renewed in the background, so the account no longer plays.
          assert.equal(profile?.token, step.token);
          assert.equal(profile?.refreshedAt, step.now);
          assert.notEqual(after.activeId, target);
          break;
        case "stash":
          assert.equal(profile?.token, existed ? step.token : undefined);
          break;
        case "setActive":
        case "activate":
          // The session of the account that plays belongs to the page.
          assert.equal(
            after.activeId,
            existed || step.kind === "setActive" ? target : before.activeId,
          );
          assert.equal(
            profile?.token,
            existed || step.kind === "setActive" ? null : undefined,
          );
          break;
        case "endSession":
          assert.equal(profile?.token, existed ? null : undefined);
          assert.equal(profile?.needsSignIn, existed ? true : undefined);
          assert.notEqual(after.activeId, target);
          break;
        case "failRenewal":
          // The session stays; only the time when the renewal began to fail is kept.
          assert.deepEqual(
            after.profiles.map(({ renewalFailedAt: _, ...rest }) => rest),
            before.profiles.map(({ renewalFailedAt: _, ...rest }) => rest),
          );
          assert.equal(
            profile?.renewalFailedAt,
            existed
              ? (find(before, target)?.renewalFailedAt ?? step.now)
              : undefined,
          );
          break;
        case "deactivate":
          assert.equal(after.activeId, null);
          break;
        case "forget":
          assert.equal(profile, undefined);
          assert.notEqual(after.activeId, target);
          break;
        default:
          // A password change leaves the sessions alone.
          assert.deepEqual(
            after.profiles.map(({ credentials: _, ...rest }) => rest),
            before.profiles.map(({ credentials: _, ...rest }) => rest),
          );
          assert.equal(after.activeId, before.activeId);
      }
    }),
  );
});

test("what the extension stores, it reads back the same", () => {
  fc.assert(
    fc.property(changes, (steps) => {
      for (const state of history(steps)) {
        assert.deepEqual(parseState(JSON.parse(JSON.stringify(state))), state);
        // What the versions before the sealed secrets stored is the same state.
        for (const version of [undefined, PLAIN_VERSION]) {
          assert.deepEqual(
            readStored(JSON.parse(JSON.stringify({ ...state, version }))),
            { kind: "plain", state },
          );
        }
      }
    }),
  );
});

/** A storage of the browser that keeps JSON, as chrome.storage does. */
function memoryArea(): StorageArea & { value(): unknown } {
  const data = new Map<string, unknown>();
  return {
    value: () => data.get(ACCOUNTS_KEY),
    get: (keys) =>
      Promise.resolve(
        Object.fromEntries(
          keys
            .filter((key) => data.has(key))
            .map((key) => [key, data.get(key)]),
        ),
      ),
    set: (items) => {
      for (const [key, value] of Object.entries(items)) {
        data.set(key, JSON.parse(JSON.stringify(value)));
      }
      return Promise.resolve();
    },
    remove: (keys) => {
      for (const key of keys) {
        data.delete(key);
      }
      return Promise.resolve();
    },
  };
}

function memoryKeys(): KeyStore {
  let key: CryptoKey | undefined;
  return {
    load: () => Promise.resolve(key),
    add: (made) => {
      key ??= made;
      return Promise.resolve(key);
    },
  };
}

test("what the store saves, it loads back the same, with every session and password sealed", async () => {
  const vault = createVault(memoryKeys());
  await fc.assert(
    fc.asyncProperty(changes, async (steps) => {
      const state = history(steps).at(-1) as State;
      const area = memoryArea();
      const store = createStore(area, vault);
      await store.save(state);
      const stored = area.value() as {
        version: unknown;
        profiles: Record<string, unknown>[];
      };
      assert.equal(stored.version, STATE_VERSION);
      for (const profile of stored.profiles) {
        for (const secret of [profile.token, profile.credentials]) {
          assert.ok(
            secret === null || parseSealed(secret) !== null,
            JSON.stringify(secret),
          );
        }
      }
      assert.deepEqual(await store.load(), state);
      // The secrets, and only they, are left out of what readStored shows of them.
      const read = readStored(stored);
      assert.equal(read.kind, "sealed");
      assert.deepEqual(read.kind === "sealed" ? read.state : null, {
        ...state,
        profiles: state.profiles.map((profile) => ({
          ...profile,
          token: null,
          credentials: null,
        })),
      });
    }),
    { numRuns: 50 },
  );
});

test("a renewal fails for an account until a session of it works again", () => {
  fc.assert(
    fc.property(changes, (steps) => {
      let state = EMPTY;
      const since = new Map<string, number>();
      for (const step of steps) {
        state = apply(state, step);
        if (
          step.kind === "failRenewal" &&
          find(state, step.id) !== undefined &&
          !since.has(step.id)
        ) {
          since.set(step.id, step.now);
        } else if (
          [
            "park",
            "stash",
            "setActive",
            "activate",
            "endSession",
            "forget",
          ].includes(step.kind)
        ) {
          // A fresh session, the page or a new sign-in takes over: the mark of the failure goes.
          since.delete(
            "identity" in step ? step.identity.id : "id" in step ? step.id : "",
          );
        }
        for (const profile of state.profiles) {
          assert.equal(
            profile.renewalFailedAt,
            since.get(profile.id) ?? null,
            profile.id,
          );
        }
      }
    }),
  );
});

test("a stored value of a version the extension doesn't know is never taken for accounts", () => {
  const other = fc.oneof(
    fc.integer(),
    fc.double(),
    fc.string(),
    fc.boolean(),
    fc.constant(null),
    fc.object(),
  );
  fc.assert(
    fc.property(changes, other, (steps, version) => {
      fc.pre(version !== STATE_VERSION && version !== PLAIN_VERSION);
      const state = history(steps).at(-1) as State;
      assert.deepEqual(readStored({ ...toStored(state, new Map()), version }), {
        kind: "unknown",
      });
    }),
  );
});

/** Stored data that is nearly a state: right and wrong types in every field. */
const almostState = fc.record(
  {
    activeId: fc.oneof(id, fc.anything()),
    addingUntil: fc.oneof(now, fc.double(), fc.anything()),
    profiles: fc.array(
      fc.oneof(
        fc.record(
          {
            id: fc.oneof(id, fc.constant(""), fc.anything()),
            username: fc.oneof(text, fc.anything()),
            name: fc.oneof(text, fc.anything()),
            picture: fc.oneof(text, fc.anything()),
            token: fc.oneof(text, fc.anything()),
            needsSignIn: fc.oneof(fc.boolean(), fc.anything()),
            refreshedAt: fc.oneof(now, fc.anything()),
            renewalFailedAt: fc.oneof(now, fc.anything()),
            credentials: fc.oneof(
              fc.record({
                username: fc.oneof(text, fc.anything()),
                password: fc.oneof(text, fc.anything()),
              }),
              fc.anything(),
            ),
          },
          { requiredKeys: [] },
        ),
        fc.anything(),
      ),
    ),
  },
  { requiredKeys: [] },
);

test("parseState reads stored data of any shape, keeping only what is an account", () => {
  fc.assert(
    fc.property(
      fc.oneof(almostState, fc.anything(), fc.jsonValue()),
      (stored) => {
        const state = parseState(stored);
        for (const profile of state.profiles) {
          assert.ok(typeof profile.id === "string" && profile.id !== "");
          assert.equal(typeof profile.username, "string");
          assert.equal(typeof profile.name, "string");
          assert.ok(
            profile.picture === null || typeof profile.picture === "string",
          );
          assert.ok(
            profile.token === null ||
              (typeof profile.token === "string" && profile.token !== ""),
          );
          assert.equal(typeof profile.needsSignIn, "boolean");
          assert.ok(
            profile.refreshedAt === null ||
              typeof profile.refreshedAt === "number",
          );
          assert.ok(
            profile.renewalFailedAt === null ||
              typeof profile.renewalFailedAt === "number",
          );
          const kept = profile.credentials;
          assert.ok(
            kept === null || (kept.username !== "" && kept.password !== ""),
          );
        }
        const ids = state.profiles.map((profile) => profile.id);
        assert.equal(
          new Set(ids).size,
          ids.length,
          "each account is read once",
        );
        assert.ok(
          state.activeId === null || find(state, state.activeId) !== undefined,
        );
        assert.ok(
          state.addingUntil === null ||
            (Number.isFinite(state.addingUntil) && state.activeId === null),
        );
        // Reading what was read changes nothing.
        assert.deepEqual(parseState(state), state);
      },
    ),
  );
});

test("the popup sees no session and no password of any account", () => {
  const stored = fc.oneof(
    almostState,
    changes.map((steps) => history(steps).at(-1)),
  );
  fc.assert(
    fc.property(stored, fc.boolean(), now, (value, pageHasSession, at) => {
      const state = parseState(value);
      const view = toView(state, pageHasSession, at);
      assert.equal(view.unsaved, pageHasSession && state.activeId === null);
      assert.equal(
        view.adding,
        state.addingUntil !== null && at < state.addingUntil,
      );
      assert.equal(view.profiles.length, state.profiles.length);
      for (const [index, shown] of view.profiles.entries()) {
        const profile = state.profiles[index];
        assert.deepEqual(Object.keys(shown).sort(), [
          "active",
          "id",
          "name",
          "needsSignIn",
          "picture",
          "remembersPassword",
          "renewalFailingSince",
          "renewedAt",
          "username",
        ]);
        assert.equal(shown.id, profile?.id);
        assert.equal(shown.active, shown.id === state.activeId);
        assert.equal(shown.remembersPassword, profile?.credentials !== null);
        // A time shows only for a parked session, which the extension renews itself.
        const ownsSession = profile?.token !== null && !shown.active;
        assert.equal(
          shown.renewedAt,
          ownsSession ? profile?.refreshedAt : null,
        );
        assert.equal(
          shown.renewalFailingSince,
          ownsSession ? profile?.renewalFailedAt : null,
        );
      }
    }),
  );
});
