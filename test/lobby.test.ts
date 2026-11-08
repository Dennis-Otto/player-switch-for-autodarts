import assert from "node:assert/strict";
import { test } from "node:test";

import {
  KEPT_LOBBIES,
  parseSeats,
  type Seats,
  seatsIn,
  withSeat,
} from "../src/lobby.ts";

const LOBBY = "0b5a1c2d-0000-4000-8000-000000000001";
const OTHER = "0b5a1c2d-0000-4000-8000-000000000002";

test("the record names who took a seat in each lobby, in the order of their seats", () => {
  let seats: Seats = [];
  seats = withSeat(seats, LOBBY, "bob");
  seats = withSeat(seats, OTHER, "cy");
  seats = withSeat(seats, LOBBY, "dee");

  assert.deepEqual(seatsIn(seats, LOBBY), ["bob", "dee"]);
  assert.deepEqual(seatsIn(seats, OTHER), ["cy"]);
  assert.deepEqual(seatsIn(seats, "a lobby it doesn't know"), []);
  // The lobby used last is at the end, so the one used longest ago goes first.
  assert.deepEqual(
    seats.map(({ lobby }) => lobby),
    [OTHER, LOBBY],
  );
});

test("a second seat of the same player in the same lobby is no new one", () => {
  const once = withSeat([], LOBBY, "bob");
  assert.deepEqual(withSeat(once, LOBBY, "bob"), once);
});

test("the record keeps the last lobbies only", () => {
  let seats: Seats = [];
  for (let index = 0; index <= KEPT_LOBBIES; index += 1) {
    seats = withSeat(seats, `lobby-${index}`, "bob");
  }
  assert.equal(seats.length, KEPT_LOBBIES);
  assert.deepEqual(seatsIn(seats, "lobby-0"), []);
  assert.deepEqual(seatsIn(seats, `lobby-${KEPT_LOBBIES}`), ["bob"]);
});

test("a record that storage gives back reads as it was saved", () => {
  const seats = withSeat(withSeat([], LOBBY, "bob"), OTHER, "cy");
  assert.deepEqual(parseSeats(structuredClone(seats)), seats);
});

test("a broken record counts as none, and a broken entry is left out", () => {
  for (const stored of [undefined, null, "lobby", 42, { lobby: LOBBY }]) {
    assert.deepEqual(parseSeats(stored), [], JSON.stringify(stored));
  }
  assert.deepEqual(
    parseSeats([
      null,
      "lobby",
      { lobby: 42, accounts: ["bob"] },
      { lobby: OTHER, accounts: "bob" },
      { lobby: OTHER, accounts: ["bob", 7] },
      { lobby: LOBBY, accounts: ["bob"] },
    ]),
    [{ lobby: LOBBY, accounts: ["bob"] }],
  );
  // More lobbies than it keeps: the newest stay.
  const many = Array.from({ length: KEPT_LOBBIES + 2 }, (_, index) => ({
    lobby: `lobby-${index}`,
    accounts: ["bob"],
  }));
  assert.deepEqual(parseSeats(many), many.slice(2));
});
