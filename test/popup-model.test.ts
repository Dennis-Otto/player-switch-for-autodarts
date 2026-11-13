import assert from "node:assert/strict";
import { test } from "node:test";

import type { PlayersView, PlayerView } from "../src/messages.ts";
import {
  answered,
  BOARD_HELP,
  FILTER_FROM,
  filterTiles,
  keptManagerPin,
  matchQuestion,
  mustUnlock,
  pinQuestion,
  problemOf,
  questionOf,
  rememberRefused,
  removalText,
  showsEmpty,
  showsFilter,
  showsForgetAll,
  statusAfter,
  type Translate,
  tileOf,
  toggled,
  typedInto,
} from "../src/popup-model.ts";

/** The texts of the extension as their keys, with the substitution after a colon. */
/** The key of a text, and what fills its placeholders, in their order. */
const t: Translate = (key, substitution) =>
  substitution === undefined
    ? key
    : `${key}: ${[substitution].flat().join(", ")}`;

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
  lastPlayedAt: null,
  pin: false,
};

const VIEW: PlayersView = {
  profiles: [],
  unsaved: false,
  adding: false,
  venue: { manager: false, protectable: null, removable: null },
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
  // A saved account: the line names its username, which the owner of the board shares
  // the board with, and links to the help for a player who sees no board.
  assert.deepEqual(
    statusAfter(
      { ok: true, page: true, saved: { name: "Ada", username: "ada.l" }, view },
      null,
      t,
    ),
    {
      text: "savedAccount: Ada, ada.l",
      error: false,
      help: { anchor: BOARD_HELP, label: "savedAccountHelp" },
    },
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
  // A new PIN for an account that has one asks for the PIN that it has.
  assert.equal(
    pinQuestion({ manager: false, wrong: false }, "Ada", t, "protect").text,
    "changePinText",
  );
});

test("at a display with a manager PIN, the player who plays protects their account, or removes it once it has a PIN", () => {
  const options = { numbered: false, now: NOW, language: "en", t };
  const playing = { ...ada, active: true };
  const venue = { manager: true, protectable: ada.id, removable: null };
  assert.deepEqual(tileOf(playing, 0, { ...options, venue }).own, {
    text: "protectOwn",
    label: "protectOwn: Ada",
    kind: "protect",
  });
  assert.deepEqual(
    tileOf({ ...playing, pin: true }, 0, {
      ...options,
      venue: { manager: true, protectable: null, removable: ada.id },
    }).own,
    { text: "removeOwn", label: "removeOwn: Ada", kind: "remove" },
  );
  // The house account with a PIN, which the view names as no account to remove.
  assert.equal(
    tileOf({ ...playing, pin: true }, 0, {
      ...options,
      venue: { manager: true, protectable: null, removable: null },
    }).own,
    null,
  );
  // Nothing for a parked player, for the house account without a PIN, which the view
  // names as no account to protect, and at a display without a manager PIN.
  assert.equal(tileOf(ada, 0, { ...options, venue }).own, null);
  assert.equal(
    tileOf(playing, 0, {
      ...options,
      venue: { manager: true, protectable: null, removable: null },
    }).own,
    null,
  );
  assert.equal(
    tileOf({ ...playing, pin: true }, 0, {
      ...options,
      venue: { manager: false, protectable: null, removable: ada.id },
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

test("the match question of a removal says that the player signs out, and of a save that the page reloads", () => {
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
  assert.deepEqual(matchQuestion("adopt", t), {
    title: "matchTitle",
    text: "matchSaveText",
    confirm: "matchSaveConfirm",
    cancel: "matchCancel",
  });
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

test("the field that finds a player shows from nine saved accounts", () => {
  assert.equal(FILTER_FROM, 9);
  assert.equal(showsFilter(8), false);
  assert.equal(showsFilter(9), true);
  assert.equal(showsFilter(20), true);
});

test("the filter finds an account by its name or username, without regard to capitals and accents", () => {
  const zoe = { ...ada, id: "z", name: "Zoë Brandt", username: "zb_darts" };
  const max = { ...ada, id: "m", name: "Max", username: "maxi180" };
  const profiles = [ada, zoe, max];
  const ids = (query: string) =>
    filterTiles(profiles, query).map((profile) => profile.id);
  assert.deepEqual(ids(""), ["a", "z", "m"]);
  assert.deepEqual(ids("   "), ["a", "z", "m"]);
  assert.deepEqual(ids("zoe"), ["z"]);
  assert.deepEqual(ids(" BRANDT "), ["z"]);
  assert.deepEqual(ids("180"), ["m"]);
  assert.deepEqual(ids("a"), ["a", "z", "m"]);
  assert.deepEqual(ids("darts"), ["z"]);
  assert.deepEqual(ids("nobody"), []);
  // A copy: a change of the answer leaves the accounts alone.
  filterTiles(profiles, "").pop();
  assert.equal(profiles.length, 3);
});

test("a key outside the field types into it, but the keys of the players and the space don't", () => {
  assert.equal(typedInto("", "m"), "m");
  assert.equal(typedInto("m", "A"), "mA");
  assert.equal(typedInto("ma", "0"), "ma0");
  assert.equal(typedInto("", "é"), "é");
  assert.equal(typedInto("", "😀"), "😀");
  assert.equal(typedInto("ma", "Backspace"), "m");
  assert.equal(typedInto("a😀", "Backspace"), "a");
  // Nothing to take away: Backspace stays the browser's.
  assert.equal(typedInto("", "Backspace"), null);
  for (const key of [
    "1",
    "9",
    " ",
    "Enter",
    "Tab",
    "Escape",
    "ArrowDown",
    "F5",
  ]) {
    assert.equal(typedInto("ma", key), null, key);
  }
});

test("the keys of the tiles count among the tiles that show, so a filter brings any player within reach", () => {
  const many = Array.from({ length: 12 }, (_, index) => ({
    ...ada,
    id: `p${index}`,
    name: `Player ${String(index + 1).padStart(2, "0")}`,
  }));
  const keys = (profiles: PlayerView[]) =>
    profiles.map(
      (profile, index) =>
        tileOf(profile, index, { numbered: true, now: NOW, language: "en", t })
          .key,
    );
  // Without a filter, the twelfth player has no key.
  assert.equal(keys(many)[11], null);
  // With "12" in the field, it is the only tile, and key 1 picks it.
  assert.deepEqual(keys(filterTiles(many, "12")), ["1"]);
});
