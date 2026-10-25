/**
 * The venue mode, for a display in a club or a pub, where not everyone at the board
 * knows everyone else: a manager PIN that guards "Manage accounts" and the settings, a
 * PIN for each account that wants one, asked before a switch to it, and the return to a
 * house account, or a sign-out, after a break without input on the Autodarts page.
 * Everything is off until a person turns it on, on the options page.
 *
 * A PIN is a lock for the people at the display, not a protection against someone who
 * can use the computer: the extension keeps only a salted PBKDF2 hash of it, never the
 * PIN itself, but four digits are quickly tried by a program that reads the profile of
 * the browser (see docs/security.md). At the display, five wrong PINs in a row lock the
 * PINs for a minute.
 *
 * The service worker imports this file from lib/ and passes in the clock and what the
 * Autodarts tabs show; nothing here reaches the storage or the page. The hashing is
 * WebCrypto, `globalThis.crypto`, in the browser and in Node alike.
 */
import { fromBase64, toBase64 } from "./vault.ts";

/** The key under which the extension keeps the settings of the venue mode in its storage. */
export const VENUE_KEY = "venue";
/** The key of the wrong PINs in a row, in `chrome.storage.session`: see `Lockout`. */
export const LOCKOUT_KEY = "venueLockout";
/** The key of the last input on the Autodarts page, in `chrome.storage.session`. */
export const ACTIVITY_KEY = "venueActivity";

/** A PIN has 4 to 8 digits; the options page asks for 4 by default. */
export const PIN_PATTERN = /^\d{4,8}$/;
/** The rounds of PBKDF2 with SHA-256, as OWASP recommends them for 2023 and later. */
export const PBKDF2_ITERATIONS = 600_000;
/** The most rounds that a stored hash may ask for, so a broken value can't hold up a check. */
export const MAX_ITERATIONS = 10_000_000;
/** The bytes of the random salt of each PIN. */
export const SALT_BYTES = 16;
/** The bytes of the hash. */
export const HASH_BYTES = 32;

/** The breaks after which the display returns, in minutes, as the options page offers them. */
export const IDLE_MINUTES: readonly number[] = [5, 10, 15, 30, 60];

/** How many wrong PINs in a row lock the PINs, and for how long. */
export const MAX_FAILURES = 5;
export const LOCKOUT_MS = 60_000;

const MINUTE = 60_000;

/** A PIN as the extension keeps it: a salted hash, and the rounds that made it. */
export interface PinHash {
  salt: string;
  hash: string;
  iterations: number;
}

/** What a person set for the venue mode. */
export interface Venue {
  /** The manager PIN, which guards "Manage accounts" and the settings; null when none is set. */
  manager: PinHash | null;
  /** The PIN of each account that has one, by the id of the account. */
  players: Readonly<Record<string, PinHash>>;
  /** After how many minutes without input the display returns; null when it never does. */
  idleMinutes: number | null;
  /** The account that the display returns to, or null when it signs out instead. */
  house: string | null;
}

/** The venue mode is off until a person turns it on. */
export const NO_VENUE: Venue = {
  manager: null,
  players: {},
  idleMinutes: null,
  house: null,
};

/** Whether a value is a PIN: 4 to 8 digits. */
export function isPin(value: unknown): value is string {
  return typeof value === "string" && PIN_PATTERN.test(value);
}

const encoder = new TextEncoder();

