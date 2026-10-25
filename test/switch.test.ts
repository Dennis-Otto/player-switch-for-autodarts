import assert from "node:assert/strict";
import { test } from "node:test";

import type { Identity } from "../src/autodarts.ts";
import { createQueue } from "../src/queue.ts";
import {
  EMPTY,
  endSession,
  find,
  park,
  rememberCredentials,
  setActive,
  startAdding,
} from "../src/state.ts";
import {
  ADD_WINDOW_MS,
  adoptCurrentSession,
  adoptNewSignIn,
  type Deps,
  edit,
  leaveDisplay,
  readView,
  refreshParked,
  signOutForNewAccount,
  startAddingAccount,
  stopAddingAccount,
  switchTo,
  syncFromPage,
} from "../src/switch.ts";
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

const rejected = () => Promise.resolve(jsonResponse({}, 400));
const offline = () => Promise.resolve(jsonResponse({}, 503));

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
    deps(
      store,
      page,
      router({ refresh: () => Promise.resolve(sessionResponse("a", "fa")) }),
    ),
    "a",
  );
  assert.equal(result.state.activeId, "a");
  assert.equal(find(result.state, "b")?.token, "pb");
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
  });
  const result = await switchTo(deps(store, page, fetcher), "a");
  assert.ok(result.ok);
  assert.equal(page.token, "fresh");
  assert.equal(find(result.state, "b")?.token, "pb");
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
  const fetcher = router({
    refresh: () => Promise.resolve(sessionResponse("a", "fa")),
  });
  await assert.rejects(switchTo(deps(store, page, fetcher), "a"));
  assert.equal(find(store.state, "a")?.token, "fa");
  assert.equal(store.state.activeId, "b");
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
    signOutForNewAccount(deps(store, new FakePage("pa", ["clear"]), router())),
  );
  assert.equal(find(store.state, "a")?.token, "pa");
  // The page still holds a session, so no new account is waited for.
  assert.equal(store.state.addingUntil, null);
});

test("adoptCurrentSession claims the session in the page and keeps it signed in", async () => {
  const store = new FakeStore(EMPTY);
  const page = new FakePage("in-page");
  const state = await adoptCurrentSession(
    deps(
      store,
      page,
      router({ refresh: () => Promise.resolve(sessionResponse("a", "fresh")) }),
    ),
  );
  assert.equal(state.activeId, "a");
  assert.equal(page.token, "fresh");
  assert.equal(find(state, "a")?.token, null);
});

test("adoptCurrentSession does nothing without a session in the page", async () => {
  const store = new FakeStore(setActive(EMPTY, ada));
  const state = await adoptCurrentSession(
    deps(store, new FakePage(null), router()),
  );
  assert.equal(state.activeId, null);
  assert.equal(store.saves, 1);
});

test("adoptCurrentSession drops a dead session", async () => {
  const page = new FakePage("dead");
  const state = await adoptCurrentSession(
    deps(new FakeStore(EMPTY), page, router({ refresh: rejected })),
  );
  assert.equal(state.activeId, null);
  assert.equal(page.clears, 1);
});

test("adoptCurrentSession passes a temporary problem on", async () => {
  await assert.rejects(
    adoptCurrentSession(
      deps(
        new FakeStore(EMPTY),
        new FakePage("x"),
        router({ refresh: offline }),
      ),
    ),
  );
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

test("signOutForNewAccount parks the account that was playing", async () => {
  const store = new FakeStore(setActive(EMPTY, ada));
  const page = new FakePage("pa");
  const state = await signOutForNewAccount(deps(store, page, router()));
  assert.equal(find(state, "a")?.token, "pa");
  assert.equal(state.activeId, null);
  assert.equal(page.token, null);
});

test("signOutForNewAccount clears an empty page without parking", async () => {
  const page = new FakePage(null);
  const state = await signOutForNewAccount(
    deps(new FakeStore(EMPTY), page, router()),
  );
  assert.equal(state.activeId, null);
  assert.equal(page.clears, 1);
});

test("signOutForNewAccount waits ten minutes for the new account", async () => {
  const state = await signOutForNewAccount(
    deps(new FakeStore(setActive(EMPTY, ada)), new FakePage("pa"), router()),
  );
  assert.equal(state.addingUntil, 1000 + ADD_WINDOW_MS);
  assert.equal(ADD_WINDOW_MS, 600_000);
});

test("leaveDisplay parks the account that was playing and waits for no new one", async () => {
  const store = new FakeStore(setActive(EMPTY, ada));
  const page = new FakePage("pa");
  const state = await leaveDisplay(deps(store, page, router()));
  assert.equal(find(state, "a")?.token, "pa");
  assert.equal(state.activeId, null);
  assert.equal(state.addingUntil, null);
  assert.equal(page.token, null);
  assert.deepEqual(store.state, state);
});

test("leaveDisplay ends a wait for a new account that nobody finished", async () => {
  // Someone signed in on the page while an account was being added, and walked away.
  const store = new FakeStore(startAdding(EMPTY, 5000));
  const page = new FakePage("unsaved");
  const state = await leaveDisplay(deps(store, page, router()));
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
  const state = await signOutForNewAccount(deps(store, page, router()));
  assert.equal(state.profiles.length, 0);
  assert.equal(page.token, null);
});

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
  assert.equal(board.autodarts.refreshes.length, 1);
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
  // Bob was renewed, Cy came onto the page, and the renewal left Cy to the page.
  assert.equal(board.autodarts.refreshes.length, 2);
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
