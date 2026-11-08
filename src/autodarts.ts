/**
 * What the extension knows of Autodarts Play: where it runs, where it keeps its
 * session, the sign-in service that renews, creates and ends a session, and the game
 * service whose lobbies a parked player can join (decision 0016).
 *
 * Everything here takes its `fetch` as an argument, so the logic runs in a test
 * without a browser and the extension passes the real `fetch`.
 */

/** The origin of Autodarts Play; play.autodarts.io forwards to it. */
export const PLAY_ORIGIN = "https://play.autodarts.com";

/** The key under which Autodarts Play keeps its refresh token in localStorage. */
export const SESSION_KEY = "autodarts_refresh_token";

/** The sign-in service of Autodarts, which renews, creates and ends a session. */
export const AUTH_BASE = "https://api.autodarts.com/auth/v1";

/** The client that Autodarts Play signs in as, and the extension with it. */
export const CLIENT_ID = "autodarts-play";

/** A session: the refresh token in it replaces the one that renewed it (rotation). */
export interface Session {
  accessToken: string;
  refreshToken: string;
}

/** Who a session belongs to, from the claims of its access token. */
export interface Identity {
  id: string;
  username: string;
  name: string;
  picture: string | null;
}

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Why a request to Autodarts failed: "rejected" when it will keep failing (a dead
 * session, a wrong password, a lobby that takes no seat), "unreachable" when it may
 * work again later.
 */
export class AuthError extends Error {
  readonly kind: "rejected" | "unreachable";

  constructor(kind: "rejected" | "unreachable", message: string) {
    super(message);
    this.name = "AuthError";
    this.kind = kind;
  }
}

