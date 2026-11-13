import assert from "node:assert/strict";
import { test } from "node:test";

import { type Identity, refreshSession } from "../src/autodarts.ts";
import { createQueue } from "../src/queue.ts";
import {
  EMPTY,
  endSession,
  find,
  park,
  rememberCredentials,
  type State,
  setActive,
  startAdding,
} from "../src/state.ts";
import {
  ADD_WINDOW_MS,
  adoptCurrentSession,
  adoptNewSignIn,
  type Deps,
  edit,
  forgetAll,
  joinLobbyAs,
  leaveDisplay,
  type Removal,
  readView,
  refreshParked,
  rememberPassword,
  removeAccount,
  signOutForNewAccount,
  startAddingAccount,
  stopAddingAccount,
  switchTo,
  syncFromPage,
} from "../src/switch.ts";
import { idleTick, NO_VENUE } from "../src/venue.ts";
import {
  LOGIN_WITHOUT_PASSWORD,
  REFRESH_DEAD_TOKEN,
  REFRESH_WITHOUT_TOKEN,
  type Recorded,
} from "./e2e/fake/recorded.ts";
import {
  counting,
  FakeAutodarts,
  FakePage,
  FakeStore,
  jsonResponse,
  router,
  sessionResponse,
} from "./helpers.ts";

const ada: Identity = { id: "a", username: "ada", name: "Ada", picture: null };
const bob: Identity = { id: "b", username: "bob", name: "Bob", picture: null };
const cy: Identity = { id: "c", username: "cy", name: "Cy", picture: null };

function deps(
  store: FakeStore,
  page: FakePage,
  fetcher: Deps["fetcher"],
  now = () => 1000,
): Deps {
  return { store, page, fetcher, now, queue: createQueue() };
}

/** An answer of the sign-in service as it was recorded. */
const recorded =
  ({ status, body }: Recorded): (() => Promise<Response>) =>
  () =>
    Promise.resolve(jsonResponse(body, status));
/** The answer to a dead token, which ends the session. */
const rejected = recorded(REFRESH_DEAD_TOKEN);
/** The answer to a request that the service can't read, as after a change of what it asks for. */
const misread = recorded(REFRESH_WITHOUT_TOKEN);
const offline = () => Promise.resolve(jsonResponse({}, 503));

/**
 * Autodarts that knows whose each token is: it answers a token that it lists with a
 * fresh session of its account, doesn't answer for one listed as offline, and refuses
 * every other.
 */
function renewing(
  sessions: Record<string, readonly [id: string, fresh: string] | "offline">,
): Deps["fetcher"] {
  return router({
    refresh: (_url, init) => {
      const { refresh_token: token } = JSON.parse(String(init.body)) as {
        refresh_token: string;
      };
      const session = sessions[token];
      if (session === undefined) {
        return rejected();
      }
      return session === "offline"
        ? offline()
        : Promise.resolve(sessionResponse(session[0], session[1]));
    },
  });
}

test("switchTo brings a parked account onto the page", async () => {
  const store = new FakeStore(park(EMPTY, ada, "ta", 0));
  const page = new FakePage(null);
  const result = await switchTo(
    deps(
      store,
      page,
      router({ refresh: () => Promise.resolve(sessionResponse("a", "fa")) }),
    ),
    "a",
  );
  assert.ok(result.ok);
  assert.equal(page.token, "fa");
  assert.equal(result.state.activeId, "a");
  assert.equal(find(result.state, "a")?.token, null);
});

test("switchTo parks the account that was playing", async () => {
  let state = park(EMPTY, ada, "ta", 0);
  state = setActive(state, bob);
  const store = new FakeStore(state);
  const page = new FakePage("pb");
  const result = await switchTo(
    deps(store, page, renewing({ ta: ["a", "fa"], pb: ["b", "fb"] })),
    "a",
  );
  assert.equal(result.state.activeId, "a");
  assert.equal(find(result.state, "b")?.token, "fb");
  assert.equal(page.token, "fa");
});

test("switchTo to the account already playing does nothing", async () => {
  const store = new FakeStore(setActive(park(EMPTY, ada, "ta", 0), ada));
  const result = await switchTo(deps(store, new FakePage("pa"), router()), "a");
  assert.ok(result.ok);
  assert.equal(store.saves, 0);
});

test("switchTo to an unknown account does nothing", async () => {
  const store = new FakeStore(EMPTY);
  const result = await switchTo(
    deps(store, new FakePage(null), router()),
    "ghost",
  );
  assert.ok(result.ok);
  assert.equal(store.saves, 0);
});

test("switchTo falls back to the stored password when the token is dead", async () => {
  const store = new FakeStore(
    rememberCredentials(park(EMPTY, ada, "bad", 0), "a", {
      username: "ada",
      password: "pw",
    }),
  );
  const page = new FakePage(null);
  const fetcher = router({
    refresh: rejected,
    login: () => Promise.resolve(sessionResponse("a", "fresh")),
  });
  const result = await switchTo(deps(store, page, fetcher), "a");
  assert.ok(result.ok);
  assert.equal(page.token, "fresh");
});

test("switchTo signs in with the stored password when there is no token", async () => {
  let state = setActive(park(EMPTY, bob, "tb", 0), bob);
  state = endSession(park(state, ada, "ta", 0), "a");
  state = rememberCredentials(state, "a", { username: "ada", password: "pw" });
  const store = new FakeStore(state);
  const page = new FakePage("pb");
  const fetcher = router({
    login: () => Promise.resolve(sessionResponse("a", "fresh")),
    refresh: () => Promise.resolve(sessionResponse("b", "fb")),
  });
  const result = await switchTo(deps(store, page, fetcher), "a");
  assert.ok(result.ok);
  assert.equal(page.token, "fresh");
  assert.equal(find(result.state, "b")?.token, "fb");
});

test("switchTo reports a temporary problem and changes nothing", async () => {
  const store = new FakeStore(park(EMPTY, ada, "ta", 0));
  const page = new FakePage(null);
  const result = await switchTo(
    deps(store, page, router({ refresh: offline })),
    "a",
  );
  assert.equal(result.ok, false);
  assert.equal(store.saves, 0);
  assert.equal(page.token, null);
});

test("switchTo reports when the password is also unreachable", async () => {
  const store = new FakeStore(
    rememberCredentials(park(EMPTY, ada, "bad", 0), "a", {
      username: "ada",
      password: "pw",
    }),
  );
  const result = await switchTo(
    deps(
      store,
      new FakePage(null),
      router({ refresh: rejected, login: offline }),
    ),
    "a",
  );
  assert.equal(result.ok, false);
  assert.equal(store.saves, 0);
});

test("switchTo marks the account when it has no way to sign in", async () => {
  const store = new FakeStore(park(EMPTY, ada, "ta", 0));
  const result = await switchTo(
    deps(store, new FakePage(null), router({ refresh: rejected })),
    "a",
  );
  assert.equal(result.ok, false);
  assert.equal(find(result.state, "a")?.needsSignIn, true);
});

test("switchTo marks the account when it has no token and no password", async () => {
  let state = setActive(park(EMPTY, bob, "tb", 0), bob);
  state = endSession(park(state, ada, "ta", 0), "a");
  const store = new FakeStore(state);
  const result = await switchTo(deps(store, new FakePage(null), router()), "a");
  assert.equal(result.ok, false);
});

test("switchTo can't sign in when the stored password is refused", async () => {
  let state = setActive(park(EMPTY, bob, "tb", 0), bob);
  state = endSession(park(state, ada, "ta", 0), "a");
  state = rememberCredentials(state, "a", {
    username: "ada",
    password: "wrong",
  });
  const store = new FakeStore(state);
  const result = await switchTo(
    deps(store, new FakePage(null), router({ login: rejected })),
    "a",
  );
  assert.equal(result.ok, false);
});

test("switchTo spends no token when the page is not there", async () => {
  const store = new FakeStore(park(EMPTY, ada, "ta", 0));
  const fetcher = counting(
    router({ refresh: () => Promise.resolve(sessionResponse("a", "fa")) }),
  );
  await assert.rejects(
    switchTo(deps(store, new FakePage(null, ["read"]), fetcher), "a"),
  );
  assert.equal(fetcher.calls, 0);
  assert.equal(find(store.state, "a")?.token, "ta");
});

test("switchTo keeps the renewed token when the page can't take it", async () => {
  const store = new FakeStore(setActive(park(EMPTY, ada, "ta", 0), bob));
  const page = new FakePage("pb", ["write"]);
  const fetcher = renewing({ ta: ["a", "fa"], pb: ["b", "fb"] });
  await assert.rejects(switchTo(deps(store, page, fetcher), "a"));
  // Every fresh token is kept, and nobody plays on a page that didn't take the new one.
  assert.equal(find(store.state, "a")?.token, "fa");
  assert.equal(find(store.state, "b")?.token, "fb");
  assert.equal(store.state.activeId, null);
  assert.equal(page.token, "pb");
});

test("adoptCurrentSession keeps the renewed token when the page can't take it", async () => {
  const store = new FakeStore(EMPTY);
  const page = new FakePage("in-page", ["write"]);
  const fetcher = router({
    refresh: () => Promise.resolve(sessionResponse("a", "fresh")),
  });
  await assert.rejects(adoptCurrentSession(deps(store, page, fetcher)));
  assert.equal(find(store.state, "a")?.token, "fresh");
});

test("signOutForNewAccount keeps the session when the page can't let go", async () => {
  const store = new FakeStore(setActive(EMPTY, ada));
  await assert.rejects(
    signOutForNewAccount(
      deps(store, new FakePage("pa", ["clear"]), renewing({ pa: ["a", "fa"] })),
    ),
  );
  assert.equal(find(store.state, "a")?.token, "fa");
  // The page still holds a session, so no new account is waited for.
  assert.equal(store.state.addingUntil, null);
});

test("adoptCurrentSession claims the session in the page and keeps it signed in", async () => {
  const store = new FakeStore(EMPTY);
  const page = new FakePage("in-page");
  const result = await adoptCurrentSession(
    deps(
      store,
      page,
      router({ refresh: () => Promise.resolve(sessionResponse("a", "fresh")) }),
    ),
  );
  assert.equal(result.ok, true);
  const { state } = result;
  // It names the account it saved, for the status line.
  assert.equal(result.ok && result.identity?.username, "a");
  assert.equal(state.activeId, "a");
  assert.equal(page.token, "fresh");
  assert.equal(find(state, "a")?.token, null);
});

