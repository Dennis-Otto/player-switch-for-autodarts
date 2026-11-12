import assert from "node:assert/strict";
import { test } from "node:test";

import type { PlayersView, PlayerView } from "../src/messages.ts";
import {
  answered,
  keptManagerPin,
  matchQuestion,
  mustUnlock,
  pinQuestion,
  problemOf,
  questionOf,
  rememberRefused,
  removalText,
  showsEmpty,
  showsForgetAll,
  statusAfter,
  tileOf,
  toggled,
} from "../src/popup-model.ts";

/** The texts of the extension as their keys, with the substitution after a colon. */
const t = (key: string, substitution?: string) =>
  substitution === undefined ? key : `${key}: ${substitution}`;

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 25, 12);

const ada: PlayerView = {
  id: "a",
  username: "ada",
  name: "Ada",
  picture: null,
  active: false,
  needsSignIn: false,
  remembersPassword: false,
  renewedAt: null,
  renewalFailingSince: null,
  pin: false,
};

const VIEW: PlayersView = {
  profiles: [],
  unsaved: false,
  adding: false,
  venue: { manager: false, protectable: null },
  updateHint: false,
  lobby: null,
};

test("the status line names each problem, and says nothing once a request went through", () => {
  const view = VIEW;
  assert.deepEqual(statusAfter(undefined, null, t), {
    text: "error",
    error: true,
  });
  assert.deepEqual(
    statusAfter({ error: "noPage", page: false, view }, null, t),
    { text: "noPage", error: true },
  );
  assert.deepEqual(statusAfter({ error: "unknownFormat", view }, null, t), {
    text: "unknownFormat",
    error: true,
  });
  assert.deepEqual(statusAfter({ error: "error", view }, null, t), {
    text: "error",
    error: true,
  });
  assert.deepEqual(
    statusAfter(
      { ok: false, reason: "unreachable", page: true, view },
      "switchSignIn: Ada",
      t,
    ),
    { text: "unreachable", error: true },
  );
  assert.deepEqual(
    statusAfter(
      { ok: false, reason: "signin", page: true, view },
      "switchSignIn: Ada",
      t,
    ),
    { text: "switchSignIn: Ada", error: true },
  );
  assert.deepEqual(
    statusAfter({ ok: false, reason: "signin", page: true, view }, null, t),
    { text: "error", error: true },
  );
  assert.deepEqual(
    statusAfter(
      { ok: false, reason: "locked", retryIn: 60_000, view },
      null,
      t,
    ),
    { text: "pinLocked", error: true },
  );
  assert.deepEqual(
    statusAfter({ ok: true, page: true, saved: "Ada", view }, null, t),
    { text: "savedAccount: Ada", error: false },
  );
  assert.deepEqual(statusAfter({ ok: true, view }, null, t), {
    text: "",
    error: false,
  });
});

test("problemOf falls back to the hint of the account, and to a plain error without one", () => {
  assert.equal(problemOf("signin", "hint", t), "hint");
  assert.equal(problemOf("match", null, t), "error");
});

test("a join says who joined the lobby, or why the player took no seat", () => {
  const view = { ...VIEW, lobby: { seated: ["a"] } };
  const about = { action: "join", name: "Ada" };
  assert.deepEqual(
    statusAfter({ ok: true, joined: "Ada", view }, null, t, about),
    { text: "joinedLobby: Ada", error: false },
  );
  // "Join again" for a player who still sits there: Autodarts kept the seat.
  assert.deepEqual(
    statusAfter({ ok: true, joined: "Ada", kept: true, view }, null, t, about),
    { text: "joinKept: Ada", error: false },
  );
  // An account that is gone meanwhile: the tiles show it gone, and nothing more.
  assert.deepEqual(statusAfter({ ok: true, view }, null, t, about), {
    text: "",
    error: false,
  });
  for (const [reason, text] of [
    ["noLobby", "joinNoLobby"],
    ["playing", "joinPlaying: Ada"],
    ["refused", "joinRefused: Ada"],
  ] as const) {
    assert.deepEqual(
      statusAfter({ ok: false, reason, view }, "switchSignIn: Ada", t, about),
      { text, error: true },
      reason,
    );
  }
  // A dead session has to sign in again, as after a tap on the tile.
  assert.deepEqual(
    statusAfter(
      { ok: false, reason: "signin", page: true, view },
      "switchSignIn: Ada",
      t,
      about,
    ),
    { text: "switchSignIn: Ada", error: true },
  );
});

