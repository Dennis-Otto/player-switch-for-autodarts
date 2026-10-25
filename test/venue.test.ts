import assert from "node:assert/strict";
import { pbkdf2Sync } from "node:crypto";
import { test } from "node:test";

import {
  checkPin,
  forgetAccount,
  HASH_BYTES,
  hashPin,
  IDLE_MINUTES,
  type IdleAccount,
  type IdleInput,
  type IdleStep,
  idleTick,
  isPin,
  LOCKOUT_MS,
  type Lockout,
  MAX_FAILURES,
  MAX_ITERATIONS,
  NO_LOCKOUT,
  NO_VENUE,
  PBKDF2_ITERATIONS,
  type PinCheck,
  type PinHash,
  parseActivity,
  parseLockout,
  parsePinHash,
  parseVenue,
  pinOf,
  returnsAfterBreak,
  SALT_BYTES,
  setIdle,
  setManagerPin,
  setPlayerPin,
  type Venue,
  verifyPin,
  withPins,
} from "../src/venue.ts";

const MINUTE = 60_000;
// Few rounds keep the tests fast; one test checks the rounds of the extension.
const ROUNDS = 1000;

/** WebCrypto with a salt that is always the same, so a hash can be checked against Node's own. */
const fixedSalt = {
  subtle: globalThis.crypto.subtle,
  getRandomValues: <T extends ArrayBufferView | null>(array: T): T => {
    new Uint8Array(array?.buffer as ArrayBuffer).fill(7);
    return array;
  },
} as Crypto;

const hash = (pin: string) => hashPin(pin, globalThis.crypto, ROUNDS);

test("a PIN has 4 to 8 digits and nothing else", () => {
  for (const pin of ["0000", "1234", "12345678"]) {
    assert.equal(isPin(pin), true, pin);
  }
  for (const pin of [
    "",
    "123",
    "123456789",
    "12a4",
    " 1234",
    "１２３４",
    1234,
  ]) {
    assert.equal(isPin(pin), false, String(pin));
  }
});

test("hashPin keeps a salted PBKDF2 hash with SHA-256, never the PIN", async () => {
  const stored = await hashPin("4711", fixedSalt, ROUNDS);
  const salt = new Uint8Array(SALT_BYTES).fill(7);
  assert.deepEqual(stored, {
    salt: Buffer.from(salt).toString("base64"),
    hash: pbkdf2Sync("4711", salt, ROUNDS, HASH_BYTES, "sha256").toString(
      "base64",
    ),
    iterations: ROUNDS,
  });
  assert.equal(JSON.stringify(stored).includes("4711"), false);
});

test("hashPin takes 600,000 rounds by default, as OWASP recommends", async () => {
  const stored = await hashPin("2468");
  assert.equal(PBKDF2_ITERATIONS, 600_000);
  assert.equal(stored.iterations, PBKDF2_ITERATIONS);
  assert.equal(await verifyPin("2468", stored), true);
});

test("each hash of the same PIN has a salt of its own", async () => {
  const [first, second] = await Promise.all([hash("1234"), hash("1234")]);
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash);
});

test("hashPin refuses a value that is no PIN", async () => {
  await assert.rejects(hash("12"), RangeError);
});

test("verifyPin accepts the PIN alone", async () => {
  const stored = await hash("1234");
  assert.equal(await verifyPin("1234", stored), true);
  assert.equal(await verifyPin("1235", stored), false);
  assert.equal(await verifyPin("12345", stored), false);
  assert.equal(await verifyPin(1234, stored), false);
  assert.equal(await verifyPin(undefined, stored), false);
});

test("verifyPin refuses a hash that was changed by hand", async () => {
  const stored = await hash("1234");
  assert.equal(await verifyPin("1234", { ...stored, salt: "%%%" }), false);
  assert.equal(await verifyPin("1234", { ...stored, hash: "AAAA" }), false);
  assert.equal(await verifyPin("1234", { ...stored, hash: "%%%" }), false);
});

test("parsePinHash takes a stored hash and refuses anything else", async () => {
  const stored = await hash("1234");
  assert.deepEqual(parsePinHash(stored), stored);
  assert.deepEqual(parsePinHash({ ...stored, extra: 1 }), stored);
  const broken: unknown[] = [
    null,
    "1234",
    {},
    { ...stored, salt: 1 },
    { ...stored, hash: null },
    { ...stored, salt: "%%%" },
    { ...stored, hash: "AAAA" },
    { ...stored, iterations: "1000" },
    { ...stored, iterations: 1.5 },
    { ...stored, iterations: 0 },
    { ...stored, iterations: MAX_ITERATIONS + 1 },
  ];
  for (const value of broken) {
    assert.equal(parsePinHash(value), null, JSON.stringify(value));
  }
  assert.deepEqual(parsePinHash({ ...stored, iterations: MAX_ITERATIONS }), {
    ...stored,
    iterations: MAX_ITERATIONS,
  });
});

