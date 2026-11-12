/**
 * The answers of the real sign-in service of Autodarts, at
 * https://api.autodarts.com/auth/v1, recorded on 2026-11-12 with made-up data only,
 * the data of `MADE_UP` in scripts/upstream-contract.ts: no account, password or token
 * of anybody. The fake Autodarts of this folder and the unit tests answer with them, so
 * that the extension is tested against what the service really sends.
 *
 * - A token that the service doesn't know answers 401 with `invalid_token`, and so
 *   does, by its message "invalid or expired refresh token", a spent or expired one:
 *   that is a dead session.
 * - A wrong username or password answers 401 with `invalid_credentials` (and a
 *   `traceId` of the request beside it, which is left out here).
 * - A request that it can't read, without its field or with a body that is no JSON,
 *   answers 400 with `invalid_request`: that refuses the request, not the session.
 * - The end of a session that it doesn't know answers 200, as for a live one.
 *
 * Record them anew when the service changes, with the made-up data and a request
 * like the extension's, and change the date above.
 */

/** A status and the JSON body of an answer, as the service sent them. */
export interface Recorded {
  readonly status: number;
  readonly body: unknown;
}

const refusal = (status: number, code: string, message: string): Recorded => ({
  status,
  body: { statusCode: status, error: { status, code, message } },
});

/** `/refresh` with a refresh token that the service doesn't know. */
export const REFRESH_DEAD_TOKEN = refusal(
  401,
  "invalid_token",
  "invalid or expired refresh token",
);

/** `/login` with a username and a password that belong to no account. */
export const LOGIN_WRONG_PASSWORD = refusal(
  401,
  "invalid_credentials",
  "invalid credentials",
);

/** `/refresh` with the client but without `refresh_token`. */
export const REFRESH_WITHOUT_TOKEN = refusal(
  400,
  "invalid_request",
  "refresh_token is required",
);

/** `/login` with the client but without `username` and `password`. */
export const LOGIN_WITHOUT_PASSWORD = refusal(
  400,
  "invalid_request",
  "password is required",
);

/** `/refresh` with a body that is no JSON. */
export const UNREADABLE_BODY = refusal(
  400,
  "invalid_request",
  "invalid request body",
);

/** `/logout` with a refresh token that the service doesn't know. */
export const LOGOUT_UNKNOWN_TOKEN: Recorded = {
  status: 200,
  body: { success: true },
};
