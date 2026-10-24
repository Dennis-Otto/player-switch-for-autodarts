import assert from "node:assert/strict";
import { test } from "node:test";

import type { Identity } from "../src/autodarts.ts";
import {
  activate,
  deactivate,
  EMPTY,
  endSession,
  find,
  forget,
  forgetCredentials,
  park,
  parked,
  parseState,
  rememberCredentials,
  setActive,
  type State,
  stash,
  toView,
} from "../src/state.ts";

const ada: Identity = { id: "a", username: "ada", name: "Ada", picture: "https://p/a.png" };
const bob: Identity = { id: "b", username: "bob", name: "Bob", picture: null };
const cy: Identity = { id: "c", username: "cy", name: "Cy", picture: null };

test("parseState starts empty from anything unexpected", () => {
  assert.deepEqual(parseState(null), EMPTY);
  assert.deepEqual(parseState(42), EMPTY);
  assert.deepEqual(parseState({ profiles: "no" }), EMPTY);
});

test("parseState keeps valid profiles and drops invalid ones", () => {
  const state = parseState({
    activeId: "a",
    profiles: [
      { id: "a", username: "ada", name: "Ada", picture: "https://p/a.png", token: "t", needsSignIn: false, refreshedAt: 10, credentials: { username: "ada", password: "pw" } },
      "not a profile",
      { id: "", username: "x", name: "x" },
      { id: "b", username: "bob", name: "Bob", picture: 5, token: "", needsSignIn: "yes", refreshedAt: "later", credentials: { username: "bob", password: "" } },
    ],
  });
  assert.equal(state.profiles.length, 2);
  assert.equal(state.activeId, "a");
  const [first, second] = state.profiles;
  assert.deepEqual(first?.credentials, { username: "ada", password: "pw" });
  assert.equal(second?.picture, null);
  assert.equal(second?.token, null);
  assert.equal(second?.needsSignIn, false);
  assert.equal(second?.refreshedAt, null);
  assert.equal(second?.credentials, null);
});

test("parseState reads a profile with no token that needs a sign-in", () => {
  const state = parseState({
    profiles: [{ id: "c", username: "cee", name: "Cee", needsSignIn: true }],
  });
  const profile = state.profiles[0];
  assert.equal(profile?.token, null);
  assert.equal(profile?.needsSignIn, true);
});

test("parseState forgets an active id that names no profile", () => {
  const state = parseState({ activeId: "ghost", profiles: [{ id: "a", username: "ada", name: "Ada" }] });
  assert.equal(state.activeId, null);
});

test("parseState rejects credentials that are not an object", () => {
  const state = parseState({ profiles: [{ id: "a", username: "ada", name: "Ada", credentials: "no" }] });
  assert.equal(state.profiles[0]?.credentials, null);
});

test("find returns a profile or nothing", () => {
  const state = park(EMPTY, ada, "t", 1);
  assert.equal(find(state, "a")?.username, "ada");
  assert.equal(find(state, "z"), undefined);
});

test("park adds a new account and later updates its name, keeping the session", () => {
  let state = park(EMPTY, ada, "t1", 1);
  assert.equal(find(state, "a")?.token, "t1");
  state = park(state, { ...ada, name: "Ada L." }, "t2", 2);
  assert.equal(find(state, "a")?.name, "Ada L.");
  assert.equal(find(state, "a")?.token, "t2");
});

test("park clears the active id when the active account is parked", () => {
  let state = setActive(EMPTY, ada);
  assert.equal(state.activeId, "a");
  state = park(state, ada, "t", 5);
  assert.equal(state.activeId, null);
});

test("park sorts the profiles by username then id", () => {
  let state = park(EMPTY, bob, "tb", 1);
  state = park(state, ada, "ta", 1);
  assert.deepEqual(state.profiles.map((profile) => profile.id), ["a", "b"]);
});

test("park orders accounts that share a username by id", () => {
  let state = park(EMPTY, { id: "z", username: "same", name: "Z", picture: null }, "t", 1);
  state = park(state, { id: "a", username: "same", name: "A", picture: null }, "t", 1);
  assert.deepEqual(state.profiles.map((profile) => profile.id), ["a", "z"]);
});