test("adoptCurrentSession does nothing without a session in the page", async () => {
  const store = new FakeStore(setActive(EMPTY, ada));
  const result = await adoptCurrentSession(
    deps(store, new FakePage(null), router()),
  );
  assert.deepEqual([result.ok, result.ok && result.identity], [true, null]);
  const { state } = result;
  assert.equal(state.activeId, null);
  assert.equal(store.saves, 1);
});

test("adoptCurrentSession drops a dead session", async () => {
  const page = new FakePage("dead");
  const result = await adoptCurrentSession(
    deps(new FakeStore(EMPTY), page, router({ refresh: rejected })),
  );
  // Nothing was saved, so the status line names no account.
  assert.deepEqual([result.ok, result.ok && result.identity], [true, null]);
  const { state } = result;
  assert.equal(state.activeId, null);
  assert.equal(page.clears, 1);
});

test("adoptCurrentSession says when Autodarts can't be reached, and changes nothing", async () => {
  const store = new FakeStore(setActive(EMPTY, ada));
  const page = new FakePage("x");
  const result = await adoptCurrentSession(
    deps(store, page, router({ refresh: offline })),
  );
  assert.deepEqual([result.ok, result.reason], [false, "unreachable"]);
  assert.equal(result.state, store.state);
  assert.equal(store.saves, 0);
  assert.equal(page.token, "x");
  assert.equal(page.clears, 0);
  // Autodarts never got the token: a page that loads now keeps it.
  assert.equal(page.load().token, "x");
});

test("syncFromPage leaves everything alone while a session is in the page", async () => {
  const store = new FakeStore(setActive(EMPTY, ada));
  await syncFromPage(deps(store, new FakePage("x"), router()));
  assert.equal(store.saves, 0);
});

test("syncFromPage leaves an empty page alone when nobody was playing", async () => {
  const store = new FakeStore(EMPTY);
  await syncFromPage(deps(store, new FakePage(null), router()));
  assert.equal(store.saves, 0);
});

test("syncFromPage notices a sign-out in the page", async () => {
  const store = new FakeStore(setActive(EMPTY, ada));
  const state = await syncFromPage(deps(store, new FakePage(null), router()));
  assert.equal(state.activeId, null);
  assert.equal(find(state, "a")?.needsSignIn, true);
});

/** Ada plays on the page and remembers her password. */
function adaPlaysWithPassword() {
  return rememberCredentials(setActive(EMPTY, ada), "a", {
    username: "ada",
    password: "pw",
  });
}

test("syncFromPage leaves an account that remembers its password ready, and the renewal signs it in", async () => {
  const store = new FakeStore(adaPlaysWithPassword());
  const board = deps(
    store,
    new FakePage(null),
    router({ login: () => Promise.resolve(sessionResponse("a", "fresh")) }),
  );
  const state = await syncFromPage(board);
  // Nothing tried the password yet: the session is gone, but the account isn't stuck.
  assert.equal(state.activeId, null);
  assert.equal(find(state, "a")?.token, null);
  assert.equal(find(state, "a")?.needsSignIn, false);

  const run = await refreshParked(board);
  assert.equal(find(run.state, "a")?.token, "fresh");
  assert.equal(find(run.state, "a")?.needsSignIn, false);
  assert.equal(find(run.state, "a")?.refreshedAt, 1000);
  assert.deepEqual([run.renewed, run.rejected, run.unreachable], [1, 0, 0]);
});

test("the renewal marks an account without a session once Autodarts refuses its remembered password", async () => {
  const store = new FakeStore(adaPlaysWithPassword());
  const board = deps(store, new FakePage(null), router({ login: rejected }));
  await syncFromPage(board);
  const run = await refreshParked(board);
  assert.equal(find(run.state, "a")?.needsSignIn, true);
  assert.deepEqual([run.renewed, run.rejected, run.unreachable], [0, 1, 0]);
  // A marked account waits for a person: the next run asks Autodarts nothing.
  const again = await refreshParked(board);
  assert.deepEqual(
    [again.renewed, again.rejected, again.unreachable],
    [0, 0, 0],
  );
});

test("the renewal tries the remembered password of an account without a session again after a temporary problem", async () => {
  const store = new FakeStore(adaPlaysWithPassword());
  const board = deps(store, new FakePage(null), router({ login: offline }));
  await syncFromPage(board);
  const run = await refreshParked(board);
  assert.equal(find(run.state, "a")?.needsSignIn, false);
  assert.equal(find(run.state, "a")?.token, null);
  assert.deepEqual([run.renewed, run.rejected, run.unreachable], [0, 0, 1]);
});

test("after a sign-out on the page, the return after a break switches to a house account that remembers its password", async () => {
  const store = new FakeStore(adaPlaysWithPassword());
  const board = deps(store, new FakePage(null), router());
  await syncFromPage(board);
  const view = await readView(board);
  const tick = idleTick({
    venue: { ...NO_VENUE, idleMinutes: 5, house: "a" },
    profiles: view.profiles,
    unsaved: view.unsaved,
    lastActivity: 0,
    now: 60 * 60_000,
    matchRunning: false,
    lobbyOpen: false,
  });
  assert.deepEqual(tick.step, { kind: "switch", id: "a" });
});

test("signOutForNewAccount parks the account that was playing", async () => {
  const store = new FakeStore(setActive(EMPTY, ada));
  const page = new FakePage("pa");
  const { state } = await signOutForNewAccount(
    deps(store, page, renewing({ pa: ["a", "fa"] })),
  );
  assert.equal(find(state, "a")?.token, "fa");
  assert.equal(state.activeId, null);
  assert.equal(page.token, null);
});

test("signOutForNewAccount clears an empty page without parking", async () => {
  const page = new FakePage(null);
  const { state } = await signOutForNewAccount(
    deps(new FakeStore(EMPTY), page, router()),
  );
  assert.equal(state.activeId, null);
  assert.equal(page.clears, 1);
});

test("signOutForNewAccount waits ten minutes for the new account", async () => {
  const { state } = await signOutForNewAccount(
    deps(
      new FakeStore(setActive(EMPTY, ada)),
      new FakePage("pa"),
      renewing({ pa: ["a", "fa"] }),
    ),
  );
  assert.equal(state.addingUntil, 1000 + ADD_WINDOW_MS);
  assert.equal(ADD_WINDOW_MS, 600_000);
});

test("leaveDisplay parks the account that was playing and waits for no new one", async () => {
  const store = new FakeStore(setActive(EMPTY, ada));
  const page = new FakePage("pa");
  const { state } = await leaveDisplay(
    deps(store, page, renewing({ pa: ["a", "fa"] })),
  );
  assert.equal(find(state, "a")?.token, "fa");
  assert.equal(state.activeId, null);
  assert.equal(state.addingUntil, null);
  assert.equal(page.token, null);
  assert.deepEqual(store.state, state);
});

test("leaveDisplay ends a wait for a new account that nobody finished", async () => {
  // Someone signed in on the page while an account was being added, and walked away.
  const store = new FakeStore(startAdding(EMPTY, 5000));
  const page = new FakePage("unsaved");
  const { state } = await leaveDisplay(deps(store, page, router()));
  assert.equal(state.addingUntil, null);
  assert.equal(page.token, null);
});

test("adoptNewSignIn saves the session that the new account signs in with", async () => {
  const store = new FakeStore(park(EMPTY, bob, "tb", 0));
  const page = new FakePage("pb");
  const fetcher = router({
    refresh: () => Promise.resolve(sessionResponse("a", "fresh")),
  });
  await signOutForNewAccount(deps(store, page, fetcher));
  // Ada signs in on the page that the extension signed out.
  page.token = "in-page";
  const result = await adoptNewSignIn(deps(store, page, fetcher));
  assert.equal(result.kind, "saved");
  assert.equal(result.kind === "saved" ? result.identity.id : null, "a");
  assert.equal(result.state.activeId, "a");
  assert.equal(result.state.addingUntil, null);
  // The page stays signed in with the fresh token, and Bob stays parked.
  assert.equal(page.token, "fresh");
  assert.equal(find(store.state, "b")?.token, "tb");
});

test("adoptNewSignIn saves only the first new sign-in", async () => {
  const store = new FakeStore(startAdding(EMPTY, 2000));
  const page = new FakePage("in-page");
  const fetcher = counting(
    router({ refresh: () => Promise.resolve(sessionResponse("a", "fresh")) }),
  );
  assert.equal(
    (await adoptNewSignIn(deps(store, page, fetcher))).kind,
    "saved",
  );
  // Someone else signs in later on, while Ada is saved: that session stays unsaved.
  page.token = "someone-else";
  const later = await adoptNewSignIn(deps(store, page, fetcher));
  assert.equal(later.kind, "idle");
  assert.equal(fetcher.calls, 1);
  assert.equal(page.token, "someone-else");
});

test("adoptNewSignIn waits while the page has no session yet", async () => {
  const store = new FakeStore(startAdding(EMPTY, 2000));
  const fetcher = counting(router());
  const result = await adoptNewSignIn(deps(store, new FakePage(null), fetcher));
  assert.equal(result.kind, "waiting");
  assert.equal(result.state.addingUntil, 2000);
  assert.equal(fetcher.calls, 0);
  assert.equal(store.saves, 0);
});

test("adoptNewSignIn waits while the page can't be read", async () => {
  const store = new FakeStore(startAdding(EMPTY, 2000));
  const result = await adoptNewSignIn(
    deps(store, new FakePage("in-page", ["read"]), router()),
  );
  assert.equal(result.kind, "waiting");
  assert.equal(store.saves, 0);
});

test("adoptNewSignIn never saves a sign-in after the window", async () => {
  const store = new FakeStore(startAdding(EMPTY, 1000));
  const page = new FakePage("in-page");
  const fetcher = counting(router());
  const result = await adoptNewSignIn(deps(store, page, fetcher, () => 1000));
  assert.equal(result.kind, "idle");
  assert.equal(fetcher.calls, 0);
  assert.equal(page.token, "in-page");
  // The window is closed for good, so a clock set back can't open it again.
  assert.equal(store.state.addingUntil, null);
  assert.equal(
    (await adoptNewSignIn(deps(store, page, fetcher, () => 0))).kind,
    "idle",
  );
  assert.equal(store.saves, 1);
});

test("adoptNewSignIn does nothing while no account is being added", async () => {
  const store = new FakeStore(EMPTY);
  const fetcher = counting(router());
  const result = await adoptNewSignIn(
    deps(store, new FakePage("in-page"), fetcher),
  );
  assert.equal(result.kind, "idle");
  assert.equal(fetcher.calls, 0);
  assert.equal(store.saves, 0);
});

