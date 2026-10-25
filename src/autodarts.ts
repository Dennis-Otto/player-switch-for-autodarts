/**
 * What the extension knows of Autodarts Play: where it runs, where it keeps its
 * session, and the sign-in service that renews, creates and ends a session.
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
 * session, a wrong password), "unreachable" when it may work again later.
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
 * doesn't ask for. True when the session is over: Autodarts ended it, or it had
 * ended already (400 and 401, as for a renewal). False when Autodarts couldn't be
 * reached or didn't end it; the session then lasts until it expires by itself, and
 * the extension forgets it all the same.
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
  return response.ok || response.status === 400 || response.status === 401;
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
