import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AuthError,
  type Fetch,
  GAME_BASE,
  type Identity,
  joinLobby,
  parseLobby,
  readIdentity,
  readLobby,
  refreshSession,
  revokeSession,
  seatPlayer,
  signIn,
} from "../src/autodarts.ts";
import {
  LOGIN_WITHOUT_PASSWORD,
  LOGIN_WRONG_PASSWORD,
  LOGOUT_UNKNOWN_TOKEN,
  REFRESH_DEAD_TOKEN,
  REFRESH_WITHOUT_TOKEN,
  type Recorded,
  UNREADABLE_BODY,
} from "./e2e/fake/recorded.ts";
import {
  accessTokenFor,
  counting,
  jsonResponse,
  makeAccessToken,
} from "./helpers.ts";

const answer =
  (response: Response): Fetch =>
  () =>
    Promise.resolve(response);
const throwing: Fetch = () => Promise.reject(new Error("offline"));
const recorded = ({ status, body }: Recorded): Fetch =>
  answer(jsonResponse(body, status));

/** The AuthError that a request ends in. */
async function failure(request: Promise<unknown>): Promise<AuthError> {
  try {
    await request;
  } catch (error) {
    assert.ok(error instanceof AuthError);
    return error;
  }
  assert.fail("the request was accepted");
}

test("refreshSession reads the rotated session", async () => {
  const fetcher = answer(
    jsonResponse({
      access_token: accessTokenFor("u1"),
      refresh_token: "rotated",
    }),
  );
  const session = await refreshSession(fetcher, "old");
  assert.equal(session.refreshToken, "rotated");
  assert.ok(session.accessToken.includes("."));
});

test("signIn sends the username and password", async () => {
  let sent: unknown;
  const fetcher: Fetch = (_url, init) => {
    sent = JSON.parse(String(init.body));
    return Promise.resolve(
      jsonResponse({ access_token: accessTokenFor("u1"), refresh_token: "r" }),
    );
  };
  await signIn(fetcher, "ada", "secret");
  assert.deepEqual(sent, {
    username: "ada",
    password: "secret",
    client_id: "autodarts-play",
  });
});

test("a request that can't be sent is unreachable", async () => {
  await assert.rejects(refreshSession(throwing, "x"), (error: AuthError) => {
    assert.equal(error.kind, "unreachable");
    return true;
  });
});

test("the recorded answer to a dead token rejects the session", async () => {
  const error = await failure(
    refreshSession(recorded(REFRESH_DEAD_TOKEN), "x"),
  );
  assert.equal(error.kind, "rejected");
  assert.equal(error.code, "invalid_token");
  assert.equal(error.requestRefused, false);
});

test("the recorded answer to a wrong password rejects the sign-in", async () => {
  const error = await failure(
    signIn(recorded(LOGIN_WRONG_PASSWORD), "ada", "wrong"),
  );
  assert.equal(error.kind, "rejected");
  assert.equal(error.code, "invalid_credentials");
  assert.equal(error.requestRefused, false);
});

test("every 401 rejects the session, whatever its body says", async () => {
  for (const body of [{}, null, { error: "invalid_request" }, "Unauthorized"]) {
    const error = await failure(
      refreshSession(answer(jsonResponse(body, 401)), "x"),
    );
    assert.equal(error.kind, "rejected");
  }
});

test("a 400 that names a dead session rejects it, in both forms of the sign-in service", async () => {
  for (const [body, code] of [
    [{ error: { status: 400, code: "invalid_token" } }, "invalid_token"],
    [{ error: { code: "invalid_credentials" } }, "invalid_credentials"],
    [{ error: "invalid_grant" }, "invalid_grant"],
  ] as const) {
    const error = await failure(
      refreshSession(answer(jsonResponse(body, 400)), "x"),
    );
    assert.equal(error.kind, "rejected");
    assert.equal(error.code, code);
  }
});