test("adoptNewSignIn reads the page only once it is ready", async () => {
  const store = new FakeStore(startAdding(EMPTY, 2000));
  // The page renews the token it started with while the extension waits for it.
  const page = new FakePage("started-with");
  const sent: string[] = [];
  const fetcher = router({
    refresh: (_url, init) => {
      sent.push(String(init.body));
      return Promise.resolve(sessionResponse("a", "fresh"));
    },
  });
  const ready = () => {
    page.token = "renewed";
    return Promise.resolve(true);
  };
  const result = await adoptNewSignIn(deps(store, page, fetcher), ready);
  assert.equal(result.kind, "saved");
  assert.ok(sent.every((body) => !body.includes("started-with")));
  assert.equal(page.clears, 0);
  assert.equal(page.token, "fresh");
});

test("adoptNewSignIn waits while the page isn't ready, as during a match", async () => {
  const store = new FakeStore(startAdding(EMPTY, 2000));
  const page = new FakePage("in-page");
  const fetcher = counting(router());
  const result = await adoptNewSignIn(deps(store, page, fetcher), () =>
    Promise.resolve(false),
  );
  assert.equal(result.kind, "waiting");
  assert.equal(fetcher.calls, 0);
  assert.equal(page.token, "in-page");
  assert.equal(store.saves, 0);
});

test("adoptNewSignIn keeps a session that the page renewed while it was read", async () => {
  const store = new FakeStore(startAdding(EMPTY, 2000));
  const page = new FakePage("t1");
  // The page sends T1 at the same moment, gets T2, and Autodarts turns the second T1 away.
  const fetcher = router({
    refresh: () => {
      page.token = "t2";
      return rejected();
    },
  });
  const result = await adoptNewSignIn(deps(store, page, fetcher));
  assert.equal(result.kind, "waiting");
  assert.equal(page.clears, 0);
  assert.equal(page.token, "t2");
  assert.equal(store.state.addingUntil, 2000);
});

test("adoptNewSignIn keeps waiting while Autodarts can't be reached", async () => {
  const store = new FakeStore(startAdding(EMPTY, 2000));
  const page = new FakePage("in-page");
  const result = await adoptNewSignIn(
    deps(store, page, router({ refresh: offline })),
  );
  assert.equal(result.kind, "waiting");
  assert.equal(store.state.addingUntil, 2000);
  assert.equal(page.token, "in-page");
});

test("adoptNewSignIn drops a dead session and keeps waiting for the next sign-in", async () => {
  const store = new FakeStore(startAdding(EMPTY, 2000));
  const page = new FakePage("dead");
  const result = await adoptNewSignIn(
    deps(store, page, router({ refresh: rejected })),
  );
  assert.equal(result.kind, "waiting");
  assert.equal(page.clears, 1);
  assert.equal(store.state.addingUntil, 2000);
});

test("adoptNewSignIn keeps the renewed token when the page can't take it", async () => {
  const store = new FakeStore(startAdding(EMPTY, 2000));
  const page = new FakePage("in-page", ["write"]);
  const fetcher = router({
    refresh: () => Promise.resolve(sessionResponse("a", "fresh")),
  });
  await assert.rejects(adoptNewSignIn(deps(store, page, fetcher)));
  assert.equal(find(store.state, "a")?.token, "fresh");
});

test("startAddingAccount waits for a new account without signing anyone out", async () => {
  const store = new FakeStore(EMPTY);
  const page = new FakePage("in-page");
  const state = await startAddingAccount(deps(store, page, router()));
  assert.equal(state.addingUntil, 1000 + ADD_WINDOW_MS);
  assert.equal(page.token, "in-page");
  assert.equal(page.clears, 0);
});

test("stopAddingAccount no longer waits for a new account", async () => {
  const store = new FakeStore(startAdding(EMPTY, 2000));
  const state = await stopAddingAccount(
    deps(store, new FakePage(null), router()),
  );
  assert.equal(state.addingUntil, null);
});

test("a switch to a saved account ends the adding", async () => {
  const store = new FakeStore(startAdding(park(EMPTY, ada, "ta", 0), 2000));
  const page = new FakePage(null);
  const result = await switchTo(
    deps(
      store,
      page,
      router({ refresh: () => Promise.resolve(sessionResponse("a", "fa")) }),
    ),
    "a",
  );
  assert.ok(result.ok);
  assert.equal(result.state.addingUntil, null);
});

test("signOutForNewAccount does not park a session it can't place", async () => {
  const store = new FakeStore(EMPTY);
  const page = new FakePage("orphan");
  const { state } = await signOutForNewAccount(deps(store, page, router()));
  assert.equal(state.profiles.length, 0);
  assert.equal(page.token, null);
});

/** Ada plays as far as the extension knows; Bob and Cy are parked, each with a session. */
function adaPlays() {
  return setActive(park(park(EMPTY, bob, "tb", 0), cy, "tc", 0), ada);
}

test("switchTo parks the session in the page with the account it belongs to, not the one that played last", async () => {
  // Ada played, and someone signed in as Cy right in the page.
  const store = new FakeStore(adaPlays());
  const page = new FakePage("pc");
  const result = await switchTo(
    deps(store, page, renewing({ tb: ["b", "fb"], pc: ["c", "fc"] })),
    "b",
  );
  assert.ok(result.ok);
  assert.equal(result.state.activeId, "b");
  assert.equal(page.token, "fb");
  assert.equal(find(result.state, "c")?.token, "fc");
  // Ada's session left the page with the sign-out there, so her tile says so.
  assert.equal(find(result.state, "a")?.token, null);
  assert.equal(find(result.state, "a")?.needsSignIn, true);
  assert.deepEqual(store.state, result.state);
});

test("signOutForNewAccount parks the session in the page with the account it belongs to", async () => {
  const store = new FakeStore(adaPlays());
  const page = new FakePage("pc");
  const result = await signOutForNewAccount(
    deps(store, page, renewing({ pc: ["c", "fc"] })),
  );
  assert.ok(result.ok);
  assert.equal(result.state.activeId, null);
  assert.equal(page.token, null);
  assert.equal(find(result.state, "c")?.token, "fc");
  assert.equal(find(result.state, "a")?.needsSignIn, true);
  assert.equal(result.state.addingUntil, 1000 + ADD_WINDOW_MS);
  assert.deepEqual(store.state, result.state);
});

test("leaveDisplay parks the session in the page with the account it belongs to", async () => {
  const store = new FakeStore(adaPlays());
  const page = new FakePage("pc");
  const result = await leaveDisplay(
    deps(store, page, renewing({ pc: ["c", "fc"] })),
  );
  assert.ok(result.ok);
  assert.equal(page.token, null);
  assert.equal(find(result.state, "c")?.token, "fc");
  assert.equal(find(result.state, "a")?.needsSignIn, true);
});

test("the session of the page brings its account up to date, and a tile that needed a sign-in no longer does", async () => {
  const state = endSession(
    park(setActive(EMPTY, ada), { ...cy, name: "Old name" }, "tc", 0),
    "c",
  );
  const store = new FakeStore(state);
  const result = await signOutForNewAccount(
    deps(store, new FakePage("pc"), renewing({ pc: ["c", "fc"] })),
  );
  const saved = find(result.state, "c");
  assert.notEqual(saved?.name, "Old name");
  assert.equal(saved?.token, "fc");
  assert.equal(saved?.needsSignIn, false);
});

test("a session in the page that no account keeps is not saved at a switch or a sign-out", async () => {
  // A guest signed in right in the page: a sign-in is saved only with a tap.
  for (const leave of [
    (board: Deps) => switchTo(board, "b"),
    signOutForNewAccount,
    leaveDisplay,
  ]) {
    const store = new FakeStore(adaPlays());
    const page = new FakePage("guest");
    const result = await leave(
      deps(store, page, renewing({ tb: ["b", "fb"], guest: ["g", "fg"] })),
    );
    assert.ok(result.ok);
    assert.equal(find(result.state, "g"), undefined);
    assert.equal(result.state.profiles.length, 3);
    assert.equal(find(result.state, "a")?.needsSignIn, true);
    assert.notEqual(page.token, "guest");
    assert.ok(
      result.state.profiles.every(({ token }) => token !== "guest"),
      "nothing keeps the session of the guest",
    );
  }
});

test("a tap on the account whose session is in the page plays that account", async () => {
  const store = new FakeStore(adaPlays());
  const page = new FakePage("pc");
  const result = await switchTo(
    deps(store, page, renewing({ tc: ["c", "fc"], pc: ["c", "fp"] })),
    "c",
  );
  assert.ok(result.ok);
  assert.equal(result.state.activeId, "c");
  assert.equal(page.token, "fc");
  assert.equal(find(result.state, "c")?.token, null);
  assert.equal(find(result.state, "a")?.needsSignIn, true);
});

test("an ordinary switch parks a fresh session of the account that played", async () => {
  const store = new FakeStore(adaPlays());
  const page = new FakePage("pa");
  const result = await switchTo(
    deps(store, page, renewing({ tb: ["b", "fb"], pa: ["a", "fa"] })),
    "b",
  );
  assert.equal(find(result.state, "a")?.token, "fa");
  assert.equal(find(result.state, "a")?.needsSignIn, false);
  assert.equal(find(result.state, "a")?.refreshedAt, 1000);
  assert.equal(page.token, "fb");
});

test("a failed tap spends no token of the page", async () => {
  for (const [answers, reason] of [
    [renewing({ pa: ["a", "fa"] }), "signin"],
    [renewing({ tb: "offline", pa: ["a", "fa"] }), "unreachable"],
  ] as const) {
    const store = new FakeStore(adaPlays());
    const page = new FakePage("pa");
    const fetcher = counting(answers);
    const result = await switchTo(deps(store, page, fetcher), "b");
    assert.equal(result.reason, reason);
    assert.equal(
      fetcher.calls,
      1,
      "only the token of the account that comes on",
    );
    assert.equal(page.token, "pa");
    assert.equal(page.writes.length, 0);
    assert.equal(result.state.activeId, "a");
  }
});

test("switchTo changes nothing in the page when Autodarts stops answering for its session", async () => {
  const store = new FakeStore(adaPlays());
  const page = new FakePage("pa");
  const result = await switchTo(
    deps(store, page, renewing({ tb: ["b", "fb"], pa: "offline" })),
    "b",
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "unreachable");
  assert.equal(page.token, "pa");
  assert.equal(page.writes.length, 0);
  assert.equal(store.state.activeId, "a");
  // The fresh token of the account that was coming on is kept, for the next tap.
  assert.equal(find(store.state, "b")?.token, "fb");
});

