/**
 * Who took a seat in which lobby: the parked accounts that the extension seated in a
 * lobby of Autodarts Play (decision 0016), so that the popup and the switcher show
 * "In the lobby" on their tiles, where they showed "Join the lobby" before.
 *
 * The service worker keeps this record in `chrome.storage.session`, which the browser
 * empties as it closes, since a lobby lasts a match or two. It holds the ids of the
 * accounts and of the lobbies alone, never a token, and only for the last few lobbies.
 * It says what the extension did, not what Autodarts shows now: reading the lobby
 * again would need a fresh access token of each player, and so a renewal of every
 * parked session, each time the popup opens.
 */

/** The key of the record, in `chrome.storage.session`. */
export const SEATS_KEY = "lobbySeats";
/** How many lobbies the record keeps; the one used longest ago goes first. */
export const KEPT_LOBBIES = 8;

/** The accounts that took a seat in one lobby, in the order in which they took it. */
export interface LobbySeats {
  readonly lobby: string;
  readonly accounts: readonly string[];
}

/** The record of every lobby, the one used last at the end. */
export type Seats = readonly LobbySeats[];

const isString = (value: unknown): value is string => typeof value === "string";

/**
 * Reads the record as the storage gives it. Anything that isn't a record counts as
 * none, and an entry that isn't one is left out: the record only decides which button
 * a tile shows, so a broken one costs a tap at most.
 */
export function parseSeats(stored: unknown): Seats {
  if (!Array.isArray(stored)) {
    return [];
  }
  const seats: LobbySeats[] = [];
  for (const entry of stored as unknown[]) {
    if (entry === null || typeof entry !== "object") {
      continue;
    }
    const { lobby, accounts } = entry as Record<string, unknown>;
    if (
      isString(lobby) &&
      Array.isArray(accounts) &&
      accounts.every(isString)
    ) {
      seats.push({ lobby, accounts: [...accounts] });
    }
  }
  return seats.slice(-KEPT_LOBBIES);
}

/** The accounts that the record seats in a lobby, or none for a lobby it doesn't know. */
export function seatsIn(seats: Seats, lobby: string): readonly string[] {
  return seats.find((entry) => entry.lobby === lobby)?.accounts ?? [];
}

/**
 * The record once an account took a seat in a lobby: that lobby moves to the end, and
 * the one used longest ago goes once there are more than `KEPT_LOBBIES`.
 */
export function withSeat(seats: Seats, lobby: string, account: string): Seats {
  const before = seatsIn(seats, lobby);
  const accounts = before.includes(account) ? before : [...before, account];
  return [
    ...seats.filter((entry) => entry.lobby !== lobby),
    { lobby, accounts },
  ].slice(-KEPT_LOBBIES);
}