test("a 400 that refuses the request itself keeps the session and is marked as such", async () => {
  for (const [request, code] of [
    [refreshSession(recorded(REFRESH_WITHOUT_TOKEN), "x"), "invalid_request"],
    [signIn(recorded(LOGIN_WITHOUT_PASSWORD), "ada", "pw"), "invalid_request"],
    [refreshSession(recorded(UNREADABLE_BODY), "x"), "invalid_request"],
  ] as const) {
    const error = await failure(request);
    assert.equal(error.kind, "unreachable");
    assert.equal(error.requestRefused, true);
    assert.equal(error.code, code);
  }
});

test("a 400 with a body that the extension doesn't know keeps the session as well", async () => {
  for (const response of [
    jsonResponse({}, 400),
    jsonResponse(null, 400),
    jsonResponse({ error: 7 }, 400),
    jsonResponse({ error: { code: 7 } }, 400),
    jsonResponse({ error: { message: "field is required" } }, 400),
    new Response("Bad Request", { status: 400 }),
  ]) {
    const error = await failure(refreshSession(answer(response), "x"));
    assert.equal(error.kind, "unreachable");
    assert.equal(error.requestRefused, true);
    assert.equal(error.code, null);
  }
});

test("an AuthError of an outage has no code and no refused request", async () => {
  const error = await failure(refreshSession(throwing, "x"));
  assert.equal(error.code, null);
  assert.equal(error.requestRefused, false);
});

test("another error status is unreachable", async () => {
  await assert.rejects(
    refreshSession(answer(jsonResponse({}, 503)), "x"),
    (error: AuthError) => {
      assert.equal(error.kind, "unreachable");
      return true;
    },
  );
});

test("a body that is not JSON is unreachable", async () => {
  const fetcher = answer(new Response("{broken", { status: 200 }));
  await assert.rejects(refreshSession(fetcher, "x"), (error: AuthError) => {
    assert.equal(error.kind, "unreachable");
    return true;
  });
});

for (const body of [
  5,
  null,
  {},
  { access_token: "a" },
  { access_token: 1, refresh_token: "r" },
  { access_token: "a", refresh_token: 1 },
  { access_token: "", refresh_token: "r" },
  { access_token: "a", refresh_token: "" },
]) {
  test(`an incomplete session (${JSON.stringify(body)}) is unreachable`, async () => {
    await assert.rejects(
      refreshSession(answer(jsonResponse(body)), "x"),
      (error: AuthError) => {
        assert.equal(error.kind, "unreachable");
        return true;
      },
    );
  });
}

test("revokeSession tells Autodarts to end the session", async () => {
  let called = false;
  const fetcher: Fetch = () => {
    called = true;
    return Promise.resolve(new Response(null, { status: 204 }));
  };
  assert.equal(await revokeSession(fetcher, "token"), true);
  assert.ok(called);
});

test("revokeSession counts a session that had ended already as over", async () => {
  for (const status of [400, 401]) {
    for (const body of [
      { error: "invalid_grant" },
      { error: { status, code: "invalid_token" } },
    ]) {
      const fetcher = answer(jsonResponse(body, status));
      assert.equal(await revokeSession(fetcher, "token"), true);
    }
  }
  assert.equal(await revokeSession(recorded(LOGOUT_UNKNOWN_TOKEN), "t"), true);
});

test("revokeSession doesn't count another refusal as the end of the session", async () => {
  for (const status of [400, 401]) {
    for (const body of [
      jsonResponse({ error: "invalid_request" }, status),
      jsonResponse({ error: { status, code: "invalid_request" } }, status),
      jsonResponse({ error: "unauthorized_client" }, status),
      jsonResponse(null, status),
      jsonResponse({}, status),
      new Response("Bad Request", { status }),
    ]) {
      assert.equal(await revokeSession(answer(body), "token"), false);
    }
  }
});

test("revokeSession says so when Autodarts didn't end the session", async () => {
  for (const status of [404, 429, 500, 503]) {
    assert.equal(
      await revokeSession(answer(jsonResponse({}, status)), "token"),
      false,
    );
  }
});