test("a sign-out waits while Autodarts can't say whose session is in the page", async () => {
  for (const leave of [signOutForNewAccount, leaveDisplay]) {
    const before = adaPlays();
    const store = new FakeStore(before);
    const page = new FakePage("pa");
    const result = await leave(deps(store, page, renewing({ pa: "offline" })));
    assert.equal(result.ok, false);
    assert.equal(result.reason, "unreachable");
    assert.equal(page.token, "pa");
    assert.equal(page.clears, 0);
    assert.deepEqual(store.state, before);
    assert.equal(store.saves, 0);
  }
});

test("a session in the page that Autodarts refuses is parked nowhere, and the page moves on", async () => {
  const store = new FakeStore(adaPlays());
  const page = new FakePage("dead");
  const result = await switchTo(
    deps(store, page, renewing({ tb: ["b", "fb"] })),
    "b",
  );
  assert.ok(result.ok);
  assert.equal(page.token, "fb");
  assert.equal(find(result.state, "a")?.token, null);
  assert.equal(find(result.state, "a")?.needsSignIn, true);

  const signedOut = new FakeStore(adaPlays());
  const stale = new FakePage("dead");
  const out = await signOutForNewAccount(deps(signedOut, stale, renewing({})));
  assert.ok(out.ok);
  assert.equal(stale.token, null);
  assert.equal(find(out.state, "a")?.needsSignIn, true);
});

test("an account that remembers its password and lost its session on the page is left ready, and the renewal signs it in", async () => {
  const withPassword = () =>
    rememberCredentials(adaPlays(), "a", { username: "ada", password: "pw" });
  // Someone signed in as Cy right in the page, and then the page's session is refused.
  for (const [token, sessions] of [
    ["pc", { tb: ["b", "fb"], pc: ["c", "fc"] }],
    ["dead", { tb: ["b", "fb"] }],
  ] as const) {
    const store = new FakeStore(withPassword());
    const result = await switchTo(
      deps(store, new FakePage(token), renewing(sessions)),
      "b",
    );
    assert.ok(result.ok);
    assert.equal(find(result.state, "a")?.token, null);
    assert.equal(find(result.state, "a")?.needsSignIn, false, token);
  }
  const store = new FakeStore(withPassword());
  const board = deps(
    store,
    new FakePage("dead"),
    router({
      refresh: rejected,
      login: () => Promise.resolve(sessionResponse("a", "fa")),
    }),
  );
  const out = await signOutForNewAccount(board);
  assert.ok(out.ok);
  assert.equal(find(out.state, "a")?.needsSignIn, false);
  const run = await refreshParked({
    ...board,
    fetcher: router({
      refresh: renewing({ tb: ["b", "fb"], tc: ["c", "fc"] }),
      login: () => Promise.resolve(sessionResponse("a", "fa")),
    }),
  });
  assert.equal(find(run.state, "a")?.token, "fa");
  assert.deepEqual([run.renewed, run.rejected, run.unreachable], [3, 0, 0]);
});

test("the token of the page is read again right before it is sent, so one the page renewed meanwhile isn't sent", async () => {
  const store = new FakeStore(adaPlays());
  const page = new FakePage("pa-1");
  const sent: string[] = [];
  const answers = renewing({ tb: ["b", "fb"], "pa-2": ["a", "fa"] });
  const result = await switchTo(
    deps(store, page, (url, init) => {
      const { refresh_token: token } = JSON.parse(String(init.body)) as {
        refresh_token: string;
      };
      sent.push(token);
      // The page renews its session while Bob's renewal is on its way.
      page.token = "pa-2";
      return answers(url, init);
    }),
    "b",
  );
  assert.deepEqual(sent, ["tb", "pa-2"]);
  assert.equal(find(result.state, "a")?.token, "fa");
});

test("a session that the page renewed while Autodarts was asked about it is the one that gets parked", async () => {
  const store = new FakeStore(adaPlays());
  const page = new FakePage("pa-1");
  const answers = renewing({ "pa-2": ["a", "fa"] });
  const result = await signOutForNewAccount(
    deps(store, page, (url, init) => {
      // The page got there first: Autodarts turns the old token away.
      page.token = "pa-2";
      return answers(url, init);
    }),
  );
  assert.ok(result.ok);
  assert.equal(find(result.state, "a")?.token, "fa");
  assert.equal(find(result.state, "a")?.needsSignIn, false);
  assert.equal(page.token, null);
});

test("a page that signed out while Autodarts was asked about its session leaves the account needing a new one", async () => {
  const store = new FakeStore(adaPlays());
  const page = new FakePage("pa");
  const result = await signOutForNewAccount(
    deps(store, page, () => {
      page.token = null;
      return rejected();
    }),
  );
  assert.ok(result.ok);
  assert.equal(find(result.state, "a")?.needsSignIn, true);
});

test("a switch that runs again after the page failed spends no token twice and loses no session", async () => {
  const autodarts = new FakeAutodarts();
  const store = new FakeStore(
    park(setActive(EMPTY, ada), bob, autodarts.issue("b"), 0),
  );
  const page = new FakePage(autodarts.issue("a"), ["write"]);
  const board = deps(store, page, autodarts.fetch);
  await assert.rejects(switchTo(board, "b"));
  // The session of the page is spent now, and its fresh token is kept with Ada.
  assert.equal(store.state.activeId, null);
  assert.equal(find(store.state, "a")?.token, autodarts.live.get("a"));
  assert.equal(find(store.state, "b")?.token, autodarts.live.get("b"));

  // The tab that the retry reloads starts Autodarts, which renews the session that it
  // finds in localStorage at once: Ada's spent token must not be there.
  const reloaded = page.load();
  await startAutodarts(reloaded, autodarts);
  assert.equal(autodarts.reuses, 0);
  assert.ok(autodarts.live.has("a"), "Ada's parked session lives");
  const again = await switchTo({ ...board, page: reloaded }, "b");
  assert.ok(again.ok);
  assert.equal(reloaded.token, autodarts.live.get("b"));
  assert.equal(find(again.state, "a")?.token, autodarts.live.get("a"));
  assert.equal(autodarts.reuses, 0);
});

test("a sign-out that runs again after the page failed loses no session either", async () => {
  const autodarts = new FakeAutodarts();
  const store = new FakeStore(setActive(EMPTY, ada));
  const page = new FakePage(autodarts.issue("a"), ["clear"]);
  const board = deps(store, page, autodarts.fetch);
  await assert.rejects(signOutForNewAccount(board));
  const reloaded = page.load();
  await startAutodarts(reloaded, autodarts);
  const again = await signOutForNewAccount({ ...board, page: reloaded });
  assert.ok(again.ok);
  assert.equal(reloaded.token, null);
  assert.equal(find(again.state, "a")?.token, autodarts.live.get("a"));
  assert.equal(autodarts.reuses, 0);
});

test("a switch that can't reach Autodarts gives the page its session back, and a page gone meanwhile fails nothing more", async () => {
  for (const failing of [[], ["release"]] as const) {
    const store = new FakeStore(park(setActive(EMPTY, ada), bob, "tb", 0));
    const page = new FakePage("ta", [...failing]);
    const result = await switchTo(
      deps(store, page, renewing({ tb: ["b", "fb"], ta: "offline" })),
      "b",
    );
    assert.deepEqual([result.ok, result.reason], [false, "unreachable"]);
    assert.equal(page.token, "ta");
    // A page that loads now keeps the session that Autodarts never got; without the
    // page to say so, nobody knows, and the next page starts without it.
    assert.equal(page.load().token, failing.length === 0 ? "ta" : null);
  }
});

/** What Autodarts does as its page starts: it renews the session that it finds, if any. */
async function startAutodarts(
  page: FakePage,
  autodarts: FakeAutodarts,
): Promise<void> {
  if (page.token === null) {
    return;
  }
  try {
    page.token = (
      await refreshSession(autodarts.fetch, page.token)
    ).refreshToken;
  } catch {
    page.token = null;
  }
}

test("refreshParked renews a parked session", async () => {
  const store = new FakeStore(park(EMPTY, ada, "ta", 0));
  const run = await refreshParked(
    deps(
      store,
      new FakePage(null),
      router({
        refresh: () => Promise.resolve(sessionResponse("a", "rolled")),
      }),
    ),
  );
  assert.equal(find(run.state, "a")?.token, "rolled");
  assert.equal(find(run.state, "a")?.refreshedAt, 1000);
  assert.deepEqual([run.renewed, run.rejected, run.unreachable], [1, 0, 0]);
});

test("refreshParked marks a parked account whose session died", async () => {
  const store = new FakeStore(park(EMPTY, ada, "ta", 0));
  const run = await refreshParked(
    deps(store, new FakePage(null), router({ refresh: rejected })),
  );
  assert.equal(find(run.state, "a")?.needsSignIn, true);
  assert.equal(find(run.state, "a")?.token, null);
  assert.deepEqual([run.renewed, run.rejected, run.unreachable], [0, 1, 0]);
});

test("refreshParked counts every parked account that Autodarts turns away", async () => {
  const store = new FakeStore(park(park(EMPTY, ada, "ta", 0), bob, "tb", 0));
  const run = await refreshParked(
    deps(store, new FakePage(null), router({ refresh: rejected })),
  );
  assert.deepEqual([run.renewed, run.rejected, run.unreachable], [0, 2, 0]);
  assert.equal(
    run.state.profiles.every((profile) => profile.needsSignIn),
    true,
  );
});

test("refreshParked keeps a parked session on a temporary problem and marks since when renewing fails", async () => {
  const store = new FakeStore(park(EMPTY, ada, "ta", 0));
  const run = await refreshParked(
    deps(store, new FakePage(null), router({ refresh: offline })),
  );
  assert.equal(find(run.state, "a")?.token, "ta");
  assert.equal(find(run.state, "a")?.renewalFailedAt, 1000);
  assert.equal(
    find(store.state, "a")?.renewalFailedAt,
    1000,
    "the mark is saved",
  );
  assert.deepEqual([run.renewed, run.rejected, run.unreachable], [0, 0, 1]);
});

