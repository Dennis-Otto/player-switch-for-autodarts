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
} from "../src/state.ts";
import {
  adoptCurrentSession,
  type Deps,
  edit,
  readView,
  refreshParked,
  signOutForNewAccount,
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

function deps(store: FakeStore, page: FakePage, fetcher: Deps["fetcher"]): Deps {
  return { store, page, fetcher, now: () => 1000, queue: createQueue() };
}

const rejected = () => Promise.resolve(jsonResponse({}, 400));
const offline = () => Promise.resolve(jsonResponse({}, 503));

test("switchTo brings a parked account onto the page", async () => {
  const store = new FakeStore(park(EMPTY, ada, "ta", 0));
  const page = new FakePage(null);
  const result = await switchTo(deps(store, page, router({ refresh: () => Promise.resolve(sessionResponse("a", "fa")) })), "a");
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
  const result = await switchTo(deps(store, page, router({ refresh: () => Promise.resolve(sessionResponse("a", "fa")) })), "a");
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
  const result = await switchTo(deps(store, new FakePage(null), router()), "ghost");
  assert.ok(result.ok);
  assert.equal(store.saves, 0);
});

test("switchTo falls back to the stored password when the token is dead", async () => {
  const store = new FakeStore(rememberCredentials(park(EMPTY, ada, "bad", 0), "a", { username: "ada", password: "pw" }));
  const page = new FakePage(null);
  const fetcher = router({ refresh: rejected, login: () => Promise.resolve(sessionResponse("a", "fresh")) });
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
  const fetcher = router({ login: () => Promise.resolve(sessionResponse("a", "fresh")) });
  const result = await switchTo(deps(store, page, fetcher), "a");
  assert.ok(result.ok);
  assert.equal(page.token, "fresh");
  assert.equal(find(result.state, "b")?.token, "pb");
});

test("switchTo reports a temporary problem and changes nothing", async () => {
  const store = new FakeStore(park(EMPTY, ada, "ta", 0));
  const page = new FakePage(null);
  const result = await switchTo(deps(store, page, router({ refresh: offline })), "a");
  assert.equal(result.ok, false);
  assert.equal(store.saves, 0);
  assert.equal(page.token, null);
});

test("switchTo reports when the password is also unreachable", async () => {
  const store = new FakeStore(rememberCredentials(park(EMPTY, ada, "bad", 0), "a", { username: "ada", password: "pw" }));
  const result = await switchTo(deps(store, new FakePage(null), router({ refresh: rejected, login: offline })), "a");
  assert.equal(result.ok, false);
  assert.equal(store.saves, 0);
});

test("switchTo marks the account when it has no way to sign in", async () => {
  const store = new FakeStore(park(EMPTY, ada, "ta", 0));
  const result = await switchTo(deps(store, new FakePage(null), router({ refresh: rejected })), "a");
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
  state = rememberCredentials(state, "a", { username: "ada", password: "wrong" });
  const store = new FakeStore(state);
  const result = await switchTo(deps(store, new FakePage(null), router({ login: rejected })), "a");
  assert.equal(result.ok, false);
});

test("switchTo spends no token when the page is not there", async () => {
  const store = new FakeStore(park(EMPTY, ada, "ta", 0));
  const fetcher = counting(router({ refresh: () => Promise.resolve(sessionResponse("a", "fa")) }));
  await assert.rejects(switchTo(deps(store, new FakePage(null, ["read"]), fetcher), "a"));
  assert.equal(fetcher.calls, 0);
  assert.equal(find(store.state, "a")?.token, "ta");
});

test("switchTo keeps the renewed token when the page can't take it", async () => {
  const store = new FakeStore(setActive(park(EMPTY, ada, "ta", 0), bob));
  const page = new FakePage("pb", ["write"]);
  const fetcher = router({ refresh: () => Promise.resolve(sessionResponse("a", "fa")) });
  await assert.rejects(switchTo(deps(store, page, fetcher), "a"));
  assert.equal(find(store.state, "a")?.token, "fa");
  assert.equal(store.state.activeId, "b");
  assert.equal(page.token, "pb");
});

test("adoptCurrentSession keeps the renewed token when the page can't take it", async () => {
  const store = new FakeStore(EMPTY);
  const page = new FakePage("in-page", ["write"]);
  const fetcher = router({ refresh: () => Promise.resolve(sessionResponse("a", "fresh")) });
  await assert.rejects(adoptCurrentSession(deps(store, page, fetcher)));
  assert.equal(find(store.state, "a")?.token, "fresh");
});

test("signOutForNewAccount keeps the session when the page can't let go", async () => {
  const store = new FakeStore(setActive(EMPTY, ada));
  await assert.rejects(signOutForNewAccount(deps(store, new FakePage("pa", ["clear"]), router())));
  assert.equal(find(store.state, "a")?.token, "pa");
});

test("adoptCurrentSession claims the session in the page and keeps it signed in", async () => {
  const store = new FakeStore(EMPTY);
  const page = new FakePage("in-page");
  const state = await adoptCurrentSession(deps(store, page, router({ refresh: () => Promise.resolve(sessionResponse("a", "fresh")) })));
  assert.equal(state.activeId, "a");
  assert.equal(page.token, "fresh");
  assert.equal(find(state, "a")?.token, null);
});

test("adoptCurrentSession does nothing without a session in the page", async () => {
  const store = new FakeStore(setActive(EMPTY, ada));
  const state = await adoptCurrentSession(deps(store, new FakePage(null), router()));
  assert.equal(state.activeId, null);
  assert.equal(store.saves, 1);
});

test("adoptCurrentSession drops a dead session", async () => {
  const page = new FakePage("dead");
  const state = await adoptCurrentSession(deps(new FakeStore(EMPTY), page, router({ refresh: rejected })));
  assert.equal(state.activeId, null);
  assert.equal(page.clears, 1);
});

test("adoptCurrentSession passes a temporary problem on", async () => {
  await assert.rejects(adoptCurrentSession(deps(new FakeStore(EMPTY), new FakePage("x"), router({ refresh: offline }))));
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
  const state = await signOutForNewAccount(deps(new FakeStore(EMPTY), page, router()));
  assert.equal(state.activeId, null);
  assert.equal(page.clears, 1);
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
  const state = await refreshParked(deps(store, new FakePage(null), router({ refresh: () => Promise.resolve(sessionResponse("a", "rolled")) })));
  assert.equal(find(state, "a")?.token, "rolled");
  assert.equal(find(state, "a")?.refreshedAt, 1000);
});

test("refreshParked marks a parked account whose session died", async () => {
  const store = new FakeStore(park(EMPTY, ada, "ta", 0));
  const state = await refreshParked(deps(store, new FakePage(null), router({ refresh: rejected })));
  assert.equal(find(state, "a")?.needsSignIn, true);
  assert.equal(find(state, "a")?.token, null);
});

test("refreshParked leaves a parked account alone on a temporary problem", async () => {
  const store = new FakeStore(park(EMPTY, ada, "ta", 0));
  const state = await refreshParked(deps(store, new FakePage(null), router({ refresh: offline })));
  assert.equal(find(state, "a")?.token, "ta");
});

test("refreshParked with nothing parked changes nothing", async () => {
  const store = new FakeStore(EMPTY);
  await refreshParked(deps(store, new FakePage(null), router()));
  assert.equal(store.saves, 0);
});

test("refreshParked leaves the account that is playing to the page", async () => {
  const store = new FakeStore(setActive(park(EMPTY, ada, "ta", 0), ada));
  const state = await refreshParked(deps(store, new FakePage("live"), router()));
  assert.equal(state.activeId, "a");
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

test("readView counts a missing page as no session", async () => {
  const store = new FakeStore(EMPTY);
  const view = await readView(deps(store, new FakePage(null, ["read"]), router()));
  assert.equal(view.unsaved, false);
});

test("edit changes the saved accounts", async () => {
  const store = new FakeStore(park(EMPTY, ada, "ta", 0));
  const state = await edit(deps(store, new FakePage(null), router()), (current) =>
    rememberCredentials(current, "a", { username: "ada", password: "pw" }),
  );
  assert.equal(find(store.state, "a")?.credentials?.password, "pw");
  assert.equal(state, store.state);
});

/**
 * A race on a shared display: Ada plays, Bob and Cy are parked, and each of them has
 * a working session at a fake Autodarts that rotates every token it renews.
 */
function race(): { autodarts: FakeAutodarts; store: FakeStore; page: FakePage; deps: Deps } {
  const autodarts = new FakeAutodarts();
  const state = setActive(park(park(EMPTY, bob, autodarts.issue("b"), 0), cy, autodarts.issue("c"), 0), ada);
  const store = new FakeStore(state);
  const page = new FakePage(autodarts.issue("a"));
  return { autodarts, store, page, deps: deps(store, page, autodarts.fetch) };
}

/**
 * No session was lost: every account's working token is where the extension keeps it,
 * in the page for the account that plays and parked for every other one, and no token
 * was ever spent twice.
 */
function assertEverySessionKept({ autodarts, store, page }: ReturnType<typeof race>): void {
  assert.equal(autodarts.reuses, 0, "no token was spent twice");
  for (const profile of store.state.profiles) {
    const kept = profile.id === store.state.activeId ? page.token : profile.token;
    assert.equal(kept, autodarts.live.get(profile.id), `the session of ${profile.name} is kept`);
    assert.equal(profile.needsSignIn, false, `${profile.name} needs no new sign-in`);
  }
}

test("a double tap on a player renews its token once and keeps every session", async () => {
  const board = race();
  const [first, second] = await Promise.all([switchTo(board.deps, "b"), switchTo(board.deps, "b")]);
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
  await renewal;
  assert.ok(switched.ok);
  assert.equal(board.store.state.activeId, "c");
  // Bob was renewed, Cy came onto the page, and the renewal left Cy to the page.
  assert.equal(board.autodarts.refreshes.length, 2);
  assertEverySessionKept(board);
});

test("a sign-out right after a switch parks the player who just came on", async () => {
  const board = race();
  const [switched] = await Promise.all([switchTo(board.deps, "b"), signOutForNewAccount(board.deps)]);
  assert.ok(switched.ok);
  // The taps run in their order: Bob comes on, and the sign-out then parks him.
  assert.equal(board.store.state.activeId, null);
  assert.equal(board.page.token, null);
  assert.equal(find(board.store.state, "b")?.token, board.autodarts.live.get("b"));
  assertEverySessionKept(board);
});

test("a password remembered during a switch is kept", async () => {
  const board = race();
  await Promise.all([
    switchTo(board.deps, "b"),
    edit(board.deps, (state) => rememberCredentials(state, "c", { username: "cy", password: "pw" })),
  ]);
  assert.equal(board.store.state.activeId, "b");
  assert.equal(find(board.store.state, "c")?.credentials?.username, "cy");
  assertEverySessionKept(board);
});