test("revokeSession answers false instead of failing when Autodarts can't be reached", async () => {
  assert.equal(await revokeSession(throwing, "token"), false);
});

test("readIdentity takes the account from the claims", () => {
  const identity = readIdentity(
    makeAccessToken({
      sub: "abc",
      preferred_username: "ada",
      name: "Ada Lovelace",
      picture: "https://pics/ada.png",
    }),
  );
  assert.deepEqual(identity, {
    id: "abc",
    username: "ada",
    name: "Ada Lovelace",
    picture: "https://pics/ada.png",
  });
});

test("readIdentity falls back from preferred_username to name to id", () => {
  assert.equal(
    readIdentity(makeAccessToken({ sub: "id1", name: "By Name" })).username,
    "By Name",
  );
  assert.equal(readIdentity(makeAccessToken({ sub: "id1" })).username, "id1");
});

test("readIdentity uses the username when there is no name, and drops a non-https picture", () => {
  const identity = readIdentity(
    makeAccessToken({
      sub: "id1",
      preferred_username: "ada",
      picture: "http://x",
    }),
  );
  assert.equal(identity.name, "ada");
  assert.equal(identity.picture, null);
});

test("readIdentity ignores a claim that is not text", () => {
  assert.equal(
    readIdentity(makeAccessToken({ sub: "id1", name: 42 })).name,
    "id1",
  );
});

test("readIdentity refuses a token without parts", () => {
  assert.throws(() => readIdentity("nodots"), AuthError);
});

test("readIdentity refuses unreadable claims", () => {
  assert.throws(() => readIdentity("header.$$$.sig"), AuthError);
});

for (const claims of [5, null]) {
  test(`readIdentity refuses claims that are ${JSON.stringify(claims)}`, () => {
    assert.throws(
      () => readIdentity(makeAccessToken(claims as never)),
      AuthError,
    );
  });
}

test("readIdentity refuses a token that names no account", () => {
  assert.throws(
    () => readIdentity(makeAccessToken({ name: "no sub" })),
    AuthError,
  );
});

const LOBBY = "0b5a1c2d-0000-4000-8000-0000000000a1";
const bob: Identity = {
  id: "bob-id",
  username: "bob",
  name: "Bob Builder",
  picture: null,
};

/** A lobby as the game service answers it: its host, and a seat for each player. */
function lobbyAnswer(host: string, players: readonly unknown[]): Response {
  return jsonResponse({ id: LOBBY, host: { id: host }, players });
}

/** The kind of the AuthError that a promise rejects with, or "none". */
async function kindOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof AuthError);
    return error.kind;
  }
  return "none";
}

test("parseLobby takes the board of the host's seat, and lists who has a seat", () => {
  assert.deepEqual(
    parseLobby({
      host: { id: "ada-id" },
      players: [
        { userId: "cy-id", boardId: "board-of-cy" },
        { userId: "ada-id", boardId: "board-of-ada" },
        { userId: "dan-id", boardId: "board-of-ada" },
      ],
    }),
    { board: "board-of-ada", seated: ["cy-id", "ada-id", "dan-id"] },
  );
});

test("parseLobby takes the board of a guest of the host, when the host sits at none", () => {
  assert.deepEqual(
    parseLobby({
      host: { id: "ada-id" },
      players: [
        { userId: "ada-id", boardId: "" },
        "not a seat",
        null,
        { name: "Guest", userId: null, hostId: "ada-id", boardId: "board-1" },
      ],
    }),
    { board: "board-1", seated: ["ada-id"] },
  );
});

test("parseLobby finds no board while neither the host nor a guest of it sits at one", () => {
  for (const data of [
    { host: { id: "ada-id" }, players: [{ userId: "cy-id", boardId: "b" }] },
    { host: { id: "ada-id" }, players: [{ userId: "ada-id", boardId: 7 }] },
    { host: {}, players: [{ userId: "cy-id", boardId: "b" }] },
    { host: "ada-id", players: [{ userId: "ada-id", boardId: "b" }] },
    { players: [] },
  ]) {
    assert.equal(parseLobby(data).board, null, JSON.stringify(data));
  }
});