test("Remember password says why it kept nothing", () => {
  const about = { action: "remember", name: "Ada" };
  for (const [reason, text] of [
    ["password", "rememberRefused"],
    ["otherAccount", "rememberOtherAccount: Ada"],
    ["unreachable", "unreachable"],
  ] as const) {
    assert.deepEqual(
      statusAfter({ ok: false, reason, view: VIEW }, null, t, about),
      { text, error: true },
      reason,
    );
  }
  assert.deepEqual(statusAfter({ ok: true, view: VIEW }, null, t, about), {
    text: "",
    error: false,
  });
});

test("the form of Remember password opens again only when Autodarts didn't take what it held", () => {
  for (const reason of ["password", "otherAccount", "unreachable"] as const) {
    assert.equal(rememberRefused({ ok: false, reason, view: VIEW }), true);
  }
  assert.equal(rememberRefused({ ok: true, view: VIEW }), false);
  assert.equal(rememberRefused(undefined), false);
  assert.equal(rememberRefused({ error: "error", view: VIEW }), false);
  assert.equal(
    rememberRefused({
      ok: false,
      reason: "pin",
      pin: "manager",
      wrong: false,
      view: VIEW,
    }),
    false,
  );
});

test("an answer asks for a yes to end the match, or for a PIN, and nothing else", () => {
  const view = VIEW;
  assert.deepEqual(questionOf({ ok: false, reason: "match", view }), {
    kind: "match",
  });
  assert.deepEqual(
    questionOf({ ok: false, reason: "pin", pin: "player", wrong: false, view }),
    { kind: "pin", manager: false, wrong: false },
  );
  assert.deepEqual(
    questionOf({ ok: false, reason: "pin", pin: "manager", wrong: true, view }),
    { kind: "pin", manager: true, wrong: true },
  );
  for (const reply of [
    undefined,
    { ok: true, view } as const,
    { error: "error", view } as const,
    { ok: false, reason: "locked", retryIn: 1, view } as const,
    { ok: false, reason: "unreachable", page: true, view } as const,
  ]) {
    assert.equal(questionOf(reply), null, JSON.stringify(reply));
  }
});

test("the request goes again with the yes, or with the PIN in its place", () => {
  const request = { action: "switch", id: "a" } as const;
  assert.deepEqual(answered(request, { kind: "match" }), {
    ...request,
    confirmed: true,
  });
  assert.deepEqual(
    answered(request, { kind: "pin", manager: false, wrong: false }, "1234"),
    { ...request, pin: "1234" },
  );
  assert.deepEqual(
    answered(
      { action: "unlock" },
      { kind: "pin", manager: true, wrong: true },
      "0000",
    ),
    { action: "unlock", managerPin: "0000" },
  );
});

test("the question for a PIN names the account, or asks for the manager PIN, and says when one was wrong", () => {
  assert.deepEqual(pinQuestion({ manager: false, wrong: false }, "Ada", t), {
    title: "pinTitle: Ada",
    text: "pinText",
    error: "",
  });
  assert.deepEqual(pinQuestion({ manager: true, wrong: true }, "Ada", t), {
    title: "managerPinTitle",
    text: "managerPinText",
    error: "pinWrong",
  });
  // The PIN of the account before its player removes it says so; the manager PIN
  // before a removal stays the question of the manager.
  assert.equal(
    pinQuestion({ manager: false, wrong: false }, "Ada", t, "removeAccount")
      .text,
    "removeOwnPinText",
  );
  assert.equal(
    pinQuestion({ manager: true, wrong: false }, "Ada", t, "removeAccount")
      .text,
    "managerPinText",
  );
  assert.equal(
    pinQuestion({ manager: false, wrong: false }, "Ada", t, "switch").text,
    "pinText",
  );
});