test("refreshParked keeps a parked session that Autodarts can't read the request for, and counts it as unreachable", async () => {
  const store = new FakeStore(park(park(EMPTY, ada, "ta", 0), bob, "tb", 0));
  const run = await refreshParked(
    deps(store, new FakePage(null), router({ refresh: misread })),
  );
  for (const [id, token] of [
    ["a", "ta"],
    ["b", "tb"],
  ] as const) {
    assert.equal(find(store.state, id)?.token, token, "the token is kept");
    assert.equal(find(store.state, id)?.needsSignIn, false);
    assert.equal(find(store.state, id)?.renewalFailedAt, 1000);
  }
  assert.deepEqual(
    [run.renewed, run.rejected, run.unreachable, run.requestRefused],
    [0, 0, 2, 2],
  );
});

test("refreshParked tries no remembered password when Autodarts refused the request of the renewal itself", async () => {
  const logins: string[] = [];
  const store = new FakeStore(
    rememberCredentials(park(EMPTY, ada, "ta", 0), "a", {
      username: "ada",
      password: "pw",
    }),
  );
  const run = await refreshParked(
    deps(
      store,
      new FakePage(null),
      router({
        refresh: misread,
        login: () => {
          logins.push("ada");
          return Promise.resolve(sessionResponse("a", "fresh"));
        },
      }),
    ),
  );
  assert.deepEqual(logins, []);
  assert.equal(find(store.state, "a")?.token, "ta");
  assert.deepEqual([run.unreachable, run.requestRefused], [1, 1]);
});

test("refreshParked keeps a remembered password that the sign-in can't read the request for", async () => {
  const store = new FakeStore(
    rememberCredentials(park(EMPTY, ada, "dead", 0), "a", {
      username: "ada",
      password: "pw",
    }),
  );
  const run = await refreshParked(
    deps(
      store,
      new FakePage(null),
      router({ refresh: rejected, login: recorded(LOGIN_WITHOUT_PASSWORD) }),
    ),
  );
  assert.equal(find(store.state, "a")?.needsSignIn, false);
  assert.equal(find(store.state, "a")?.credentials?.password, "pw");
  assert.deepEqual(
    [run.renewed, run.rejected, run.unreachable, run.requestRefused],
    [0, 0, 1, 1],
  );
});

test("refreshParked still ends a session that Autodarts refuses as dead with 401", async () => {
  const store = new FakeStore(park(EMPTY, ada, "ta", 0));
  const run = await refreshParked(
    deps(store, new FakePage(null), router({ refresh: rejected })),
  );
  assert.equal(find(store.state, "a")?.token, null);
  assert.equal(find(store.state, "a")?.needsSignIn, true);
  assert.deepEqual(
    [run.renewed, run.rejected, run.unreachable, run.requestRefused],
    [0, 1, 0, 0],
  );
});

test("refreshParked keeps the time of the first failure of a row and clears it once renewing works", async () => {
  const store = new FakeStore(park(EMPTY, ada, "ta", 0));
  await refreshParked(
    deps(store, new FakePage(null), router({ refresh: offline }), () => 1000),
  );
  const saves = store.saves;
  const again = await refreshParked(
    deps(store, new FakePage(null), router({ refresh: offline }), () => 2000),
  );
  assert.equal(find(again.state, "a")?.renewalFailedAt, 1000);
  assert.equal(
    store.saves,
    saves,
    "a failure that is marked already saves nothing",
  );
  const back = await refreshParked(
    deps(
      store,
      new FakePage(null),
      router({
        refresh: () => Promise.resolve(sessionResponse("a", "rolled")),
      }),
      () => 3000,
    ),
  );
  assert.equal(find(back.state, "a")?.renewalFailedAt, null);
  assert.deepEqual(
    (await readView(deps(store, new FakePage(null), router()))).profiles[0]
      ?.renewalFailingSince,
    null,
  );
});

test("the popup shows since when the renewal of a parked account fails", async () => {
  const store = new FakeStore(park(EMPTY, ada, "ta", 0));
  await refreshParked(
    deps(store, new FakePage(null), router({ refresh: offline }), () => 1000),
  );
  const view = await readView(deps(store, new FakePage(null), router()));
  assert.equal(view.profiles[0]?.renewalFailingSince, 1000);
});

test("refreshParked with nothing parked changes nothing", async () => {
  const store = new FakeStore(EMPTY);
  const run = await refreshParked(deps(store, new FakePage(null), router()));
  assert.equal(store.saves, 0);
  assert.deepEqual([run.renewed, run.rejected, run.unreachable], [0, 0, 0]);
});

test("refreshParked leaves the account that is playing to the page", async () => {
  const store = new FakeStore(setActive(park(EMPTY, ada, "ta", 0), ada));
  const run = await refreshParked(deps(store, new FakePage("live"), router()));
  assert.equal(run.state.activeId, "a");
});

test("refreshParked keeps each fresh token as soon as it arrives", async () => {
  const store = new FakeStore(park(park(EMPTY, ada, "ta", 0), bob, "tb", 0));
  let askedForBob = (): void => {};
  const bobAsked = new Promise<void>((resolve) => {
    askedForBob = resolve;
  });
  const fetcher = router({
    refresh: (_url, init) => {
      if (String(init.body).includes('"ta"')) {
        return Promise.resolve(sessionResponse("a", "fa"));
      }
      askedForBob();
      // The worker stops before Bob's answer arrives.
      return new Promise<Response>(() => {});
    },
  });
  void refreshParked(deps(store, new FakePage(null), fetcher));
  await bobAsked;
  // Ada's token rotated at Autodarts, so it is saved before Bob's turn.
  assert.equal(find(store.state, "a")?.token, "fa");
});

test("readView shows the accounts and whether the page holds a session", async () => {
  const store = new FakeStore(park(EMPTY, ada, "ta", 0));
  const view = await readView(deps(store, new FakePage("someone"), router()));
  assert.deepEqual(
    view.profiles.map((profile) => profile.id),
    ["a"],
  );
  assert.equal(view.unsaved, true);
});

test("readView says while an account is being added", async () => {
  const store = new FakeStore(startAdding(EMPTY, 2000));
  assert.equal(
    (await readView(deps(store, new FakePage(null), router()))).adding,
    true,
  );
  assert.equal(
    (await readView(deps(store, new FakePage(null), router(), () => 2000)))
      .adding,
    false,
  );
});

test("readView counts a missing page as no session", async () => {
  const store = new FakeStore(EMPTY);
  const view = await readView(
    deps(store, new FakePage(null, ["read"]), router()),
  );
  assert.equal(view.unsaved, false);
});

test("edit changes the saved accounts", async () => {
  const store = new FakeStore(park(EMPTY, ada, "ta", 0));
  const state = await edit(
    deps(store, new FakePage(null), router()),
    (current) =>
      rememberCredentials(current, "a", { username: "ada", password: "pw" }),
  );
  assert.equal(find(store.state, "a")?.credentials?.password, "pw");
  assert.equal(state, store.state);
});

/**
 * A race on a shared display: Ada plays, Bob and Cy are parked, and each of them has
 * a working session at a fake Autodarts that rotates every token it renews.
 */
function race(): {
  autodarts: FakeAutodarts;
  store: FakeStore;
  page: FakePage;
  deps: Deps;
} {
  const autodarts = new FakeAutodarts();
  const state = setActive(
    park(
      park(EMPTY, bob, autodarts.issue("b"), 0),
      cy,
      autodarts.issue("c"),
      0,
    ),
    ada,
  );
  const store = new FakeStore(state);
  const page = new FakePage(autodarts.issue("a"));
  return { autodarts, store, page, deps: deps(store, page, autodarts.fetch) };
}

/**
 * No session was lost: every account's working token is where the extension keeps it,
 * in the page for the account that plays and parked for every other one, and no token
 * was ever spent twice.
 */
function assertEverySessionKept({
  autodarts,
  store,
  page,
}: ReturnType<typeof race>): void {
  assert.equal(autodarts.reuses, 0, "no token was spent twice");
  for (const profile of store.state.profiles) {
    const kept =
      profile.id === store.state.activeId ? page.token : profile.token;
    assert.equal(
      kept,
      autodarts.live.get(profile.id),
      `the session of ${profile.name} is kept`,
    );
    assert.equal(
      profile.needsSignIn,
      false,
      `${profile.name} needs no new sign-in`,
    );
  }
}

test("a double tap on a player renews its token once and keeps every session", async () => {
  const board = race();
  const [first, second] = await Promise.all([
    switchTo(board.deps, "b"),
    switchTo(board.deps, "b"),
  ]);
  assert.ok(first.ok);
  assert.ok(second.ok);
  // Bob's token, and the one of the page as it leaves: the second tap sends nothing.
  assert.equal(board.autodarts.refreshes.length, 2);
  assert.equal(board.store.state.activeId, "b");
  assert.deepEqual(board.page.writes, [board.autodarts.live.get("b")]);
  assertEverySessionKept(board);
});

test("a switch during the background renewal keeps every rotated token", async () => {
  const board = race();
  const renewal = refreshParked(board.deps);
  // Bob's renewal is on its way when someone taps Cy.
  await board.autodarts.requested();
  const switched = await switchTo(board.deps, "c");
  const run = await renewal;
  assert.ok(switched.ok);
  // Cy left the parked accounts on the way, so the run counts Bob alone.
  assert.deepEqual([run.renewed, run.rejected, run.unreachable], [1, 0, 0]);
  assert.equal(board.store.state.activeId, "c");
  // Bob was renewed, Cy came onto the page, the session of the page left it for the
  // account that played, and the renewal left Cy to the page.
  assert.equal(board.autodarts.refreshes.length, 3);
  assertEverySessionKept(board);
});

test("a sign-out right after a switch parks the player who just came on", async () => {
  const board = race();
  const [switched] = await Promise.all([
    switchTo(board.deps, "b"),
    signOutForNewAccount(board.deps),
  ]);
  assert.ok(switched.ok);
  // The taps run in their order: Bob comes on, and the sign-out then parks him.
  assert.equal(board.store.state.activeId, null);
  assert.equal(board.page.token, null);
  assert.equal(
    find(board.store.state, "b")?.token,
    board.autodarts.live.get("b"),
  );
  assertEverySessionKept(board);
});

test("two loads of the page save the new account once and spend its token once", async () => {
  const autodarts = new FakeAutodarts();
  const store = new FakeStore(startAdding(EMPTY, 2000));
  const page = new FakePage(autodarts.issue("a"));
  const board = deps(store, page, autodarts.fetch);
  const [first, second] = await Promise.all([
    adoptNewSignIn(board),
    adoptNewSignIn(board),
  ]);
  assert.deepEqual([first.kind, second.kind], ["saved", "idle"]);
  assert.equal(autodarts.refreshes.length, 1);
  assert.equal(autodarts.reuses, 0);
  assert.equal(page.token, autodarts.live.get("a"));
  assert.equal(store.state.activeId, "a");
});

