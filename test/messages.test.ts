import assert from "node:assert/strict";
import { test } from "node:test";

import { readRequest } from "../src/messages.ts";

test("readRequest takes every request that the pages and the content script send", () => {
  for (const message of [
    { type: "popup", action: "view" },
    { type: "popup", action: "switch", id: "a" },
    { type: "popup", action: "switch", id: "a", pin: "1234", confirmed: true },
    { type: "popup", action: "adopt" },
    { type: "popup", action: "signout", confirmed: false },
    { type: "popup", action: "openPage" },
    { type: "popup", action: "stopAdding" },
    {
      type: "popup",
      action: "remember",
      id: "a",
      username: "ada",
      password: "secret",
      managerPin: "0000",
    },
    { type: "popup", action: "forgetPassword", id: "a" },
    { type: "popup", action: "removeAccount", id: "a" },
    { type: "popup", action: "unlock", managerPin: "0000" },
    { type: "venue", action: "status" },
    { type: "venue", action: "unlock", managerPin: "0000" },
    { type: "venue", action: "managerPin", pin: "1234" },
    { type: "venue", action: "managerPin", pin: null },
    { type: "venue", action: "playerPin", id: "a", pin: "1234" },
    { type: "venue", action: "playerPin", id: "a", pin: null },
    { type: "venue", action: "idle", minutes: 5, house: "a" },
    { type: "venue", action: "idle", minutes: null, house: null },
    { type: "button" },
    { type: "activity" },
    { type: "switcher", action: "close" },
  ]) {
    assert.equal(readRequest(message), message, JSON.stringify(message));
  }
});

test("readRequest turns away a message of a shape that the worker doesn't know", () => {
  for (const message of [
    null,
    undefined,
    "view",
    42,
    {},
    { type: "page", action: "read" },
    { type: "popup" },
    { type: "popup", action: 1 },
    { type: "popup", action: "toString" },
    { type: "popup", action: "steal" },
    { type: "popup", action: "switch" },
    { type: "popup", action: "switch", id: 7 },
    { type: "popup", action: "remember", id: "a", username: "ada" },
    { type: "popup", action: "view", managerPin: 1234 },
    { type: "popup", action: "switch", id: "a", pin: 1234 },
    { type: "popup", action: "signout", confirmed: "yes" },
    { type: "venue", action: "managerPin" },
    { type: "venue", action: "playerPin", id: "a", pin: 1234 },
    { type: "venue", action: "idle", minutes: "5", house: null },
    { type: "venue", action: "idle", minutes: 5, house: 3 },
    { type: "venue", action: "status", managerPin: 0 },
    { type: "venue", action: "wipe" },
    { type: "switcher", action: "open" },
  ]) {
    assert.equal(readRequest(message), null, JSON.stringify(message));
  }
});
