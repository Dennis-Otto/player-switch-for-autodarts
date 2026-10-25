import assert from "node:assert/strict";
import { test } from "node:test";

import type { Identity } from "../src/autodarts.ts";
import {
  activate,
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
  parseCredentials,
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

const ada: Identity = {
  id: "a",
  username: "ada",
  name: "Ada",
  picture: "https://p/a.png",
};
const bob: Identity = { id: "b", username: "bob", name: "Bob", picture: null };
const cy: Identity = { id: "c", username: "cy", name: "Cy", picture: null };

/** The accounts as release 0.2.0 stored them, with no version: one plays, one is parked. */
const RELEASE_0_2_0 = {
  profiles: [
    {
      id: "a",
      username: "ada",
      name: "Ada",
      picture: "https://p/a.png",
      token: null,
      needsSignIn: false,
      refreshedAt: null,
      credentials: null,
    },
    {
      id: "b",
      username: "bob",
      name: "Bob",
      picture: null,
      token: "rt-b",
      needsSignIn: false,
      refreshedAt: 1_700_000_000_000,
      credentials: { username: "bob", password: "pw" },
    },
  ],
  activeId: "a",
};

test("readStored takes the accounts of a release before the version without losing any", () => {
  const plain = {
    kind: "plain",
    state: {
      profiles: RELEASE_0_2_0.profiles.map((profile) => ({
        ...profile,
        renewalFailedAt: null,
      })),
      activeId: "a",
      addingUntil: null,
    },
  };
  assert.deepEqual(
    readStored(JSON.parse(JSON.stringify(RELEASE_0_2_0))),
    plain,
  );
  // The versions after it stored the same plain text with the version 1.
  assert.equal(PLAIN_VERSION, 1);
  assert.deepEqual(
    readStored({ ...RELEASE_0_2_0, version: PLAIN_VERSION }),
    plain,
  );
});

const SEALED_TOKEN = { iv: "aXYtYg==", data: "dG9rZW4tYg==" };
const SEALED_LOGIN = { iv: "aXYtbA==", data: "bG9naW4tYg==" };

test("toStored puts the sealed secrets in place of the plain ones, which readStored gives back apart", () => {
  const state = parseState(RELEASE_0_2_0);
  const secrets = new Map([
    ["a", { token: null, credentials: null }],
    ["b", { token: SEALED_TOKEN, credentials: SEALED_LOGIN }],
  ]);
  const stored = toStored(state, secrets);
  assert.equal(stored.version, STATE_VERSION);
  assert.equal(STATE_VERSION, 2);
  assert.deepEqual(stored.profiles[1], {
    ...state.profiles[1],
    token: SEALED_TOKEN,
    credentials: SEALED_LOGIN,
  });
  assert.ok(!JSON.stringify(stored).includes("rt-b"));
  assert.ok(!JSON.stringify(stored).includes('"pw"'));
  assert.deepEqual(readStored(JSON.parse(JSON.stringify(stored))), {
    kind: "sealed",
    state: {
      ...state,
      profiles: state.profiles.map((profile) => ({
        ...profile,
        token: null,
        credentials: null,
      })),
    },
    secrets,
  });
  // An account without its secrets is stored with none.
  assert.deepEqual(toStored(state, new Map()).profiles[1], {
    ...state.profiles[1],
    token: null,
    credentials: null,
  });
});

test("readStored of the sealed format takes no secret in plain text, and each account once", () => {
  const stored = readStored({
    version: STATE_VERSION,
    profiles: [
      {
        ...RELEASE_0_2_0.profiles[1],
        token: "rt-b",
        credentials: SEALED_LOGIN,
      },
      { ...RELEASE_0_2_0.profiles[1], token: SEALED_TOKEN },
    ],
  });
  assert.equal(stored.kind, "sealed");
  assert.deepEqual(stored.kind === "sealed" ? [...stored.secrets] : [], [
    ["b", { token: null, credentials: SEALED_LOGIN }],
  ]);
});

test("parseSealed takes a nonce and a text, and nothing else", () => {
  assert.deepEqual(parseSealed(SEALED_TOKEN), SEALED_TOKEN);
  assert.deepEqual(parseSealed({ ...SEALED_TOKEN, extra: 1 }), SEALED_TOKEN);
  for (const value of [
    null,
    "rt-b",
    42,
    {},
    { iv: "", data: "x" },
    { iv: "x", data: "" },
    { iv: 1, data: "x" },
    { iv: "x", data: 1 },
  ]) {
    assert.equal(parseSealed(value), null, JSON.stringify(value));
  }
});

test("parseCredentials takes a username and a password, and nothing else", () => {
  assert.deepEqual(parseCredentials({ username: "u", password: "p" }), {
    username: "u",
    password: "p",
  });
  assert.equal(parseCredentials({ username: "u" }), null);
  assert.equal(parseCredentials("u:p"), null);
});

test("readStored starts with no account when nothing is stored yet", () => {
  assert.deepEqual(readStored(undefined), {
    kind: "sealed",
    state: EMPTY,
    secrets: new Map(),
  });
});

test("readStored keeps a value of a newer or unknown version, or of no state at all, from being read", () => {
  for (const stored of [
    { ...RELEASE_0_2_0, version: STATE_VERSION + 1 },
    { ...RELEASE_0_2_0, version: 0 },
    { ...RELEASE_0_2_0, version: "1" },
    { ...RELEASE_0_2_0, version: null },
    { version: 1, profiles: "no" },
    { version: STATE_VERSION, profiles: "no" },
    { profiles: "no" },
    { accounts: [] },
    null,
    42,
    "accounts",
  ]) {
    assert.deepEqual(
      readStored(stored),
      { kind: "unknown" },
      JSON.stringify(stored),
    );
  }
});

test("parseState starts empty from anything unexpected", () => {
  assert.deepEqual(parseState(null), EMPTY);
  assert.deepEqual(parseState(42), EMPTY);
  assert.deepEqual(parseState({ profiles: "no" }), EMPTY);
});

test("parseState keeps valid profiles and drops invalid ones", () => {
  const state = parseState({
    activeId: "a",
    profiles: [
      {
        id: "a",
        username: "ada",
        name: "Ada",
        picture: "https://p/a.png",
        token: "t",
        needsSignIn: false,
        refreshedAt: 10,
        credentials: { username: "ada", password: "pw" },
      },
      "not a profile",
      { id: "", username: "x", name: "x" },
      {
        id: "b",
        username: "bob",
        name: "Bob",
        picture: 5,
        token: "",
        needsSignIn: "yes",
        refreshedAt: "later",
        credentials: { username: "bob", password: "" },
      },
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
  const state = parseState({
    activeId: "ghost",
    profiles: [{ id: "a", username: "ada", name: "Ada" }],
  });
  assert.equal(state.activeId, null);
});

test("parseState reads when the adding of an account ends, and only while nobody plays", () => {
  const profiles = [{ id: "a", username: "ada", name: "Ada" }];
  assert.equal(parseState({ profiles, addingUntil: 500 }).addingUntil, 500);
  assert.equal(parseState({ profiles, addingUntil: "soon" }).addingUntil, null);
  assert.equal(
    parseState({ profiles, addingUntil: Number.NaN }).addingUntil,
    null,
  );
  assert.equal(parseState({ profiles }).addingUntil, null);
  // A window stored beside a player is stale: a player that comes on ends it.
  assert.equal(
    parseState({ profiles, activeId: "a", addingUntil: 500 }).addingUntil,
    null,
  );
});

test("parseState keeps the first of two stored profiles with the same id", () => {
  const state = parseState({
    profiles: [
      { id: "a", username: "ada", name: "Ada", token: "t" },
      { id: "a", username: "ada", name: "Ada again", refreshedAt: 5 },
    ],
  });
  assert.deepEqual(
    state.profiles.map((profile) => [profile.name, profile.token]),
    [["Ada", "t"]],
  );
});

test("parseState rejects credentials that are not an object", () => {
  const state = parseState({
    profiles: [{ id: "a", username: "ada", name: "Ada", credentials: "no" }],
  });
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
  assert.deepEqual(
    state.profiles.map((profile) => profile.id),
    ["a", "b"],
  );
});

test("park orders accounts that share a username by id", () => {
  let state = park(
    EMPTY,
    { id: "z", username: "same", name: "Z", picture: null },
    "t",
    1,
  );
  state = park(
    state,
    { id: "a", username: "same", name: "A", picture: null },
    "t",
    1,
  );
  assert.deepEqual(
    state.profiles.map((profile) => profile.id),
    ["a", "z"],
  );
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
  assert.deepEqual(find(state, "a")?.credentials, {
    username: "ada",
    password: "pw",
  });
  state = forgetCredentials(state, "a");
  assert.equal(find(state, "a")?.credentials, null);
  assert.equal(
    rememberCredentials(state, "z", { username: "x", password: "y" }),
    state,
  );
  assert.equal(forgetCredentials(state, "z"), state);
});

test("parked lists the accounts the extension renews itself", () => {
  let state: State = park(EMPTY, ada, "ta", 1);
  state = park(state, bob, "tb", 1);
  state = activate(state, "b");
  assert.deepEqual(
    parked(state).map((profile) => profile.id),
    ["a"],
  );
});

test("toView hides the session and shows what the popup needs", () => {
  let state = park(EMPTY, ada, "t", 1);
  state = rememberCredentials(state, "a", { username: "ada", password: "pw" });
  state = activate(state, "a");
  const view = toView(state, true, 0);
  assert.deepEqual(view.profiles, [
    {
      id: "a",
      username: "ada",
      name: "Ada",
      picture: "https://p/a.png",
      needsSignIn: false,
      remembersPassword: true,
      active: true,
      renewedAt: null,
      renewalFailingSince: null,
    },
  ]);
  assert.equal(view.unsaved, false);
});

test("toView shows when the extension last renewed a parked session, and only then", () => {
  let state = park(
    park(park(EMPTY, ada, "ta", 10), bob, "tb", 20),
    cy,
    "tc",
    30,
  );
  state = activate(state, "a");
  state = endSession(state, "c");
  const renewed = toView(state, true, 0).profiles.map((profile) => [
    profile.id,
    profile.renewedAt,
  ]);
  // Ada plays, so the page renews her session; Cy has none.
  assert.deepEqual(renewed, [
    ["a", null],
    ["b", 20],
    ["c", null],
  ]);
});

test("failRenewal marks since when the renewal of an account fails, and a fresh session clears it", () => {
  let state = park(park(EMPTY, ada, "ta", 10), bob, "tb", 20);
  state = failRenewal(state, "b", 30);
  assert.equal(find(state, "b")?.renewalFailedAt, 30);
  assert.equal(
    find(state, "b")?.token,
    "tb",
    "the session stays for the next try",
  );
  // The failures go on: the mark keeps the time of the first one.
  assert.equal(failRenewal(state, "b", 40), state);
  assert.equal(failRenewal(state, "ghost", 40), state);
  assert.equal(find(stash(state, "b", "tb2", 50), "b")?.renewalFailedAt, null);
  assert.equal(find(park(state, bob, "tb2", 50), "b")?.renewalFailedAt, null);
  assert.equal(find(endSession(state, "b"), "b")?.renewalFailedAt, null);
  assert.equal(find(activate(state, "b"), "b")?.renewalFailedAt, null);
  assert.equal(find(setActive(state, bob), "b")?.renewalFailedAt, null);
  // A new name or picture of the account keeps the mark.
  assert.equal(
    find(
      rememberCredentials(state, "b", { username: "bob", password: "pw" }),
      "b",
    )?.renewalFailedAt,
    30,
  );
});

test("toView shows since when the renewal fails, only for a parked session", () => {
  let state = park(park(EMPTY, ada, "ta", 10), bob, "tb", 20);
  state = failRenewal(failRenewal(state, "a", 30), "b", 40);
  state = activate(state, "a");
  const failing = toView(state, true, 0).profiles.map((profile) => [
    profile.id,
    profile.renewalFailingSince,
  ]);
  assert.deepEqual(failing, [
    ["a", null],
    ["b", 40],
  ]);
});

test("toView reports a session that belongs to no account yet", () => {
  assert.equal(toView(EMPTY, true, 0).unsaved, true);
  assert.equal(toView(EMPTY, false, 0).unsaved, false);
});

test("toView says while an account is being added", () => {
  const state = startAdding(EMPTY, 100);
  assert.equal(toView(state, false, 99).adding, true);
  assert.equal(toView(state, false, 100).adding, false);
  assert.equal(toView(EMPTY, false, 0).adding, false);
});

test("startAdding waits for a new account until the given time, and stopAdding no longer", () => {
  const state = startAdding(park(EMPTY, ada, "t", 1), 100);
  assert.equal(state.addingUntil, 100);
  assert.ok(isAdding(state, 0));
  assert.ok(isAdding(state, 99));
  assert.ok(!isAdding(state, 100));
  assert.equal(stopAdding(state).addingUntil, null);
  assert.ok(!isAdding(stopAdding(state), 0));
  assert.ok(!isAdding(EMPTY, 0));
});

test("startAdding waits for nobody while an account plays", () => {
  const state = activate(park(EMPTY, ada, "t", 1), "a");
  assert.equal(startAdding(state, 100), state);
});

test("an account that comes on ends the adding, and other changes keep it", () => {
  let state = startAdding(park(park(EMPTY, ada, "ta", 1), bob, "tb", 1), 100);
  state = stash(state, "a", "ta2", 2);
  state = endSession(state, "b");
  state = rememberCredentials(state, "a", { username: "ada", password: "pw" });
  state = forgetCredentials(state, "a");
  state = park(state, cy, "tc", 3);
  state = forget(state, "c");
  state = deactivate(state);
  assert.equal(state.addingUntil, 100);
  assert.equal(activate(state, "a").addingUntil, null);
  assert.equal(setActive(state, bob).addingUntil, null);
  // An account that is unknown doesn't come on, so the adding goes on.
  assert.equal(activate(state, "ghost").addingUntil, 100);
});