/** Sends a sign-in request and reads the session from its answer. */
async function postSession(
  fetcher: Fetch,
  path: string,
  body: Record<string, string>,
): Promise<Session> {
  let response: Response;
  try {
    response = await fetcher(`${AUTH_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, client_id: CLIENT_ID }),
    });
  } catch {
    throw new AuthError("unreachable", "Autodarts could not be reached");
  }
  // Autodarts Play itself treats these two as the end of a session.
  if (response.status === 400 || response.status === 401) {
    throw new AuthError("rejected", "Autodarts did not accept the request");
  }
  if (!response.ok) {
    throw new AuthError("unreachable", `Autodarts answered ${response.status}`);
  }
  const data: unknown = await response.json().catch(() => null);
  if (
    typeof data !== "object" ||
    data === null ||
    !("access_token" in data) ||
    !("refresh_token" in data) ||
    typeof data.access_token !== "string" ||
    typeof data.refresh_token !== "string" ||
    data.access_token === "" ||
    data.refresh_token === ""
  ) {
    throw new AuthError("unreachable", "Autodarts answered without a session");
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

/**
 * Renews a session. Autodarts rotates the refresh token: from now on only the one
 * in the result is valid, so the caller keeps it before anything else.
 */
export function refreshSession(
  fetcher: Fetch,
  refreshToken: string,
): Promise<Session> {
  return postSession(fetcher, "/refresh", { refresh_token: refreshToken });
}

/** Signs in with a username and a password, the fallback when a token no longer works. */
export function signIn(
  fetcher: Fetch,
  username: string,
  password: string,
): Promise<Session> {
  return postSession(fetcher, "/login", { username, password });
}

/**
 * Ends a session at Autodarts, with the request that Autodarts Play sends when a
 * player signs out: the refresh token alone, without the client, which the sign-out
 * doesn't ask for. True when the session is over: Autodarts ended it (it answers
 * 2xx, also for a token it doesn't know), or it refused the token as dead (400 or
 * 401 with `invalid_grant`, as for a renewal). Any other refusal means Autodarts
 * didn't accept the request itself, for example because it asks for another field
 * now, so the session may still be alive. False then, and when Autodarts couldn't be
 * reached; the session then lasts until it expires by itself, and the extension
 * forgets it all the same.
 */
export async function revokeSession(
  fetcher: Fetch,
  refreshToken: string,
): Promise<boolean> {
  let response: Response;
  try {
    response = await fetcher(`${AUTH_BASE}/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch {
    return false;
  }
  if (response.ok) {
    return true;
  }
  if (response.status !== 400 && response.status !== 401) {
    return false;
  }
  try {
    const body: unknown = await response.json();
    return (
      typeof body === "object" &&
      body !== null &&
      (body as { error?: unknown }).error === "invalid_grant"
    );
  } catch {
    return false;
  }
}

/**
 * Reads who an access token belongs to. The extension never checks the signature,
 * which is Autodarts' job; it only reads the claims to show a name and a picture.
 */
export function readIdentity(accessToken: string): Identity {
  const payload = accessToken.split(".")[1];
  if (payload === undefined) {
    throw new AuthError("unreachable", "The access token has no claims");
  }
  let claims: unknown;
  try {
    const binary = atob(payload.replaceAll("-", "+").replaceAll("_", "/"));
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    claims = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AuthError(
      "unreachable",
      "The claims of the access token are unreadable",
    );
  }
  if (typeof claims !== "object" || claims === null) {
    throw new AuthError(
      "unreachable",
      "The claims of the access token are unreadable",
    );
  }
  const text = (key: string): string => {
    const value: unknown = (claims as Record<string, unknown>)[key];
    return typeof value === "string" ? value.trim() : "";
  };
  const id = text("sub");
  if (id === "") {
    throw new AuthError("unreachable", "The access token names no account");
  }
  const username = text("preferred_username") || text("name") || id;
  const picture = text("picture");
  return {
    id,
    username,
    name: text("name") || username,
    picture: picture.startsWith("https://") ? picture : null,
  };
}

/** The game service of Autodarts, which keeps the lobbies where a match is set up. */
export const GAME_BASE = "https://api.autodarts.com/gs/v0";

/** What a join needs to know of a lobby: the board of its host, and who has a seat. */
export interface Lobby {
  /** The board where the host plays, which a new player shares; null while there is none. */
  readonly board: string | null;
  /** The accounts that have a seat in the lobby already. */
  readonly seated: readonly string[];
}

/** A seat that a player takes in a lobby: their account, the name it shows, and the board. */
export interface Seat {
  readonly name: string;
  readonly userId: string;
  readonly boardId: string;
}

/** How a join ended: the player took a seat just now, or had one already. */
export type Join = "joined" | "seated";

/**
 * Sends a request to the game service, with the access token of the account that it is
 * for, and answers with the answer when Autodarts took it. A refusal, any 4xx but a
 * timeout or too many requests, won't pass by itself: the lobby is gone, full or
 * started, or the token doesn't count. Anything else may pass.
 */
async function askGame(
  fetcher: Fetch,
  accessToken: string,
  path: string,
  body?: Seat,
): Promise<Response> {
  const authorization = { Authorization: `Bearer ${accessToken}` };
  let response: Response;
  try {
    response = await fetcher(
      `${GAME_BASE}${path}`,
      body === undefined
        ? { method: "GET", headers: authorization }
        : {
            method: "POST",
            headers: { ...authorization, "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
    );
  } catch {
    throw new AuthError("unreachable", "Autodarts could not be reached");
  }
  if (response.ok) {
    return response;
  }
  const { status } = response;
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
    throw new AuthError("rejected", `Autodarts refused the request: ${status}`);
  }
  throw new AuthError("unreachable", `Autodarts answered ${status}`);
}

/** The path of a lobby at the game service. */
const lobbyPath = (lobbyId: string): string =>
  `/lobbies/${encodeURIComponent(lobbyId)}`;

/** A text field of an object from an answer, or null when it is missing or empty. */
function textOf(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const field: unknown = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field !== "" ? field : null;
}

/**
 * Reads a lobby from an answer of the game service. Its board is the one of the host:
 * the board of the first seat that the host has, or that the host gave a guest, since a
 * lobby on a display seats everyone at the board of that display.
 */
export function parseLobby(data: unknown): Lobby {
  const players: unknown =
    typeof data === "object" && data !== null
      ? (data as Record<string, unknown>).players
      : undefined;
  if (!Array.isArray(players)) {
    throw new AuthError("unreachable", "Autodarts answered without a lobby");
  }
  const host = textOf((data as Record<string, unknown>).host, "id");
  const hosts = (seat: unknown): boolean =>
    host !== null &&
    (textOf(seat, "userId") === host || textOf(seat, "hostId") === host);
  const board = players.find(
    (seat) => hosts(seat) && textOf(seat, "boardId") !== null,
  );
  return {
    board: board === undefined ? null : textOf(board, "boardId"),
    seated: players.flatMap((seat) => textOf(seat, "userId") ?? []),
  };
}

/** Reads a lobby, with the access token of the account that is to join it. */
export async function readLobby(
  fetcher: Fetch,
  accessToken: string,
  lobbyId: string,
): Promise<Lobby> {
  const response = await askGame(fetcher, accessToken, lobbyPath(lobbyId));
  return parseLobby(await response.json().catch(() => null));
}

/**
 * Takes a seat in a lobby, with the request that the page `/join/<lobby>` of Autodarts
 * Play sends: the name, the account and the board, with the access token of that
 * account, so Autodarts seats nobody but the owner of the token.
 */
export async function seatPlayer(
  fetcher: Fetch,
  accessToken: string,
  lobbyId: string,
  seat: Seat,
): Promise<void> {
  await askGame(fetcher, accessToken, `${lobbyPath(lobbyId)}/players`, seat);
}

/**
 * Seats a player in a lobby at the board of its host, as if they had joined from their
 * phone, so the match counts for their own account. A player who has a seat already
 * keeps it, and Autodarts gets no second request. The name is the username, which
 * Autodarts shows of every player anyway, never the full name of the account.
 */
export async function joinLobby(
  fetcher: Fetch,
  accessToken: string,
  lobbyId: string,
  player: Identity,
): Promise<Join> {
  const lobby = await readLobby(fetcher, accessToken, lobbyId);
  if (lobby.seated.includes(player.id)) {
    return "seated";
  }
  if (lobby.board === null) {
    throw new AuthError(
      "rejected",
      "The lobby has no board to seat a player at",
    );
  }
  await seatPlayer(fetcher, accessToken, lobbyId, {
    name: player.username,
    userId: player.id,
    boardId: lobby.board,
  });
  return "joined";
}