test("parseVenue is off for nothing or for a value it doesn't know", () => {
  for (const value of [undefined, null, 5, "venue", []]) {
    assert.deepEqual(parseVenue(value), NO_VENUE);
  }
  assert.deepEqual(NO_VENUE, {
    manager: null,
    players: {},
    idleMinutes: null,
    house: null,
  });
});

test("parseVenue keeps what is valid and drops the rest", async () => {
  const pin = await hash("1234");
  assert.deepEqual(
    parseVenue({
      manager: pin,
      players: { a: pin, b: { salt: 1 }, c: null },
      idleMinutes: 15,
      house: "a",
    }),
    { manager: pin, players: { a: pin }, idleMinutes: 15, house: "a" },
  );
  assert.deepEqual(
    parseVenue({ manager: "1234", players: "a", idleMinutes: 7, house: "" }),
    NO_VENUE,
  );
  assert.deepEqual(
    parseVenue({ players: null, idleMinutes: "15", house: 3 }),
    NO_VENUE,
  );
});

test("the breaks on offer are 5 to 60 minutes", () => {
  assert.deepEqual(IDLE_MINUTES, [5, 10, 15, 30, 60]);
});

test("the manager PIN and the PIN of each account are set and taken away", async () => {
  const pin = await hash("1234");
  const guarded = setManagerPin(NO_VENUE, pin);
  assert.equal(guarded.manager, pin);
  assert.equal(setManagerPin(guarded, null).manager, null);

  const withA = setPlayerPin(NO_VENUE, "a", pin);
  assert.deepEqual(withA.players, { a: pin });
  assert.deepEqual(NO_VENUE.players, {}, "the venue before stays as it was");
  assert.deepEqual(setPlayerPin(withA, "a", null).players, {});
  assert.deepEqual(setPlayerPin(withA, "b", null).players, { a: pin });
});

test("setIdle takes the breaks on offer and turns the return off for any other", () => {
  assert.deepEqual(setIdle(NO_VENUE, 10, "a"), {
    ...NO_VENUE,
    idleMinutes: 10,
    house: "a",
  });
  assert.deepEqual(setIdle(NO_VENUE, 30, null), {
    ...NO_VENUE,
    idleMinutes: 30,
  });
  for (const minutes of [null, 0, 7, "10", -5, Number.NaN]) {
    assert.equal(setIdle(NO_VENUE, minutes, "a").idleMinutes, null);
  }
  assert.equal(setIdle(NO_VENUE, 10, "").house, null);
  assert.equal(setIdle(NO_VENUE, 10, 5).house, null);
  assert.equal(returnsAfterBreak(setIdle(NO_VENUE, 5, null)), true);
  assert.equal(returnsAfterBreak(NO_VENUE), false);
});

test("a removed account takes its PIN along and is no longer the house account", async () => {
  const pin = await hash("1234");
  const venue: Venue = {
    ...NO_VENUE,
    players: { a: pin, b: pin },
    idleMinutes: 10,
    house: "a",
  };
  assert.deepEqual(forgetAccount(venue, "a"), {
    ...venue,
    players: { b: pin },
    house: null,
  });
  assert.deepEqual(forgetAccount(venue, "b"), {
    ...venue,
    players: { a: pin },
  });
});

test("withPins marks the accounts that ask for a PIN, without the hash", async () => {
  const venue = setPlayerPin(NO_VENUE, "b", await hash("1234"));
  assert.deepEqual(withPins([{ id: "a" }, { id: "b" }], venue), [
    { id: "a", pin: false },
    { id: "b", pin: true },
  ]);
  // A name that every object has is no account with a PIN.
  assert.deepEqual(withPins([{ id: "toString" }], venue), [
    { id: "toString", pin: false },
  ]);
});

test("pinOf finds the PIN of an account and of nothing else", async () => {
  const pin = await hash("1234");
  const venue = setPlayerPin(NO_VENUE, "a", pin);
  assert.equal(pinOf(venue, "a"), pin);
  for (const id of ["b", "__proto__", "constructor", 5, undefined]) {
    assert.equal(pinOf(venue, id), null, String(id));
  }
});

test("parseActivity reads a time and nothing else", () => {
  assert.equal(parseActivity(1234), 1234);
  for (const value of [undefined, null, "1234", Number.NaN]) {
    assert.equal(parseActivity(value), null);
  }
});

