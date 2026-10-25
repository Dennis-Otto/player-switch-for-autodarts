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
  venue: { manager: false },
  updateHint: false,
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