async function derive(
  pin: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
  crypto: Crypto,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/** Makes the hash of a PIN, with a salt of its own. Fails for a value that is no PIN. */
export async function hashPin(
  pin: string,
  crypto: Crypto = globalThis.crypto,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<PinHash> {
  if (!isPin(pin)) {
    throw new RangeError("A PIN has 4 to 8 digits.");
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(pin, salt, iterations, crypto);
  return { salt: toBase64(salt), hash: toBase64(hash), iterations };
}

/** Compares two hashes of the same length in a time that doesn't tell how many bytes agree. */
function same(a: Uint8Array, b: Uint8Array): boolean {
  return (
    a.reduce(
      (difference, byte, index) => difference | (byte ^ (b[index] as number)),
      0,
    ) === 0
  );
}

/** Whether a value is the PIN of a hash. */
export async function verifyPin(
  pin: unknown,
  stored: PinHash,
  crypto: Crypto = globalThis.crypto,
): Promise<boolean> {
  const salt = fromBase64(stored.salt);
  const hash = fromBase64(stored.hash);
  if (!isPin(pin) || salt === null || hash?.length !== HASH_BYTES) {
    return false;
  }
  return same(await derive(pin, salt, stored.iterations, crypto), hash);
}

/** A stored hash, or null when the value is none, such as one that was changed by hand. */
export function parsePinHash(value: unknown): PinHash | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const { salt, hash, iterations } = value as Record<string, unknown>;
  if (
    typeof salt !== "string" ||
    typeof hash !== "string" ||
    fromBase64(salt) === null ||
    fromBase64(hash)?.length !== HASH_BYTES ||
    typeof iterations !== "number" ||
    !Number.isInteger(iterations) ||
    iterations < 1 ||
    iterations > MAX_ITERATIONS
  ) {
    return null;
  }
  return { salt, hash, iterations };
}

/**
 * Reads the stored settings of the venue mode, and takes the default for each one that
 * is missing or that it doesn't know, such as one an older or newer version wrote.
 */
export function parseVenue(stored: unknown): Venue {
  if (stored === null || typeof stored !== "object") {
    return NO_VENUE;
  }
  const { manager, players, idleMinutes, house } = stored as Record<
    string,
    unknown
  >;
  const pins: Record<string, PinHash> = {};
  if (players !== null && typeof players === "object") {
    for (const [id, value] of Object.entries(players)) {
      const pin = parsePinHash(value);
      if (pin !== null) {
        pins[id] = pin;
      }
    }
  }
  return {
    manager: parsePinHash(manager),
    players: pins,
    idleMinutes:
      typeof idleMinutes === "number" && IDLE_MINUTES.includes(idleMinutes)
        ? idleMinutes
        : null,
    house: typeof house === "string" && house !== "" ? house : null,
  };
}

/** Sets the manager PIN, or takes it away with null. */
export function setManagerPin(venue: Venue, pin: PinHash | null): Venue {
  return { ...venue, manager: pin };
}

/** Sets the PIN of an account, or takes it away with null. */
export function setPlayerPin(
  venue: Venue,
  id: string,
  pin: PinHash | null,
): Venue {
  const players = { ...venue.players };
  if (pin === null) {
    delete players[id];
  } else {
    players[id] = pin;
  }
  return { ...venue, players };
}

/**
 * Sets the return after a break: after how many minutes, of those the options page
 * offers, or never with null, and to which account, or a sign-out with null. A value
 * that the options page doesn't offer turns the return off.
 */
export function setIdle(venue: Venue, minutes: unknown, house: unknown): Venue {
  return {
    ...venue,
    idleMinutes:
      typeof minutes === "number" && IDLE_MINUTES.includes(minutes)
        ? minutes
        : null,
    house: typeof house === "string" && house !== "" ? house : null,
  };
}

/** Forgets what the venue mode keeps of a removed account: its PIN, and it as the house account. */
export function forgetAccount(venue: Venue, id: string): Venue {
  const without = setPlayerPin(venue, id, null);
  return venue.house === id ? { ...without, house: null } : without;
}

/** Whether the venue mode returns the display after a break. */
export function returnsAfterBreak(venue: Venue): boolean {
  return venue.idleMinutes !== null;
}

/** The PIN that guards a switch to an account, or null when it has none. */
export function pinOf(venue: Venue, id: unknown): PinHash | null {
  return typeof id === "string" && Object.hasOwn(venue.players, id)
    ? (venue.players[id] as PinHash)
    : null;
}

/** The time of the last input on the page as the worker keeps it, or null when it has none. */
export function parseActivity(stored: unknown): number | null {
  return typeof stored === "number" && Number.isFinite(stored) ? stored : null;
}

/** Marks each account of a view that asks for a PIN, without the hash. */
export function withPins<Profile extends { id: string }>(
  profiles: readonly Profile[],
  venue: Venue,
): (Profile & { pin: boolean })[] {
  return profiles.map((profile) => ({
    ...profile,
    pin: pinOf(venue, profile.id) !== null,
  }));
}

/**
 * The wrong PINs in a row, the time of the last one, and until when the PINs are
 * locked after too many. The row is shared by every PIN of the display and ends only
 * when a minute passes without a wrong PIN, not with a right one: otherwise a person
 * with a PIN of their own could clear the count between guesses at another PIN.
 */
export interface Lockout {
  failures: number;
  last: number;
  until: number;
}

export const NO_LOCKOUT: Lockout = { failures: 0, last: 0, until: 0 };

/** Reads the stored lockout; anything it doesn't know counts as none. */
export function parseLockout(stored: unknown): Lockout {
  if (stored === null || typeof stored !== "object") {
    return NO_LOCKOUT;
  }
  const { failures, last, until } = stored as Record<string, unknown>;
  return {
    failures:
      typeof failures === "number" && Number.isInteger(failures) && failures > 0
        ? failures
        : 0,
    last: typeof last === "number" && Number.isFinite(last) ? last : 0,
    until: typeof until === "number" && Number.isFinite(until) ? until : 0,
  };
}

/** How the check of a PIN came out. */
export type PinCheck =
  | { kind: "ok" }
  /** The request carries no PIN: the person is asked for it. */
  | { kind: "ask" }
  /** The PIN is wrong; the person may try again. */
  | { kind: "wrong" }
  /** Too many wrong PINs in a row: no PIN is checked for a while. */
  | { kind: "locked"; retryInMs: number };

/**
 * Checks the PIN that a request carries against the hash that guards it, and counts the
 * wrong ones: the fifth in a row locks every PIN for a minute. A right PIN passes but
 * leaves the count alone; the row ends a minute after its last wrong PIN. A request that nothing guards passes, and one that carries no PIN asks for
 * it, either without a check or a count.
 */
export async function checkPin(
  guard: PinHash | null,
  pin: unknown,
  lockout: Lockout,
  now: number,
  crypto: Crypto = globalThis.crypto,
): Promise<{ check: PinCheck; lockout: Lockout }> {
  if (guard === null) {
    return { check: { kind: "ok" }, lockout };
  }
  if (now < lockout.until) {
    return {
      check: { kind: "locked", retryInMs: lockout.until - now },
      lockout,
    };
  }
  if (pin === undefined || pin === null) {
    return { check: { kind: "ask" }, lockout };
  }
  if (await verifyPin(pin, guard, crypto)) {
    return { check: { kind: "ok" }, lockout };
  }
  const row = now - lockout.last < LOCKOUT_MS ? lockout.failures : 0;
  const failures = row + 1;
  if (failures >= MAX_FAILURES) {
    return {
      check: { kind: "locked", retryInMs: LOCKOUT_MS },
      lockout: { failures: 0, last: now, until: now + LOCKOUT_MS },
    };
  }
  return {
    check: { kind: "wrong" },
    lockout: { failures, last: now, until: 0 },
  };
}

/** What the return after a break needs to know of each account. */
export interface IdleAccount {
  id: string;
  active: boolean;
  needsSignIn: boolean;
}

/** What the display shows when the worker looks whether a break is over. */
export interface IdleInput {
  venue: Venue;
  profiles: readonly IdleAccount[];
  /** The page holds a session that no saved account keeps. */
  unsaved: boolean;
  /** The last input on the Autodarts page, or null when the worker knows of none yet. */
  lastActivity: number | null;
  now: number;
  /** A match runs in an Autodarts tab. */
  matchRunning: boolean;
}

/** What to do now. */
export type IdleStep =
  /** The venue mode doesn't return the display. */
  | { kind: "off" }
  /** A match runs: it never ends by a return, and counts as input. */
  | { kind: "match" }
  /** The break isn't long enough yet. */
  | { kind: "wait" }
  /** The display is where it returns to already. */
  | { kind: "home" }
  /** Switch to the house account, which parks the session of the player before. */
  | { kind: "switch"; id: string }
  /** Sign the page out, which parks the session of the player before. */
  | { kind: "signout" };

/**
 * Decides, each time the worker looks, whether the break on the display is over and
 * where it returns to, and gives the time of the last input to keep. A match that runs
 * is never interrupted: it counts as input, so the break starts only once the match has
 * ended. With no input known yet, as after a restart of the browser, the break starts
 * now. A house account that has to sign in again can't take over the page, so the page
 * signs out instead.
 */
export function idleTick(input: IdleInput): {
  step: IdleStep;
  lastActivity: number | null;
} {
  const { venue, profiles, unsaved, now } = input;
  if (venue.idleMinutes === null) {
    return { step: { kind: "off" }, lastActivity: input.lastActivity };
  }
  if (input.matchRunning) {
    return { step: { kind: "match" }, lastActivity: now };
  }
  const lastActivity = input.lastActivity ?? now;
  if (now - lastActivity < venue.idleMinutes * MINUTE) {
    return { step: { kind: "wait" }, lastActivity };
  }
  const house = profiles.find(
    (profile) => profile.id === venue.house && !profile.needsSignIn,
  );
  if (house !== undefined) {
    return {
      step: house.active ? { kind: "home" } : { kind: "switch", id: house.id },
      lastActivity,
    };
  }
  const someone = unsaved || profiles.some((profile) => profile.active);
  return {
    step: someone ? { kind: "signout" } : { kind: "home" },
    lastActivity,
  };
}