test("at a display with a manager PIN, the player who plays protects their account, or removes it once it has a PIN", () => {
  const options = { numbered: false, now: NOW, language: "en", t };
  const playing = { ...ada, active: true };
  const venue = { manager: true, protectable: ada.id };
  assert.deepEqual(tileOf(playing, 0, { ...options, venue }).own, {
    text: "protectOwn",
    label: "protectOwn: Ada",
    kind: "protect",
  });
  assert.deepEqual(
    tileOf({ ...playing, pin: true }, 0, {
      ...options,
      venue: { manager: true, protectable: null },
    }).own,
    { text: "removeOwn", label: "removeOwn: Ada", kind: "remove" },
  );
  // Nothing for a parked player, for the house account without a PIN, which the view
  // names as no account to protect, and at a display without a manager PIN.
  assert.equal(tileOf(ada, 0, { ...options, venue }).own, null);
  assert.equal(
    tileOf(playing, 0, {
      ...options,
      venue: { manager: true, protectable: null },
    }).own,
    null,
  );
  assert.equal(
    tileOf({ ...playing, pin: true }, 0, {
      ...options,
      venue: { manager: false, protectable: null },
    }).own,
    null,
  );
  assert.equal(tileOf({ ...playing, pin: true }, 0, options).own, null);
});

test("the status line says whose account a PIN of its own protects now", () => {
  assert.deepEqual(
    statusAfter({ ok: true, view: VIEW }, null, t, {
      action: "protect",
      name: "Ada",
    }),
    { text: "protectedOwn: Ada", error: false },
  );
  assert.deepEqual(
    statusAfter({ ok: false, reason: "invalid", view: VIEW }, null, t, {
      action: "protect",
      name: "Ada",
    }),
    { text: "error", error: true },
  );
});

test("the manager PIN that worked opens Manage accounts, and nothing else changes it", () => {
  const view = VIEW;
  const unlock = { action: "unlock", managerPin: "0000" } as const;
  assert.equal(keptManagerPin(null, unlock, { ok: true, view }), "0000");
  assert.equal(
    keptManagerPin("1111", { action: "view" }, { ok: true, view }),
    "1111",
  );
  assert.equal(keptManagerPin(null, unlock, undefined), null);
  assert.equal(keptManagerPin(null, unlock, { error: "error", view }), null);
  assert.equal(
    keptManagerPin(null, unlock, {
      ok: false,
      reason: "pin",
      pin: "manager",
      wrong: true,
      view,
    }),
    null,
  );
});

test("a tile shows the key of the first nine, the chip of the player and the health of the renewal", () => {
  const options = { numbered: true, now: NOW, language: "en", t };
  assert.deepEqual(tileOf(ada, 0, options), {
    key: "1",
    chip: null,
    join: null,
    own: null,
    renewed: null,
    failing: null,
    toggle: "rememberPassword",
  });
  assert.equal(tileOf(ada, 8, options).key, "9");
  assert.equal(tileOf(ada, 9, options).key, null);
  assert.equal(tileOf(ada, 0, { ...options, numbered: false }).key, null);

  assert.deepEqual(
    tileOf({ ...ada, active: true, needsSignIn: true }, 0, options).chip,
    {
      text: "playing",
      kind: "playing",
    },
  );
  assert.deepEqual(tileOf({ ...ada, needsSignIn: true }, 0, options).chip, {
    text: "needsSignIn",
    kind: "warn",
  });
  assert.equal(
    tileOf({ ...ada, remembersPassword: true }, 0, options).toggle,
    "forgetPassword",
  );

  const parked = tileOf(
    { ...ada, renewedAt: NOW - 2 * HOUR, renewalFailingSince: NOW - HOUR },
    0,
    options,
  );
  assert.match(parked.renewed ?? "", /^renewed: .*2 hours ago$/);
  assert.match(parked.failing ?? "", /^renewalFailing: .+/);
});

