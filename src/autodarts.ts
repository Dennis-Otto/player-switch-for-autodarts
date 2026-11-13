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

/** What an AuthError says beyond its kind; see the fields of AuthError. */
interface RefusalDetails {
  requestRefused: boolean;
  code: string | null;
}

/**
 * Why a request to Autodarts failed: "rejected" when it will keep failing (a dead
 * session, a wrong password, a lobby that takes no seat), "unreachable" when it may
 * work again later.
 */
export class AuthError extends Error {
  readonly kind: "rejected" | "unreachable";
  /**
   * Autodarts refused the request itself, not the session or the password in it: a
   * 400 of the sign-in service that names no dead session, as when it asks for another
   * field now. The session may still be alive, so the error is "unreachable", and the
   * extension may need an update.
   */
  readonly requestRefused: boolean;
  /** The code that the sign-in service gave for its refusal, such as `invalid_token`, or null. */
  readonly code: string | null;

  constructor(
    kind: "rejected" | "unreachable",
    message: string,
    { requestRefused = false, code = null }: Partial<RefusalDetails> = {},
  ) {
    super(message);
    this.name = "AuthError";
    this.kind = kind;
    this.requestRefused = requestRefused;
    this.code = code;
  }
}

/** The code with which the sign-in service refuses an unknown, spent or expired refresh token, with 401. */
export const DEAD_TOKEN_CODE = "invalid_token";

/** The code with which the sign-in service refuses a wrong username or password, with 401. */
export const WRONG_PASSWORD_CODE = "invalid_credentials";

/**
 * The codes with which the sign-in service turns a session or a password away for
 * good, as the answers of the real service recorded in `test/e2e/fake/recorded.ts`
 * show them. Any other code, such as `invalid_request` for a request without its
 * field, refuses the request, not the session. So does `invalid_grant` of the flat
 * form of Keycloak, which no recorded answer shows any more: a session ends only on
 * an answer that the service is known to send, and the daily contract check of
 * `scripts/upstream-contract.ts` turns red on any other.
 */
export const DEAD_SESSION_CODES: ReadonlySet<string> = new Set([
  DEAD_TOKEN_CODE,
  WRONG_PASSWORD_CODE,
]);

/**
 * The code of a refusal of the sign-in service: `error.code` of the JSON that it
 * answers (`{"error":{"code":"invalid_token"}}`), or `error` itself in a flat body
 * such as Keycloak's (`{"error":"invalid_grant"}`), which `AuthError.code` reports
 * but no longer ends a session. Null for a body without either.
 */
async function refusalCode(response: Response): Promise<string | null> {
  const body: unknown = await response.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const error: unknown = (body as { error?: unknown }).error;
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object" && error !== null) {
    const code: unknown = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
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
  if (response.status === 400 || response.status === 401) {
    const code = await refusalCode(response);
    // The sign-in service answers a dead token and a wrong password with 401. A 400
    // ends the session only with a code that says so; any other 400 means that it
    // can't read the request, as after a change of what it asks for, and the session
    // stays for the next try, which an update of the extension may need.
    if (
      response.status === 401 ||
      (code !== null && DEAD_SESSION_CODES.has(code))
    ) {
      throw new AuthError("rejected", "Autodarts did not accept the session", {
        code,
      });
    }
    throw new AuthError("unreachable", "Autodarts did not accept the request", {
      requestRefused: true,
      code,
    });
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
 * 401 with a code of `DEAD_SESSION_CODES`, as for a renewal). Any other refusal means Autodarts
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
  const code = await refusalCode(response);
  return code !== null && DEAD_SESSION_CODES.has(code);
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

/** What a join needs to know of a lobby: the board of the display, and who has a seat. */
export interface Lobby {
  /** The board that a new player shares; null while there is none. */
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
 * Reads a lobby from an answer of the game service. Its board is the one of the display:
 * the board of the first seat that the account on the display (`display`) has, or that
 * it gave a guest, since a lobby seats a player of the display at the board of that
 * display, also when the lobby is another account's online. Only while that account
 * has no such seat, such as a lobby that stays on screen after a switch, it is the board
 * of the host, found the same way.
 */
export function parseLobby(
  data: unknown,
  display: string | null = null,
): Lobby {
  const players: unknown =
    typeof data === "object" && data !== null
      ? (data as Record<string, unknown>).players
      : undefined;
  if (!Array.isArray(players)) {
    throw new AuthError("unreachable", "Autodarts answered without a lobby");
  }
  const host = textOf((data as Record<string, unknown>).host, "id");
  const boardOf = (owner: string | null): string | null => {
    const seat = players.find(
      (candidate) =>
        owner !== null &&
        (textOf(candidate, "userId") === owner ||
          textOf(candidate, "hostId") === owner) &&
        textOf(candidate, "boardId") !== null,
    );
    return seat === undefined ? null : textOf(seat, "boardId");
  };
  return {
    board: boardOf(display) ?? boardOf(host),
    seated: players.flatMap((seat) => textOf(seat, "userId") ?? []),
  };
}

/**
 * Reads a lobby, with the access token of the account that is to join it, for the
 * display where `display` plays (see `parseLobby`).
 */
export async function readLobby(
  fetcher: Fetch,
  accessToken: string,
  lobbyId: string,
  display: string | null = null,
): Promise<Lobby> {
  const response = await askGame(fetcher, accessToken, lobbyPath(lobbyId));
  return parseLobby(await response.json().catch(() => null), display);
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
 * Seats a player in a lobby at the board of the display, where the account `display`
 * plays (or else at the board of the host, see `parseLobby`), as if they had joined
 * from their phone, so the match counts for their own account. A player who has a seat already
 * keeps it, and Autodarts gets no second request. The name is the username, which
 * Autodarts shows of every player anyway, never the full name of the account.
 */
export async function joinLobby(
  fetcher: Fetch,
  accessToken: string,
  lobbyId: string,
  player: Identity,
  display: string | null = null,
): Promise<Join> {
  const lobby = await readLobby(fetcher, accessToken, lobbyId, display);
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