test("parseLockout counts nothing for a value it doesn't know", () => {
  assert.deepEqual(parseLockout(undefined), NO_LOCKOUT);
  assert.deepEqual(parseLockout("x"), NO_LOCKOUT);
  assert.deepEqual(parseLockout({ failures: 2, last: 400, until: 500 }), {
    failures: 2,
    last: 400,
    until: 500,
  });
  assert.deepEqual(
    parseLockout({
      failures: -1,
      last: Number.NaN,
      until: Number.POSITIVE_INFINITY,
    }),
    NO_LOCKOUT,
  );
  assert.deepEqual(parseLockout({ failures: 1.5, until: "9" }), NO_LOCKOUT);
});

test("checkPin lets every request pass that no PIN guards", async () => {
  const result = await checkPin(null, undefined, NO_LOCKOUT, 0);
  assert.deepEqual(result, { check: { kind: "ok" }, lockout: NO_LOCKOUT });
});

test("checkPin asks for the PIN without counting a failure", async () => {
  const guard = await hash("1234");
  const lockout: Lockout = { failures: 3, last: 0, until: 0 };
  for (const pin of [undefined, null]) {
    assert.deepEqual(await checkPin(guard, pin, lockout, 0), {
      check: { kind: "ask" },
      lockout,
    });
  }
});

test("checkPin takes the right PIN and leaves the count alone", async () => {
  const guard = await hash("1234");
  const lockout: Lockout = { failures: 4, last: 0, until: 0 };
  assert.deepEqual(await checkPin(guard, "1234", lockout, 0), {
    check: { kind: "ok" },
    lockout,
  });
});

test("a right PIN of another account doesn't end the row of wrong ones", async () => {
  const pinOfA = await hash("1234");
  const pinOfB = await hash("5678");
  let lockout = NO_LOCKOUT;
  let now = 1_000_000;
  for (let attempt = 1; attempt < MAX_FAILURES; attempt += 1) {
    lockout = (await checkPin(pinOfA, "0000", lockout, now)).lockout;
    now += 1000;
  }
  // The guesser types their own right PIN on their own tile in between.
  const own = await checkPin(pinOfB, "5678", lockout, now);
  assert.equal(own.check.kind, "ok");
  now += 1000;
  const fifth = await checkPin(pinOfA, "0000", own.lockout, now);
  assert.deepEqual(fifth.check, { kind: "locked", retryInMs: LOCKOUT_MS });
});

test("the row of wrong PINs ends a minute after the last one", async () => {
  const guard = await hash("1234");
  const lockout: Lockout = { failures: 4, last: 1_000_000, until: 0 };
  assert.deepEqual(
    await checkPin(guard, "0000", lockout, 1_000_000 + LOCKOUT_MS),
    {
      check: { kind: "wrong" },
      lockout: { failures: 1, last: 1_000_000 + LOCKOUT_MS, until: 0 },
    },
  );
});

test("five wrong PINs in a row lock every PIN for a minute", async () => {
  const guard = await hash("1234");
  let lockout = NO_LOCKOUT;
  let now = 1_000_000;
  const steps: PinCheck["kind"][] = [];
  for (let attempt = 1; attempt <= MAX_FAILURES; attempt += 1) {
    // Something that is no PIN at all counts as a wrong one.
    const result = await checkPin(
      guard,
      attempt === 1 ? "abc" : "0000",
      lockout,
      now,
    );
    steps.push(result.check.kind);
    lockout = result.lockout;
    now += 1000;
  }
  assert.deepEqual(steps, ["wrong", "wrong", "wrong", "wrong", "locked"]);
  assert.equal(MAX_FAILURES, 5);
  assert.equal(LOCKOUT_MS, MINUTE);

  // While locked, not even the right PIN passes, and the wait is told.
  const locked = await checkPin(guard, "1234", lockout, now);
  assert.deepEqual(locked, {
    check: { kind: "locked", retryInMs: LOCKOUT_MS - 1000 },
    lockout,
  });
  // A request without a PIN hears of the lock as well, before it is asked for one.
  assert.equal(
    (await checkPin(guard, undefined, lockout, now)).check.kind,
    "locked",
  );

  // A minute after the last wrong PIN, the right one passes again, and a new row starts.
  now = lockout.until;
  assert.deepEqual(await checkPin(guard, "1234", lockout, now), {
    check: { kind: "ok" },
    lockout,
  });
  assert.equal(
    (await checkPin(guard, "0000", lockout, now)).check.kind,
    "wrong",
  );
});

const ada: IdleAccount = { id: "a", active: false, needsSignIn: false };
const bob: IdleAccount = { id: "b", active: false, needsSignIn: false };
const playing = (account: IdleAccount): IdleAccount => ({
  ...account,
  active: true,
});