test("on a page with a lobby, a parked player's tile offers the join, says once it is seated, and offers to join again", () => {
  const options = { numbered: false, now: NOW, language: "en", t };
  const lobby = { seated: ["b"] };
  const bob = { ...ada, id: "b", name: "Bob" };

  // A parked player who takes no seat yet joins with a tap, named for a screen reader.
  assert.deepEqual(tileOf(ada, 0, { ...options, lobby }).join, {
    text: "joinLobby",
    label: "joinLobbyAs: Ada",
    again: false,
  });
  assert.equal(tileOf(ada, 0, options).join, null);
  assert.deepEqual(tileOf(ada, 0, { ...options, lobby: null }).chip, null);
  // A player whom the extension seated says so, and offers the quieter "Join again":
  // the host or Autodarts may have taken them out since, which the record can't know.
  assert.deepEqual(tileOf(bob, 1, { ...options, lobby }), {
    ...tileOf(bob, 1, options),
    chip: { text: "inLobby", kind: "lobby" },
    join: { text: "joinAgain", label: "joinAgainAs: Bob", again: true },
  });
  // The player on the page sits in the lobby there, and a dead session can't join
  // before it signs in again; each keeps its own chip, also when the record seats it.
  for (const profile of [
    { ...bob, active: true },
    { ...ada, active: true },
    { ...bob, needsSignIn: true },
    { ...ada, needsSignIn: true },
  ]) {
    const tile = tileOf(profile, 0, { ...options, lobby });
    assert.equal(tile.join, null, JSON.stringify(profile));
    assert.notEqual(tile.chip?.kind, "lobby");
  }
});

test("the popup says that there is no account only with nothing else to show or say", () => {
  assert.equal(showsEmpty(VIEW, ""), true);
  assert.equal(showsEmpty(VIEW, "noPage"), false);
  assert.equal(showsEmpty({ ...VIEW, unsaved: true }, ""), false);
  assert.equal(showsEmpty({ ...VIEW, adding: true }, ""), false);
  assert.equal(showsEmpty({ ...VIEW, profiles: [ada] }, ""), false);
  assert.equal(showsEmpty(VIEW, "", "forgotAll"), false);
});

test("a removal says whether Autodarts ended the sessions, and an outage as an error", () => {
  const view = VIEW;
  const bob = { action: "removeAccount", name: "Bob" };
  assert.deepEqual(statusAfter({ ok: true, ended: true, view }, null, t, bob), {
    text: "removed: Bob",
    error: false,
  });
  assert.deepEqual(
    statusAfter({ ok: true, ended: false, view }, null, t, bob),
    { text: "removedOffline: Bob", error: true },
  );
  const all = { action: "forgetAll", name: "" };
  assert.equal(removalText(all, true, t), "forgotAll");
  assert.equal(removalText(all, false, t), "forgotAllOffline");
  assert.deepEqual(statusAfter({ ok: true, ended: true, view }, null, t), {
    text: "removed: ",
    error: false,
  });
});

test("the match question of a removal says that the player signs out", () => {
  assert.deepEqual(matchQuestion("switch", t), {
    title: "matchTitle",
    text: "matchText",
    confirm: "matchConfirm",
    cancel: "matchCancel",
  });
  for (const action of ["removeAccount", "forgetAll"]) {
    assert.deepEqual(matchQuestion(action, t), {
      title: "matchTitle",
      text: "matchSignOutText",
      confirm: "matchSignOutConfirm",
      cancel: "matchCancel",
    });
  }
});

test("Forget all accounts shows in Manage accounts while an account is saved", () => {
  assert.equal(showsForgetAll(true, 1), true);
  assert.equal(showsForgetAll(true, 0), false);
  assert.equal(showsForgetAll(false, 2), false);
});

test("Manage accounts opens with the manager PIN while one guards it, and forgets it as it closes", () => {
  const closed = { managing: false, managerPin: null };
  assert.equal(mustUnlock(closed, true), true);
  assert.equal(mustUnlock(closed, false), false);
  assert.equal(
    mustUnlock({ managing: false, managerPin: "0000" }, true),
    false,
  );
  assert.equal(mustUnlock({ managing: true, managerPin: null }, true), false);

  assert.deepEqual(toggled({ managing: false, managerPin: "0000" }), {
    managing: true,
    managerPin: "0000",
  });
  assert.deepEqual(toggled({ managing: true, managerPin: "0000" }), {
    managing: false,
    managerPin: null,
  });
});