test("parseLobby takes the board of the display, in a lobby that another account hosts", () => {
  const data = {
    host: { id: "ada-id" },
    players: [
      { userId: "ada-id", boardId: "board-of-ada" },
      { userId: "cy-id", boardId: "board-of-cy" },
    ],
  };
  // Cy plays on the display: a player of the display throws at Cy's board, not Ada's.
  assert.equal(parseLobby(data, "cy-id").board, "board-of-cy");
  assert.equal(parseLobby(data, "ada-id").board, "board-of-ada");
});

test("parseLobby takes the board of a guest that the display added", () => {
  assert.equal(
    parseLobby(
      {
        host: { id: "ada-id" },
        players: [
          { userId: "ada-id", boardId: "board-of-ada" },
          { userId: "cy-id", boardId: "" },
          {
            name: "Guest",
            userId: null,
            hostId: "cy-id",
            boardId: "board-of-cy",
          },
        ],
      },
      "cy-id",
    ).board,
    "board-of-cy",
  );
});

test("parseLobby falls back to the board of the host while the display has no seat", () => {
  assert.equal(
    parseLobby(
      {
        host: { id: "ada-id" },
        players: [{ userId: "ada-id", boardId: "board-of-ada" }],
      },
      "cy-id",
    ).board,
    "board-of-ada",
  );
});

test("parseLobby takes an answer without seats for a change of Autodarts", () => {
  for (const data of [null, "lobby", 7, {}, { players: "ada" }]) {
    assert.throws(
      () => parseLobby(data),
      (error: AuthError) => error.kind === "unreachable",
      JSON.stringify(data),
    );
  }
});

test("readLobby asks the game service with the access token of the player", async () => {
  let sent: { url: string; init: RequestInit } | undefined;
  const fetcher: Fetch = (url, init) => {
    sent = { url, init };
    return Promise.resolve(
      lobbyAnswer("ada-id", [{ userId: "ada-id", boardId: "board-1" }]),
    );
  };
  const lobby = await readLobby(fetcher, "access-of-bob", LOBBY);
  assert.deepEqual(lobby, { board: "board-1", seated: ["ada-id"] });
  assert.equal(sent?.url, `${GAME_BASE}/lobbies/${LOBBY}`);
  assert.equal(sent?.init.method, "GET");
  assert.deepEqual(sent?.init.headers, {
    Authorization: "Bearer access-of-bob",
  });
  assert.equal(sent?.init.body, undefined);
});

test("readLobby keeps the id of a lobby inside its path", async () => {
  let url = "";
  const fetcher: Fetch = (address) => {
    url = address;
    return Promise.resolve(lobbyAnswer("ada-id", []));
  };
  await readLobby(fetcher, "token", "../boards?x=1");
  assert.equal(url, `${GAME_BASE}/lobbies/..%2Fboards%3Fx%3D1`);
});

test("readLobby takes an answer that is no JSON for a change of Autodarts", async () => {
  const fetcher = answer(new Response("<html>", { status: 200 }));
  assert.equal(await kindOf(readLobby(fetcher, "token", LOBBY)), "unreachable");
});

for (const status of [400, 401, 403, 404, 409, 410, 422]) {
  test(`a refusal of the game service with ${status} does not pass by itself`, async () => {
    const fetcher = answer(jsonResponse({}, status));
    assert.equal(await kindOf(readLobby(fetcher, "token", LOBBY)), "rejected");
  });
}

for (const status of [302, 408, 429, 500, 503]) {
  test(`an answer ${status} of the game service may pass`, async () => {
    const fetcher = answer(new Response(null, { status }));
    assert.equal(
      await kindOf(readLobby(fetcher, "token", LOBBY)),
      "unreachable",
    );
  });
}