function input(overrides: Partial<IdleInput>): IdleInput {
  return {
    venue: { ...NO_VENUE, idleMinutes: 10, house: "a" },
    profiles: [ada, playing(bob)],
    unsaved: false,
    lastActivity: 0,
    now: 10 * MINUTE,
    matchRunning: false,
    ...overrides,
  };
}

const step = (overrides: Partial<IdleInput>): IdleStep =>
  idleTick(input(overrides)).step;

test("the display stays as it is while the venue mode doesn't return it", () => {
  const venue = { ...NO_VENUE, house: "a" };
  assert.deepEqual(idleTick(input({ venue, lastActivity: 5 })), {
    step: { kind: "off" },
    lastActivity: 5,
  });
});

test("after the break, the display returns to the house account", () => {
  assert.deepEqual(step({ now: 10 * MINUTE - 1 }), { kind: "wait" });
  assert.deepEqual(idleTick(input({})), {
    step: { kind: "switch", id: "a" },
    lastActivity: 0,
  });
});

test("a display that plays under the house account stays", () => {
  assert.deepEqual(step({ profiles: [playing(ada), bob] }), { kind: "home" });
});

test("without a house account, the display signs out after the break", () => {
  const venue = { ...NO_VENUE, idleMinutes: 10 };
  assert.deepEqual(step({ venue }), { kind: "signout" });
  // A session in the page that no account keeps signs out as well.
  assert.deepEqual(step({ venue, profiles: [ada, bob], unsaved: true }), {
    kind: "signout",
  });
  // Nobody is signed in: nothing to do.
  assert.deepEqual(step({ venue, profiles: [ada, bob] }), { kind: "home" });
});

test("a house account that has to sign in again, or is gone, signs the display out", () => {
  const stale = { ...ada, needsSignIn: true };
  assert.deepEqual(step({ profiles: [stale, playing(bob)] }), {
    kind: "signout",
  });
  assert.deepEqual(step({ profiles: [playing(bob)] }), { kind: "signout" });
});

test("with no input known yet, as after a restart, the break starts now", () => {
  assert.deepEqual(idleTick(input({ lastActivity: null, now: 99 * MINUTE })), {
    step: { kind: "wait" },
    lastActivity: 99 * MINUTE,
  });
});

/**
 * Runs the worker's look at the display once a minute on a fake clock, as its alarm
 * does, and records each step: `matchUntil` is when a match that runs from the start
 * ends, `touches` the minutes with an input on the page.
 */
function simulate({
  minutes,
  matchUntil = 0,
  touches = [],
}: {
  minutes: number;
  matchUntil?: number;
  touches?: number[];
}): { minute: number; step: IdleStep }[] {
  const venue: Venue = { ...NO_VENUE, idleMinutes: 10, house: "a" };
  let profiles: IdleAccount[] = [ada, playing(bob)];
  let lastActivity: number | null = null;
  const log: { minute: number; step: IdleStep }[] = [];
  for (let minute = 0; minute <= minutes; minute += 1) {
    const now = minute * MINUTE;
    if (touches.includes(minute)) {
      lastActivity = now;
    }
    const tick = idleTick({
      venue,
      profiles,
      unsaved: false,
      lastActivity,
      now,
      matchRunning: minute < matchUntil,
    });
    lastActivity = tick.lastActivity;
    if (tick.step.kind === "switch") {
      log.push({ minute, step: tick.step });
      profiles = [playing(ada), bob];
    }
  }
  return log;
}

test("the return never interrupts a match, however long nobody touches the display", () => {
  // A match of two hours that the board scores by itself: no input at all.
  assert.deepEqual(simulate({ minutes: 120, matchUntil: 121 }), []);
  assert.deepEqual(step({ matchRunning: true, now: 500 * MINUTE }), {
    kind: "match",
  });
});

test("the break starts only once the match has ended", () => {
  // The match ends after 45 minutes; the display returns ten minutes after the last
  // look that saw it, once.
  assert.deepEqual(simulate({ minutes: 90, matchUntil: 45 }), [
    { minute: 54, step: { kind: "switch", id: "a" } },
  ]);
});

test("each input on the page starts the break again", () => {
  assert.deepEqual(simulate({ minutes: 60, touches: [3, 11, 19] }), [
    { minute: 29, step: { kind: "switch", id: "a" } },
  ]);
});

test("a PIN never sits in the stored settings", async () => {
  const pin: PinHash = await hash("8642");
  const venue = setIdle(
    setPlayerPin(setManagerPin(NO_VENUE, pin), "a", pin),
    10,
    "a",
  );
  assert.equal(JSON.stringify(venue).includes("8642"), false);
  assert.deepEqual(parseVenue(JSON.parse(JSON.stringify(venue))), venue);
});
