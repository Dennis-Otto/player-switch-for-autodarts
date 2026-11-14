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

/**
 * The shape of the answer of the board service, at https://api.autodarts.com/bs/v0, to
 * `GET /boards` with the access token of the owner of two boards, one of them shared with
 * one other account, as Autodarts Play asks it for **My Boards**. It was looked at on
 * 2026-11-14 in a browser, for its address, status and keys only: every value here is
 * made up, and so are the accounts. One of the two boards had no `variant`.
 * `permissions[].user.id` is the `sub` of the access token of that account.
 */
export const BOARDS_OF_AN_OWNER: Recorded = {
  status: 200,
  body: [
    {
      id: "8d6b1d0e-0000-4000-8000-000000000001",
      name: "Made-up board",
      virtualNumberRing: false,
      permissions: [
        {
          user: {
            id: "made-up-owner",
            name: "made.up.owner",
            avatarUrl: "",
            country: "",
          },
          isOwner: true,
        },
        {
          user: {
            id: "made-up-friend",
            name: "made.up.friend",
            avatarUrl: "",
            country: "",
          },
          isOwner: false,
        },
      ],
      ip: "192.0.2.10",
      matchId: "",
      state: {},
      version: "0.0.0",
      os: "linux",
      arch: "arm64",
      variant: "made-up",
      type: "made-up",
      detections: 0,
      corrections: 0,
      accuracy: 0,
    },
    {
      id: "8d6b1d0e-0000-4000-8000-000000000002",
      name: "Made-up second board",
      virtualNumberRing: false,
      permissions: [
        {
          user: {
            id: "made-up-owner",
            name: "made.up.owner",
            avatarUrl: "",
            country: "",
          },
          isOwner: true,
        },
      ],
      ip: "192.0.2.11",
      matchId: "",
      state: {},
      version: "0.0.0",
      os: "linux",
      arch: "arm64",
      type: "made-up",
      detections: 0,
      corrections: 0,
      accuracy: 0,
    },
  ],
};