test("stash keeps a token under a known account and ignores an unknown one", () => {
  let state = setActive(EMPTY, ada);
  state = stash(state, "a", "raw", 7);
  assert.equal(find(state, "a")?.token, "raw");
  assert.equal(find(state, "a")?.refreshedAt, 7);
  assert.equal(stash(state, "z", "x", 1), state);
});

test("setActive records the page account without a session of its own", () => {
  const state = setActive(park(EMPTY, ada, "t", 1), ada);
  assert.equal(state.activeId, "a");
  assert.equal(find(state, "a")?.token, null);
});

test("activate marks an account active and ignores an unknown one", () => {
  let state = park(EMPTY, ada, "t", 1);
  state = activate(state, "a");
  assert.equal(state.activeId, "a");
  assert.equal(find(state, "a")?.token, null);
  assert.equal(activate(state, "z"), state);
});

test("endSession marks the account as needing a sign-in", () => {
  let state = activate(park(EMPTY, ada, "t", 1), "a");
  state = endSession(state, "a");
  assert.equal(find(state, "a")?.needsSignIn, true);
  assert.equal(state.activeId, null);
  assert.equal(endSession(state, "z"), state);
});

test("endSession keeps the active id when a different account's session ends", () => {
  let state = park(EMPTY, bob, "tb", 1);
  state = activate(state, "b");
  state = park(state, ada, "ta", 1);
  state = endSession(state, "a");
  assert.equal(state.activeId, "b");
});

test("deactivate forgets who is on the page", () => {
  const state = deactivate(setActive(EMPTY, ada));
  assert.equal(state.activeId, null);
});

test("forget removes an account and clears it when active", () => {
  let state = activate(park(EMPTY, ada, "t", 1), "a");
  state = park(state, bob, "tb", 1);
  state = forget(state, "a");
  assert.equal(find(state, "a"), undefined);
  assert.equal(state.activeId, null);
  state = forget(state, "b");
  assert.equal(state.profiles.length, 0);
});

test("remembering and forgetting a password", () => {
  let state = park(EMPTY, ada, "t", 1);
  state = rememberCredentials(state, "a", { username: "ada", password: "pw" });
  assert.deepEqual(find(state, "a")?.credentials, { username: "ada", password: "pw" });
  state = forgetCredentials(state, "a");
  assert.equal(find(state, "a")?.credentials, null);
  assert.equal(rememberCredentials(state, "z", { username: "x", password: "y" }), state);
  assert.equal(forgetCredentials(state, "z"), state);
});

test("parked lists the accounts the extension renews itself", () => {
  let state: State = park(EMPTY, ada, "ta", 1);
  state = park(state, bob, "tb", 1);
  state = activate(state, "b");
  assert.deepEqual(parked(state).map((profile) => profile.id), ["a"]);
});

test("toView hides the session and shows what the popup needs", () => {
  let state = park(EMPTY, ada, "t", 1);
  state = rememberCredentials(state, "a", { username: "ada", password: "pw" });
  state = activate(state, "a");
  const view = toView(state, true);
  assert.deepEqual(view.profiles, [
    { id: "a", username: "ada", name: "Ada", picture: "https://p/a.png", needsSignIn: false, remembersPassword: true, active: true, renewedAt: null },
  ]);
  assert.equal(view.unsaved, false);
});

test("toView shows when the extension last renewed a parked session, and only then", () => {
  let state = park(park(park(EMPTY, ada, "ta", 10), bob, "tb", 20), cy, "tc", 30);
  state = activate(state, "a");
  state = endSession(state, "c");
  const renewed = toView(state, true).profiles.map((profile) => [profile.id, profile.renewedAt]);
  // Ada plays, so the page renews her session; Cy has none.
  assert.deepEqual(renewed, [
    ["a", null],
    ["b", 20],
    ["c", null],
  ]);
});

test("toView reports a session that belongs to no account yet", () => {
  assert.equal(toView(EMPTY, true).unsaved, true);
  assert.equal(toView(EMPTY, false).unsaved, false);
});