test("a request to the game service that can not be sent may pass", async () => {
  assert.equal(
    await kindOf(readLobby(throwing, "token", LOBBY)),
    "unreachable",
  );
});

test("seatPlayer sends the seat as the join page of Autodarts Play does", async () => {
  let sent: { url: string; init: RequestInit } | undefined;
  const fetcher: Fetch = (url, init) => {
    sent = { url, init };
    return Promise.resolve(jsonResponse({}, 201));
  };
  await seatPlayer(fetcher, "access-of-bob", LOBBY, {
    name: "bob",
    userId: "bob-id",
    boardId: "board-1",
  });
  assert.equal(sent?.url, `${GAME_BASE}/lobbies/${LOBBY}/players`);
  assert.equal(sent?.init.method, "POST");
  assert.deepEqual(sent?.init.headers, {
    Authorization: "Bearer access-of-bob",
    "Content-Type": "application/json",
  });
  assert.deepEqual(JSON.parse(String(sent?.init.body)), {
    name: "bob",
    userId: "bob-id",
    boardId: "board-1",
  });
});

test("joinLobby seats the player at the board of the host, under the username", async () => {
  const seats: unknown[] = [];
  const fetcher: Fetch = (url, init) => {
    if (init.method === "POST") {
      seats.push({ url, body: JSON.parse(String(init.body)) });
      return Promise.resolve(jsonResponse({}, 201));
    }
    return Promise.resolve(
      lobbyAnswer("ada-id", [{ userId: "ada-id", boardId: "board-1" }]),
    );
  };
  assert.equal(await joinLobby(fetcher, "access", LOBBY, bob), "joined");
  assert.deepEqual(seats, [
    {
      url: `${GAME_BASE}/lobbies/${LOBBY}/players`,
      body: { name: "bob", userId: "bob-id", boardId: "board-1" },
    },
  ]);
});

test("joinLobby seats the player at the board of the display, not of a host online", async () => {
  const seats: unknown[] = [];
  const fetcher: Fetch = (_url, init) => {
    if (init.method === "POST") {
      seats.push(JSON.parse(String(init.body)));
      return Promise.resolve(jsonResponse({}, 201));
    }
    return Promise.resolve(
      lobbyAnswer("ada-id", [
        { userId: "ada-id", boardId: "board-of-ada" },
        { userId: "cy-id", boardId: "board-of-cy" },
      ]),
    );
  };
  assert.equal(
    await joinLobby(fetcher, "access", LOBBY, bob, "cy-id"),
    "joined",
  );
  assert.deepEqual(seats, [
    { name: "bob", userId: "bob-id", boardId: "board-of-cy" },
  ]);
});

test("joinLobby sends no second seat for a player who has one", async () => {
  const fetcher = counting(
    answer(
      lobbyAnswer("ada-id", [
        { userId: "ada-id", boardId: "board-1" },
        { userId: "bob-id", boardId: "board-1" },
      ]),
    ),
  );
  assert.equal(await joinLobby(fetcher, "access", LOBBY, bob), "seated");
  assert.equal(fetcher.calls, 1);
});

test("joinLobby seats nobody in a lobby without a board of its host", async () => {
  const fetcher = counting(
    answer(lobbyAnswer("ada-id", [{ userId: "ada-id" }])),
  );
  assert.equal(
    await kindOf(joinLobby(fetcher, "access", LOBBY, bob)),
    "rejected",
  );
  assert.equal(fetcher.calls, 1);
});

test("joinLobby reports a seat that Autodarts refuses", async () => {
  const fetcher: Fetch = (_url, init) =>
    Promise.resolve(
      init.method === "POST"
        ? jsonResponse({ error: "lobby is full" }, 409)
        : lobbyAnswer("ada-id", [{ userId: "ada-id", boardId: "board-1" }]),
    );
  assert.equal(
    await kindOf(joinLobby(fetcher, "access", LOBBY, bob)),
    "rejected",
  );
});
