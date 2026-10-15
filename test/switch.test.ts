import assert from "node:assert/strict";
import { test } from "node:test";

import type { Identity } from "../src/autodarts.ts";
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
  refreshParked,
  signOutForNewAccount,
  switchTo,
  syncFromPage,
} from "../src/switch.ts";
import {
  counting,
  FakePage,
  FakeStore,
  jsonResponse,
  router,
  sessionResponse,
} from "./helpers.ts";

const ada: Identity = { id: "a", username: "ada", name: "Ada", picture: null };
const bob: Identity = { id: "b", username: "bob", name: "Bob", picture: null };

function deps(store: FakeStore, page: FakePage, fetcher: Deps["fetcher"]): Deps {
  return { store, page, fetcher, now: () => 1000 };
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

test("refreshParked with nothing parked just saves", async () => {
  const store = new FakeStore(EMPTY);
  await refreshParked(deps(store, new FakePage(null), router()));
  assert.equal(store.saves, 1);
});

test("refreshParked leaves the account that is playing to the page", async () => {
  const store = new FakeStore(setActive(park(EMPTY, ada, "ta", 0), ada));
  const state = await refreshParked(deps(store, new FakePage("live"), router()));
  assert.equal(state.activeId, "a");
});