test("a password remembered during a switch is kept", async () => {
  const board = race();
  await Promise.all([
    switchTo(board.deps, "b"),
    edit(board.deps, (state) =>
      rememberCredentials(state, "c", { username: "cy", password: "pw" }),
    ),
  ]);
  assert.equal(board.store.state.activeId, "b");
  assert.equal(find(board.store.state, "c")?.credentials?.username, "cy");
  assertEverySessionKept(board);
});

/** A sign-in service that ends sessions and keeps what it was asked, by the token. */
function signOuts(
  answer: (token: string) => Promise<Response> = () =>
    Promise.resolve(new Response(null, { status: 204 })),
): Deps["fetcher"] & { ended: string[] } {
  const ended: string[] = [];
  const fetcher = router({
    logout: (_url, init) => {
      const { refresh_token: token } = JSON.parse(String(init.body)) as {
        refresh_token: string;
      };
      ended.push(token);
      return answer(token);
    },
  });
  return Object.assign(fetcher, { ended });
}

/** Ada plays on the page; Bob is parked, and Cy is parked with a remembered password. */
function display(): FakeStore {
  return new FakeStore(
    rememberCredentials(
      park(park(setActive(EMPTY, ada), bob, "tb", 0), cy, "tc", 0),
      "c",
      { username: "cy", password: "pw-cy" },
    ),
  );
}

/** Whether a removal forgot the accounts, and whether Autodarts ended their sessions. */
function outcome(removal: Removal): { kind: string; ended?: boolean } {
  return removal.kind === "removed"
    ? { kind: removal.kind, ended: removal.ended }
    : { kind: removal.kind };
}

test("removeAccount ends the parked session at Autodarts before it forgets the account", async () => {
  const store = display();
  const page = new FakePage("ta");
  let savesAtSignOut = -1;
  const fetcher = signOuts(() => {
    savesAtSignOut = store.saves;
    return Promise.resolve(new Response(null, { status: 204 }));
  });
  let asked = false;
  const removal = await removeAccount(deps(store, page, fetcher), "b", () => {
    asked = true;
    return Promise.resolve(true);
  });
  assert.deepEqual(fetcher.ended, ["tb"]);
  assert.equal(savesAtSignOut, 0, "the session ends before the account goes");
  assert.deepEqual(outcome(removal), { kind: "removed", ended: true });
  assert.equal(find(store.state, "b"), undefined);
  assert.equal(store.state, removal.state);
  // Ada plays on: the page is neither asked nor changed.
  assert.equal(asked, false);
  assert.equal(page.token, "ta");
  assert.equal(page.clears, 0);
  assert.equal(store.state.activeId, "a");
});

test("removeAccount forgets the account when Autodarts can't be reached, and says so", async () => {
  for (const answer of [
    () => Promise.reject(new TypeError("Failed to fetch")),
    () => Promise.resolve(jsonResponse({}, 503)),
  ]) {
    const store = display();
    const fetcher = signOuts(answer);
    const removal = await removeAccount(
      deps(store, new FakePage("ta"), fetcher),
      "c",
    );
    assert.deepEqual(fetcher.ended, ["tc"]);
    assert.deepEqual(outcome(removal), { kind: "removed", ended: false });
    // The account and its remembered password are gone all the same.
    assert.equal(find(store.state, "c"), undefined);
    assert.equal(store.saves, 1);
  }
});

/** Ada plays on the page, as far as the extension knows, and Bob is parked. */
function adaOnThePage(autodarts: FakeAutodarts): FakeStore {
  return new FakeStore(
    park(setActive(EMPTY, ada), bob, autodarts.issue("b"), 0),
  );
}

test("removeAccount of the account that plays signs the page out and ends the session it held", async () => {
  const autodarts = new FakeAutodarts();
  const store = adaOnThePage(autodarts);
  const page = new FakePage(autodarts.issue("a"));
  let asked = 0;
  const removal = await removeAccount(
    deps(store, page, autodarts.fetch),
    "a",
    () => {
      asked += 1;
      return Promise.resolve(true);
    },
  );
  assert.equal(asked, 1);
  // Autodarts named Ada as the owner of the session in the page, which then ended.
  assert.equal(autodarts.refreshes.length, 1);
  assert.equal(autodarts.live.has("a"), false);
  assert.equal(page.clears, 1);
  assert.equal(page.token, null);
  assert.deepEqual(outcome(removal), { kind: "removed", ended: true });
  assert.equal(find(store.state, "a"), undefined);
  assert.equal(store.state.activeId, null);
  // The parked account keeps its session.
  assert.equal(find(store.state, "b")?.token, autodarts.live.get("b"));
  assert.equal(autodarts.reuses, 0);
});

test("removeAccount of the account that plays leaves the session of another account in the page, fresh", async () => {
  // Ada signed out on the Autodarts page and Zoe signed in there: Ada's tile still plays.
  const autodarts = new FakeAutodarts();
  const store = adaOnThePage(autodarts);
  const page = new FakePage(autodarts.issue("z"));
  const removal = await removeAccount(deps(store, page, autodarts.fetch), "a");
  assert.deepEqual(outcome(removal), { kind: "removed", ended: true });
  assert.equal(page.token, autodarts.live.get("z"), "Zoe plays on");
  assert.equal(page.clears, 0);
  assert.deepEqual(autodarts.logouts, []);
  assert.equal(find(store.state, "a"), undefined);
  assert.equal(store.state.activeId, null);
  assert.equal(autodarts.reuses, 0);
});

test("removeAccount of the account that plays lets an account with a tile that signed in on the page play on", async () => {
  const autodarts = new FakeAutodarts();
  const store = adaOnThePage(autodarts);
  // Bob signed in right on the page, which ended nothing of his.
  const page = new FakePage(autodarts.issue("b"));
  const removal = await removeAccount(deps(store, page, autodarts.fetch), "a");
  assert.deepEqual(outcome(removal), { kind: "removed", ended: true });
  assert.equal(page.token, autodarts.live.get("b"));
  assert.equal(store.state.activeId, "b");
  assert.equal(find(store.state, "b")?.token, null);
  assert.deepEqual(autodarts.logouts, []);
});

test("removeAccount of the account that plays leaves the page as it is while Autodarts can't be reached, and says so", async () => {
  const store = display();
  const page = new FakePage("ta");
  const removal = await removeAccount(
    deps(store, page, router({ refresh: offline })),
    "a",
  );
  assert.deepEqual(outcome(removal), { kind: "removed", ended: false });
  assert.equal(page.token, "ta");
  assert.equal(page.clears, 0);
  assert.deepEqual(page.writes, []);
  assert.equal(page.load().token, "ta", "a page that loads keeps the session");
  assert.equal(find(store.state, "a"), undefined);
});

test("removeAccount of the account that plays ends nothing more when the session in the page is over, and the page lets the spent token go", async () => {
  const autodarts = new FakeAutodarts();
  const store = adaOnThePage(autodarts);
  const page = new FakePage("dead");
  const removal = await removeAccount(deps(store, page, autodarts.fetch), "a");
  assert.deepEqual(outcome(removal), { kind: "removed", ended: true });
  assert.equal(page.clears, 1);
  assert.equal(page.token, null);
  assert.deepEqual(autodarts.logouts, []);
  assert.equal(find(store.state, "a"), undefined);
  assert.equal(find(store.state, "b")?.token, autodarts.live.get("b"));
});

test("removeAccount of the account that plays changes nothing while the page may not sign out", async () => {
  const store = display();
  const page = new FakePage("ta");
  const fetcher = counting(signOuts());
  const removal = await removeAccount(deps(store, page, fetcher), "a", () =>
    Promise.resolve(false),
  );
  assert.deepEqual(outcome(removal), { kind: "match" });
  assert.equal(removal.state, store.state);
  assert.equal(fetcher.calls, 0, "no session ended");
  assert.equal(store.saves, 0);
  assert.equal(page.clears, 0);
  assert.equal(find(store.state, "a")?.id, "a");
});

test("removeAccount of the account that plays fails without a page before anything changes", async () => {
  const store = display();
  const page = new FakePage("ta", ["read"]);
  const fetcher = counting(signOuts());
  await assert.rejects(
    removeAccount(deps(store, page, fetcher), "a"),
    /no page/,
  );
  assert.equal(fetcher.calls, 0);
  assert.equal(store.saves, 0);
  assert.equal(find(store.state, "a")?.id, "a");
});

test("removeAccount of the account that plays, after the page signed out by itself, ends nothing more", async () => {
  const store = display();
  const page = new FakePage(null);
  const fetcher = counting(signOuts());
  const removal = await removeAccount(deps(store, page, fetcher), "a");
  assert.deepEqual(outcome(removal), { kind: "removed", ended: true });
  assert.equal(fetcher.calls, 0);
  assert.equal(page.clears, 0);
  assert.equal(find(store.state, "a"), undefined);
});

test("removeAccount of an account without a session ends nothing, and one that is gone changes nothing", async () => {
  const store = new FakeStore(endSession(park(EMPTY, bob, "tb", 0), "b"));
  const fetcher = counting(signOuts());
  const board = deps(store, new FakePage(null), fetcher);
  assert.deepEqual(outcome(await removeAccount(board, "b")), {
    kind: "removed",
    ended: true,
  });
  assert.deepEqual(store.state.profiles, []);
  assert.deepEqual(outcome(await removeAccount(board, "b")), {
    kind: "removed",
    ended: true,
  });
  assert.equal(fetcher.calls, 0);
  assert.equal(store.saves, 1);
});

test("forgetAll ends every session, signs the page out, forgets every account and then wipes", async () => {
  const autodarts = new FakeAutodarts();
  const store = new FakeStore(
    park(adaOnThePage(autodarts).state, cy, autodarts.issue("c"), 0),
  );
  const page = new FakePage(autodarts.issue("a"));
  const wipes: number[] = [];
  const removal = await forgetAll(deps(store, page, autodarts.fetch), () => {
    wipes.push(store.state.profiles.length);
    return Promise.resolve();
  });
  assert.equal(autodarts.logouts.length, 3);
  assert.equal(autodarts.live.size, 0, "every session ended");
  assert.equal(autodarts.reuses, 0);
  assert.equal(page.token, null);
  assert.equal(page.clears, 1);
  assert.deepEqual(store.state, EMPTY);
  assert.deepEqual(wipes, [0], "the wipe runs once the accounts are gone");
  assert.deepEqual(outcome(removal), { kind: "removed", ended: true });
});

