import assert from "node:assert/strict";
import { test } from "node:test";

import type { VenueStatus } from "../src/messages.ts";
import {
  cornerChoices,
  houseChoices,
  idleChoices,
  idleRequest,
  managerView,
  playerRowView,
  venueReport,
} from "../src/options-model.ts";
import { IDLE_MINUTES } from "../src/venue.ts";

const t = (key: string, substitution?: string) =>
  substitution === undefined ? key : `${key}: ${substitution}`;

const STATUS: VenueStatus = {
  manager: false,
  idleMinutes: null,
  house: null,
  accounts: [
    { id: "a", name: "Ada", username: "ada", pin: true },
    { id: "b", name: "Bob", username: "bob", pin: false },
  ],
};

test("the corners lie as on the screen: the top ones first", () => {
  assert.deepEqual(cornerChoices(t), [
    { value: "top-left", text: "cornerTopLeft" },
    { value: "top-right", text: "cornerTopRight" },
    { value: "bottom-left", text: "cornerBottomLeft" },
    { value: "bottom-right", text: "cornerBottomRight" },
  ]);
});

test("the page says how a request of the venue mode went", () => {
  const status = STATUS;
  assert.equal(venueReport(undefined, t), "error");
  assert.equal(venueReport({ error: "error", status: null }, t), "error");
  assert.equal(venueReport({ ok: true, status }, t), "saved");
  assert.equal(
    venueReport({ ok: false, reason: "locked", retryIn: 1, status }, t),
    "pinLocked",
  );
  assert.equal(
    venueReport({ ok: false, reason: "invalid", status }, t),
    "pinInvalid",
  );
  // The person cancelled the question for the manager PIN.
  assert.equal(
    venueReport(
      { ok: false, reason: "pin", pin: "manager", wrong: false, status },
      t,
    ),
    "",
  );
});

test("the page offers to set the manager PIN, or to change and remove it", () => {
  assert.deepEqual(managerView(STATUS, t), {
    state: "managerPinOff",
    set: "setManagerPin",
    removable: false,
  });
  assert.deepEqual(managerView({ ...STATUS, manager: true }, t), {
    state: "managerPinOn",
    set: "changeManagerPin",
    removable: true,
  });
});

test("each account says whether it has a PIN, and only one with a PIN offers to remove it", () => {
  const [ada, bob] = STATUS.accounts;
  assert.ok(ada && bob);
  assert.deepEqual(playerRowView(ada, t), {
    state: "ada · pinSet",
    change: "changePin",
    removable: true,
  });
  assert.deepEqual(playerRowView(bob, t), {
    state: "bob · noPin",
    change: "setPin",
    removable: false,
  });
});

test("the return after a break offers never and each break, and returns to a sign-out or an account", () => {
  const idle = idleChoices(t);
  assert.deepEqual(idle[0], { value: "", text: "idleNever" });
  assert.deepEqual(
    idle.slice(1).map((choice) => choice.value),
    IDLE_MINUTES.map(String),
  );
  assert.equal(idle[1]?.text, `idleMinutes: ${IDLE_MINUTES[0]}`);
  assert.deepEqual(houseChoices(STATUS, t), [
    { value: "", text: "idleSignOut" },
    { value: "a", text: "Ada" },
    { value: "b", text: "Bob" },
  ]);
});

test("the two lists of the return make one request", () => {
  assert.deepEqual(idleRequest("", ""), {
    action: "idle",
    minutes: null,
    house: null,
  });
  assert.deepEqual(idleRequest("15", "a"), {
    action: "idle",
    minutes: 15,
    house: "a",
  });
});