test("forgetAll forgets everything when a session can't be ended, and says so", async () => {
  const store = display();
  const fetcher = signOuts((token) =>
    token === "tb"
      ? Promise.reject(new TypeError("Failed to fetch"))
      : Promise.resolve(new Response(null, { status: 204 })),
  );
  let wiped = false;
  const removal = await forgetAll(
    deps(store, new FakePage(null), fetcher),
    () => {
      wiped = true;
      return Promise.resolve();
    },
  );
  assert.equal(fetcher.ended.length, 2, "each session is asked to end");
  assert.deepEqual(outcome(removal), { kind: "removed", ended: false });
  assert.deepEqual(store.state, EMPTY);
  assert.ok(wiped);
});

test("forgetAll changes nothing while the page may not sign out", async () => {
  const store = display();
  const page = new FakePage("ta");
  const fetcher = counting(signOuts());
  let wiped = false;
  const removal = await forgetAll(
    deps(store, page, fetcher),
    () => {
      wiped = true;
      return Promise.resolve();
    },
    () => Promise.resolve(false),
  );
  assert.deepEqual(outcome(removal), { kind: "match" });
  assert.equal(fetcher.calls, 0);
  assert.equal(store.saves, 0);
  assert.equal(page.clears, 0);
  assert.equal(wiped, false);
});

test("forgetAll leaves a session in the page that no account keeps, and asks nothing for it", async () => {
  const store = new FakeStore(park(EMPTY, bob, "tb", 0));
  const page = new FakePage("t-someone");
  const fetcher = signOuts();
  let asked = false;
  await forgetAll(
    deps(store, page, fetcher),
    () => Promise.resolve(),
    () => {
      asked = true;
      return Promise.resolve(true);
    },
  );
  assert.deepEqual(fetcher.ended, ["tb"]);
  assert.equal(page.token, "t-someone");
  assert.equal(asked, false);
});

test("forgetAll leaves the session of an account without a tile in the page, though one of the extension seemed to play", async () => {
  const autodarts = new FakeAutodarts();
  const store = adaOnThePage(autodarts);
  const parked = find(store.state, "b")?.token;
  const page = new FakePage(autodarts.issue("z"));
  const removal = await forgetAll(deps(store, page, autodarts.fetch), () =>
    Promise.resolve(),
  );
  assert.deepEqual(outcome(removal), { kind: "removed", ended: true });
  assert.deepEqual(autodarts.logouts, [parked]);
  assert.equal(page.token, autodarts.live.get("z"), "Zoe plays on");
  assert.equal(page.clears, 0);
  assert.deepEqual(store.state, EMPTY);
});

test("forgetAll with no account wipes all the same", async () => {
  const fetcher = counting(signOuts());
  let wiped = false;
  const removal = await forgetAll(
    deps(new FakeStore(), new FakePage(null), fetcher),
    () => {
      wiped = true;
      return Promise.resolve();
    },
  );
  assert.deepEqual(outcome(removal), { kind: "removed", ended: true });
  assert.equal(fetcher.calls, 0);
  assert.ok(wiped);
});

test("a removal during a renewal ends the session once and spends no other token twice", async () => {
  const board = race();
  const [, removal] = await Promise.all([
    refreshParked(board.deps),
    removeAccount(board.deps, "c"),
  ]);
  assert.deepEqual(outcome(removal), { kind: "removed", ended: true });
  assert.equal(find(board.store.state, "c"), undefined);
  assert.equal(board.autodarts.live.has("c"), false, "Cy's session ended");
  assert.equal(board.autodarts.logouts.length, 1);
  assertEverySessionKept(board);
});

test("a double tap on Remove ends the session once", async () => {
  const board = race();
  await Promise.all([
    removeAccount(board.deps, "b"),
    removeAccount(board.deps, "b"),
  ]);
  assert.equal(board.autodarts.logouts.length, 1);
  assert.equal(board.autodarts.live.has("b"), false);
  assertEverySessionKept(board);
});

/** Ada plays on the page and hosts a lobby; Bob's session is parked. */
function lobbyOfAda() {
  const autodarts = new FakeAutodarts();
  const store = new FakeStore(
    park(setActive(EMPTY, ada), bob, autodarts.issue("b"), 0),
  );
  const page = new FakePage(autodarts.issue("a"));
  const lobby = autodarts.openLobby("a");
  return {
    autodarts,
    store,
    page,
    lobby,
    board: deps(store, page, autodarts.fetch),
  };
}

test("joinLobbyAs seats a parked account at the board of Ada, who hosts and plays on the page, and the page stays", async () => {
  const { autodarts, store, page, lobby, board } = lobbyOfAda();
  const inPage = page.token;
  const result = await joinLobbyAs(board, "b", lobby);
  assert.deepEqual(result.ok && result.seated?.id, "b");
  assert.equal(result.ok && result.kept, false);
  assert.deepEqual(autodarts.lobbies.get(lobby)?.seated, ["a", "b"]);
  assert.deepEqual(autodarts.seats, [
    {
      lobby,
      bearer: "b",
      body: { name: "b", userId: "b", boardId: "board-of-a" },
    },
  ]);
  // Bob's rotated token is kept, and he stays parked; Ada plays on as before.
  assert.equal(find(store.state, "b")?.token, autodarts.live.get("b"));
  assert.equal(find(store.state, "b")?.refreshedAt, 1000);
  // Bob plays now, at the board of the display, though the page stays with Ada.
  assert.equal(find(store.state, "b")?.lastPlayedAt, 1000);
  assert.equal(find(store.state, "a")?.lastPlayedAt, null);
  assert.equal(store.state.activeId, "a");
  assert.equal(page.token, inPage);
  assert.deepEqual(page.writes, []);
  assert.equal(autodarts.reuses, 0);
});

test("joinLobbyAs seats a parked account at the board of the display, in a lobby that another account hosts", async () => {
  const { autodarts, lobby: own, board } = lobbyOfAda();
  // Ada, on the page, joined Zoe's lobby online: Zoe throws at her own board.
  const lobby = autodarts.openLobby("z");
  autodarts.sit(lobby, "a", "board-of-a");
  assert.ok(own !== lobby);
  const result = await joinLobbyAs(board, "b", lobby);
  assert.deepEqual(result.ok && result.seated?.id, "b");
  assert.deepEqual(autodarts.seats, [
    {
      lobby,
      bearer: "b",
      body: { name: "b", userId: "b", boardId: "board-of-a" },
    },
  ]);
});

test("joinLobbyAs keeps the seat of an account that has one, with no second request", async () => {
  const { autodarts, lobby, board } = lobbyOfAda();
  assert.ok((await joinLobbyAs(board, "b", lobby)).ok);
  const again = await joinLobbyAs(board, "b", lobby);
  assert.deepEqual(again.ok && again.seated?.id, "b");
  // It says that the seat was kept, so the popup can say that nothing changed.
  assert.equal(again.ok && again.kept, true);
  assert.equal(autodarts.seats.length, 1);
  assert.deepEqual(autodarts.lobbies.get(lobby)?.seated, ["a", "b"]);
});

test("joinLobbyAs seats an account again once the host took it out of the lobby", async () => {
  const { autodarts, store, lobby, board } = lobbyOfAda();
  assert.ok((await joinLobbyAs(board, "b", lobby)).ok);
  autodarts.leave(lobby, "b");
  assert.deepEqual(autodarts.lobbies.get(lobby)?.seated, ["a"]);

  const again = await joinLobbyAs(board, "b", lobby);
  assert.deepEqual(again.ok && [again.seated?.id, again.kept], ["b", false]);
  assert.deepEqual(autodarts.lobbies.get(lobby)?.seated, ["a", "b"]);
  assert.deepEqual(
    autodarts.seats.map(({ bearer, body }) => ({ bearer, body })),
    [1, 2].map(() => ({
      bearer: "b",
      body: { name: "b", userId: "b", boardId: "board-of-a" },
    })),
  );
  // Each join renewed Bob's parked session once, and kept the rotated token.
  assert.equal(find(store.state, "b")?.token, autodarts.live.get("b"));
  assert.equal(autodarts.reuses, 0);
});

test("joinLobbyAs seats no account that the extension doesn't know, and spends nothing", async () => {
  const { autodarts, store, lobby, board } = lobbyOfAda();
  const result = await joinLobbyAs(board, "nobody", lobby);
  assert.deepEqual(result.ok && result.seated, null);
  assert.equal(result.ok && result.kept, false);
  assert.deepEqual(autodarts.refreshes, []);
  assert.equal(store.saves, 0);
});

test("joinLobbyAs leaves the account that plays on the page alone: its token belongs to the page", async () => {
  const { autodarts, store, lobby, board } = lobbyOfAda();
  const result = await joinLobbyAs(board, "a", lobby);
  assert.deepEqual(!result.ok && result.reason, "playing");
  assert.deepEqual(autodarts.refreshes, []);
  assert.equal(store.saves, 0);
});

test("joinLobbyAs marks an account whose session died, as a switch does", async () => {
  const store = new FakeStore(park(EMPTY, bob, "dead", 0));
  const result = await joinLobbyAs(
    deps(store, new FakePage(null), router({ refresh: rejected })),
    "b",
    "lobby",
  );
  assert.deepEqual(!result.ok && result.reason, "signin");
  assert.equal(find(store.state, "b")?.needsSignIn, true);
});

test("joinLobbyAs changes nothing while Autodarts can't renew the session", async () => {
  const store = new FakeStore(park(EMPTY, bob, "tb", 0));
  const result = await joinLobbyAs(
    deps(store, new FakePage(null), router({ refresh: offline })),
    "b",
    "lobby",
  );
  assert.deepEqual(!result.ok && result.reason, "unreachable");
  assert.equal(store.saves, 0);
  assert.equal(find(store.state, "b")?.token, "tb");
});

test("joinLobbyAs keeps the rotated token when Autodarts refuses the seat", async () => {
  const { autodarts, store, board } = lobbyOfAda();
  const result = await joinLobbyAs(
    board,
    "b",
    "0b5a1c2d-0000-4000-8000-00000000dead",
  );
  assert.deepEqual(!result.ok && result.reason, "refused");
  assert.equal(find(store.state, "b")?.token, autodarts.live.get("b"));
  assert.equal(autodarts.reuses, 0);
});

test("joinLobbyAs keeps the rotated token when the lobby can't be reached", async () => {
  const store = new FakeStore(park(EMPTY, bob, "tb", 0));
  const result = await joinLobbyAs(
    deps(
      store,
      new FakePage(null),
      router({
        refresh: () => Promise.resolve(sessionResponse("b", "fresh")),
        lobby: offline,
      }),
    ),
    "b",
    "lobby",
  );
  assert.deepEqual(!result.ok && result.reason, "unreachable");
  assert.equal(find(store.state, "b")?.token, "fresh");
});

test("a join and a switch of the same account at once spend each token once", async () => {
  const { autodarts, store, page, lobby, board } = lobbyOfAda();
  const [joined, switched] = await Promise.all([
    joinLobbyAs(board, "b", lobby),
    switchTo(board, "b"),
  ]);
  assert.ok(joined.ok);
  assert.ok(switched.ok);
  assert.deepEqual(autodarts.lobbies.get(lobby)?.seated, ["a", "b"]);
  assert.equal(store.state.activeId, "b");
  assert.equal(page.token, autodarts.live.get("b"));
  assert.equal(find(store.state, "a")?.token, autodarts.live.get("a"));
  assert.equal(autodarts.reuses, 0);
});

/**
 * Ada is parked with a token that Autodarts no longer takes, and remembers a sign-in
 * that belongs to Bob: the form takes any username or email. The sign-in service answers
 * with a session of Bob and records each session that it is asked to end.
 */
function remembersBob() {
  const ended: string[] = [];
  const store = new FakeStore(
    rememberCredentials(park(EMPTY, ada, "dead", 0), "a", {
      username: "bob",
      password: "pw-bob",
    }),
  );
  const fetcher = router({
    refresh: rejected,
    login: () => Promise.resolve(sessionResponse("b", "bob-session")),
    logout: recordEnd(ended),
  });
  return { store, fetcher, ended };
}

/** A sign-out that Autodarts accepts, which records the refresh token of the session. */
function recordEnd(ended: string[]): Deps["fetcher"] {
  return (_url, init) => {
    const { refresh_token: token } = JSON.parse(String(init.body)) as {
      refresh_token: string;
    };
    ended.push(token);
    return Promise.resolve(new Response(null, { status: 204 }));
  };
}

/** Nothing of Bob's session stays: it ended, and Ada has to sign in again. */
function assertNothingOfBob(state: State, ended: string[]): void {
  assert.deepEqual(ended, ["bob-session"]);
  assert.equal(find(state, "b"), undefined);
  assert.equal(find(state, "a")?.token, null);
  assert.equal(find(state, "a")?.needsSignIn, true);
}

test("refreshParked keeps no session of another account that a remembered sign-in makes, and ends it", async () => {
  const { store, fetcher, ended } = remembersBob();
  const run = await refreshParked(deps(store, new FakePage(null), fetcher));
  assert.deepEqual([run.renewed, run.rejected, run.unreachable], [0, 1, 0]);
  assertNothingOfBob(store.state, ended);
});

test("switchTo brings no other account onto the page from a remembered sign-in", async () => {
  const { store, fetcher, ended } = remembersBob();
  const page = new FakePage(null);
  const result = await switchTo(deps(store, page, fetcher), "a");
  assert.deepEqual(!result.ok && result.reason, "signin");
  assert.equal(page.token, null);
  assert.equal(store.state.activeId, null);
  assertNothingOfBob(store.state, ended);
});

test("joinLobbyAs seats no other account from a remembered sign-in", async () => {
  const { store, fetcher, ended } = remembersBob();
  const result = await joinLobbyAs(
    deps(store, new FakePage(null), fetcher),
    "a",
    "lobby",
  );
  assert.deepEqual(!result.ok && result.reason, "signin");
  assertNothingOfBob(store.state, ended);
});

test("a remembered sign-in still renews the account that stored it once its token died", async () => {
  const store = new FakeStore(
    rememberCredentials(park(EMPTY, ada, "dead", 0), "a", {
      username: "ada",
      password: "pw",
    }),
  );
  const run = await refreshParked(
    deps(
      store,
      new FakePage(null),
      router({
        refresh: rejected,
        login: () => Promise.resolve(sessionResponse("a", "fresh")),
      }),
    ),
  );
  assert.deepEqual([run.renewed, run.rejected, run.unreachable], [1, 0, 0]);
  assert.equal(find(store.state, "a")?.token, "fresh");
});

/** A sign-in whose access token names no account that the extension can read. */
const unreadable = () =>
  Promise.resolve(
    jsonResponse({ access_token: "no-claims", refresh_token: "nobody" }),
  );

test("a remembered sign-in whose account can't be read ends and counts as a problem that may pass", async () => {
  const ended: string[] = [];
  const store = new FakeStore(
    rememberCredentials(park(EMPTY, ada, "dead", 0), "a", {
      username: "ada",
      password: "pw",
    }),
  );
  const run = await refreshParked(
    deps(
      store,
      new FakePage(null),
      router({
        refresh: rejected,
        login: unreadable,
        logout: recordEnd(ended),
      }),
    ),
  );
  assert.deepEqual([run.renewed, run.rejected, run.unreachable], [0, 0, 1]);
  assert.deepEqual(ended, ["nobody"]);
  // The dead token stays for the next try, as on any problem that may pass.
  assert.equal(find(store.state, "a")?.token, "dead");
  assert.equal(find(store.state, "a")?.needsSignIn, false);
});

/** The fetch of the check at "Remember password": its sign-in, and each session it ends. */
function checking(login: Deps["fetcher"]) {
  const ended: string[] = [];
  const fetcher = counting(router({ login, logout: recordEnd(ended) }));
  return { fetcher, ended };
}

const ADA_SIGN_IN = { username: "ada", password: "pw" };
const signsInAda = () => Promise.resolve(sessionResponse("a", "checked"));

test("rememberPassword keeps a sign-in that Autodarts takes, with its session, and ends the session before", async () => {
  const store = new FakeStore(park(EMPTY, ada, "ta", 0));
  const { fetcher, ended } = checking(signsInAda);
  const result = await rememberPassword(
    deps(store, new FakePage(null), fetcher),
    "a",
    ADA_SIGN_IN,
  );
  assert.ok(result.ok);
  assert.deepEqual(find(store.state, "a")?.credentials, ADA_SIGN_IN);
  assert.equal(find(store.state, "a")?.token, "checked");
  assert.equal(find(store.state, "a")?.refreshedAt, 1000);
  assert.deepEqual(ended, ["ta"]);
});

test("rememberPassword signs in an account that had to sign in again", async () => {
  const store = new FakeStore(endSession(park(EMPTY, ada, "ta", 0), "a"));
  const { fetcher, ended } = checking(signsInAda);
  const result = await rememberPassword(
    deps(store, new FakePage(null), fetcher),
    "a",
    ADA_SIGN_IN,
  );
  assert.ok(result.ok);
  assert.equal(find(store.state, "a")?.token, "checked");
  assert.equal(find(store.state, "a")?.needsSignIn, false);
  assert.deepEqual(ended, []);
});

test("rememberPassword leaves the session of the account that plays to the page and ends the one of the check", async () => {
  const store = new FakeStore(setActive(EMPTY, ada));
  const page = new FakePage("in-page");
  const { fetcher, ended } = checking(signsInAda);
  const result = await rememberPassword(
    deps(store, page, fetcher),
    "a",
    ADA_SIGN_IN,
  );
  assert.ok(result.ok);
  assert.deepEqual(find(store.state, "a")?.credentials, ADA_SIGN_IN);
  assert.equal(find(store.state, "a")?.token, null);
  assert.equal(store.state.activeId, "a");
  assert.equal(page.token, "in-page");
  assert.deepEqual(ended, ["checked"]);
});

test("rememberPassword refuses a password that Autodarts refuses, and keeps nothing", async () => {
  const store = new FakeStore(park(EMPTY, ada, "ta", 0));
  const { fetcher, ended } = checking(rejected);
  const result = await rememberPassword(
    deps(store, new FakePage(null), fetcher),
    "a",
    { username: "ada", password: "typo" },
  );
  assert.deepEqual(!result.ok && result.reason, "password");
  assert.equal(find(store.state, "a")?.credentials, null);
  assert.equal(find(store.state, "a")?.token, "ta");
  assert.equal(store.saves, 0);
  assert.deepEqual(ended, []);
});

test("rememberPassword refuses the sign-in of another account and ends its session", async () => {
  const store = new FakeStore(park(park(EMPTY, ada, "ta", 0), bob, "tb", 0));
  const { fetcher, ended } = checking(() =>
    Promise.resolve(sessionResponse("b", "bob-session")),
  );
  const result = await rememberPassword(
    deps(store, new FakePage(null), fetcher),
    "a",
    { username: "bob", password: "pw-bob" },
  );
  assert.deepEqual(!result.ok && result.reason, "otherAccount");
  assert.equal(find(store.state, "a")?.credentials, null);
  assert.equal(find(store.state, "a")?.token, "ta");
  assert.equal(find(store.state, "b")?.token, "tb");
  assert.equal(store.saves, 0);
  assert.deepEqual(ended, ["bob-session"]);
});

test("rememberPassword says so when Autodarts can't be reached, and keeps nothing", async () => {
  const store = new FakeStore(park(EMPTY, ada, "ta", 0));
  const { fetcher } = checking(offline);
  const result = await rememberPassword(
    deps(store, new FakePage(null), fetcher),
    "a",
    ADA_SIGN_IN,
  );
  assert.deepEqual(!result.ok && result.reason, "unreachable");
  assert.equal(find(store.state, "a")?.credentials, null);
  assert.equal(store.saves, 0);
});

test("rememberPassword keeps no sign-in whose account can't be read, and ends its session", async () => {
  const store = new FakeStore(park(EMPTY, ada, "ta", 0));
  const { fetcher, ended } = checking(unreadable);
  const result = await rememberPassword(
    deps(store, new FakePage(null), fetcher),
    "a",
    ADA_SIGN_IN,
  );
  assert.deepEqual(!result.ok && result.reason, "unreachable");
  assert.equal(find(store.state, "a")?.credentials, null);
  assert.equal(store.saves, 0);
  assert.deepEqual(ended, ["nobody"]);
});

test("rememberPassword for an account that is gone signs in nowhere", async () => {
  const store = new FakeStore(EMPTY);
  const { fetcher } = checking(signsInAda);
  const result = await rememberPassword(
    deps(store, new FakePage(null), fetcher),
    "a",
    ADA_SIGN_IN,
  );
  assert.ok(result.ok);
  assert.equal(fetcher.calls, 0);
  assert.equal(store.saves, 0);
});
