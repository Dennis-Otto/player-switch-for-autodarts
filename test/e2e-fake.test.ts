// The fakes of the end-to-end tests (test/e2e/fake/) follow the rules of the real
// Autodarts that the extension depends on; a fake that let a token pass twice would
// let the end-to-end tests pass a bug.
import assert from "node:assert/strict";
import { X509Certificate } from "node:crypto";
import { test } from "node:test";
import { createSecureContext } from "node:tls";

import { parseLobby, readIdentity } from "../src/autodarts.ts";
import {
  ALICE,
  accessTokenOf,
  BOB,
  CAROL,
  FakeAutodarts,
} from "./e2e/fake/autodarts.ts";
import { makeCertificate } from "./e2e/fake/certificate.ts";
import {
  LOGIN_WITHOUT_PASSWORD,
  LOGIN_WRONG_PASSWORD,
  LOGOUT_UNKNOWN_TOKEN,
  REFRESH_DEAD_TOKEN,
  REFRESH_WITHOUT_TOKEN,
  UNREADABLE_BODY,
} from "./e2e/fake/recorded.ts";

/** The refresh token of a session answer. */
function tokenOf(answer: { body: unknown }): string {
  const { refresh_token: token } = answer.body as { refresh_token: string };
  return token;
}

function signIn(
  autodarts: FakeAutodarts,
  username = ALICE.username,
  password = ALICE.password,
): string {
  const answer = autodarts.answer("login", {
    username,
    password,
    client_id: "autodarts-play",
  });
  assert.equal(answer.status, 200);
  return tokenOf(answer);
}

test("a sign-in starts a session whose access token names the account", () => {
  const autodarts = new FakeAutodarts();
  const answer = autodarts.answer("login", {
    username: BOB.username,
    password: BOB.password,
  });
  const { access_token: accessToken } = answer.body as { access_token: string };
  assert.deepEqual(readIdentity(accessToken), {
    id: BOB.id,
    username: BOB.username,
    name: BOB.name,
    picture: null,
  });
  assert.equal(autodarts.sessionsOf(BOB), 1);
  assert.equal(autodarts.count("login", BOB), 1);
});

test("a wrong password or an unknown account is refused with 401, a sign-in without them with 400", () => {
  const autodarts = new FakeAutodarts();
  assert.deepEqual(
    autodarts.answer("login", {
      username: ALICE.username,
      password: BOB.password,
    }),
    LOGIN_WRONG_PASSWORD,
  );
  assert.deepEqual(
    autodarts.answer("login", { username: "nobody", password: "secret" }),
    LOGIN_WRONG_PASSWORD,
  );
  assert.deepEqual(autodarts.answer("login", null), LOGIN_WITHOUT_PASSWORD);
  assert.deepEqual(
    autodarts.answer("login", { username: ALICE.username }),
    LOGIN_WITHOUT_PASSWORD,
  );
  assert.equal(autodarts.sessionsOf(ALICE), 0);
});

test("a renewal rotates the refresh token, and the one sent stops working", () => {
  const autodarts = new FakeAutodarts();
  const first = signIn(autodarts);
  const renewed = autodarts.answer("refresh", { refresh_token: first });
  assert.equal(renewed.status, 200);
  const second = tokenOf(renewed);
  assert.notEqual(second, first);
  assert.equal(
    autodarts.answer("refresh", { refresh_token: second }).status,
    200,
  );
  assert.equal(autodarts.count("refresh", ALICE), 2);
  assert.equal(autodarts.sessionsOf(ALICE), 1);
  assert.deepEqual(autodarts.reused, []);
});

test("a token sent a second time is refused, recorded, and ends its session", () => {
  const autodarts = new FakeAutodarts();
  const first = signIn(autodarts);
  const second = tokenOf(autodarts.answer("refresh", { refresh_token: first }));

  assert.deepEqual(
    autodarts.answer("refresh", { refresh_token: first }),
    REFRESH_DEAD_TOKEN,
  );
  assert.deepEqual(autodarts.reused, [first]);
  // The thief and the owner both lose the session.
  assert.deepEqual(
    autodarts.answer("refresh", { refresh_token: second }),
    REFRESH_DEAD_TOKEN,
  );
  assert.equal(autodarts.sessionsOf(ALICE), 0);
});

test("a token that it never issued is refused without counting as reused", () => {
  const autodarts = new FakeAutodarts();
  assert.deepEqual(
    autodarts.answer("refresh", { refresh_token: "made-up" }),
    REFRESH_DEAD_TOKEN,
  );
  assert.deepEqual(autodarts.answer("refresh", {}), REFRESH_WITHOUT_TOKEN);
  assert.deepEqual(autodarts.answer("refresh", "not json"), UNREADABLE_BODY);
  assert.deepEqual(autodarts.reused, []);
  assert.deepEqual(autodarts.sent, [
    { path: "refresh", account: null },
    { path: "refresh", account: null },
    { path: "refresh", account: null },
  ]);
});

test("each sign-in is a session of its own, and end() ends every one of an account", () => {
  const autodarts = new FakeAutodarts();
  const page = signIn(autodarts);
  const parked = signIn(autodarts);
  const bob = signIn(autodarts, BOB.username, BOB.password);
  assert.equal(autodarts.sessionsOf(ALICE), 2);

  autodarts.end(ALICE);
  assert.equal(autodarts.sessionsOf(ALICE), 0);
  assert.equal(
    autodarts.answer("refresh", { refresh_token: page }).status,
    401,
  );
  assert.equal(
    autodarts.answer("refresh", { refresh_token: parked }).status,
    401,
  );
  // An ended session is no reuse: its token simply stopped working.
  assert.deepEqual(autodarts.reused, []);
  assert.equal(autodarts.answer("refresh", { refresh_token: bob }).status, 200);
});

test("a sign-out ends the session, and its token counts as reused when it comes back", () => {
  const autodarts = new FakeAutodarts();
  const token = signIn(autodarts);
  assert.deepEqual(autodarts.answer("logout", { refresh_token: token }), {
    status: 204,
    body: null,
  });
  assert.equal(autodarts.sessionsOf(ALICE), 0);
  // The real service answers the end of a session that it doesn't know with 200 too.
  assert.deepEqual(
    autodarts.answer("logout", { refresh_token: token }),
    LOGOUT_UNKNOWN_TOKEN,
  );
  assert.deepEqual(autodarts.reused, [token]);
  assert.equal(autodarts.count("logout", ALICE), 1);
});

test("a path that the service doesn't have answers 404", () => {
  const autodarts = new FakeAutodarts();
  assert.equal(autodarts.answer("token", {}).status, 404);
  assert.deepEqual(autodarts.sent, [{ path: "token", account: null }]);
});

const bearerOf = (account: typeof ALICE) => `Bearer ${accessTokenOf(account)}`;

test("the game service shows a lobby to an account, with the board of its host", () => {
  const autodarts = new FakeAutodarts();
  const lobby = autodarts.openLobby(ALICE);
  const answer = autodarts.answerGame(
    "GET",
    `lobbies/${lobby}`,
    bearerOf(BOB),
    null,
  );
  assert.equal(answer.status, 200);
  assert.deepEqual(parseLobby(answer.body), {
    board: "board-of-alice",
    seated: [ALICE.id],
  });
  assert.deepEqual(autodarts.sent, [{ path: "lobby", account: BOB.id }]);
});

test("the game service seats the account of the token at the board of the host, and nobody else", () => {
  const autodarts = new FakeAutodarts();
  const lobby = autodarts.openLobby(ALICE, "board-1");
  const seat = (bearer: string | undefined, body: unknown) =>
    autodarts.answerGame("POST", `lobbies/${lobby}/players`, bearer, body)
      .status;

  const bob = { name: BOB.username, userId: BOB.id, boardId: "board-1" };
  assert.equal(seat(undefined, bob), 401);
  assert.equal(seat("Bearer made-up", bob), 401);
  assert.equal(seat(bearerOf(CAROL), bob), 403);
  assert.equal(seat(bearerOf(BOB), { ...bob, boardId: "board-2" }), 400);
  assert.deepEqual(autodarts.seatsOf(lobby), [ALICE.id]);

  assert.equal(seat(bearerOf(BOB), bob), 201);
  assert.deepEqual(autodarts.seatsOf(lobby), [ALICE.id, BOB.id]);
  assert.equal(
    autodarts.sent.filter((request) => request.path === "seat").length,
    5,
  );
});

test("the host takes an account out of a lobby, which it can join again", () => {
  const autodarts = new FakeAutodarts();
  const lobby = autodarts.openLobby(ALICE, "board-1");
  const bob = { name: BOB.username, userId: BOB.id, boardId: "board-1" };
  const seat = () =>
    autodarts.answerGame("POST", `lobbies/${lobby}/players`, bearerOf(BOB), bob)
      .status;
  assert.equal(seat(), 201);

  autodarts.leave(lobby, BOB);
  assert.deepEqual(autodarts.seatsOf(lobby), [ALICE.id]);
  // Taking out an account that sits nowhere, or in no lobby, changes nothing.
  autodarts.leave(lobby, CAROL);
  autodarts.leave("0b5a1c2d-0000-4000-8000-00000000dead", BOB);
  assert.deepEqual(autodarts.seatsOf(lobby), [ALICE.id]);

  assert.equal(seat(), 201);
  assert.deepEqual(autodarts.seatsOf(lobby), [ALICE.id, BOB.id]);
});

test("the game service answers 404 for a lobby that it doesn't have", () => {
  const autodarts = new FakeAutodarts();
  const lobby = autodarts.openLobby(ALICE);
  for (const [method, path] of [
    ["GET", "lobbies/0b5a1c2d-0000-4000-8000-00000000dead"],
    ["POST", `lobbies/${lobby}`],
    ["GET", `lobbies/${lobby}/players`],
    ["GET", "boards"],
  ] as const) {
    const answer = autodarts.answerGame(method, path, bearerOf(BOB), null);
    assert.equal(answer.status, 404, `${method} ${path}`);
  }
  assert.deepEqual(
    autodarts.seatsOf("0b5a1c2d-0000-4000-8000-00000000dead"),
    [],
  );
});

test("the certificate is one that a TLS server can serve, for exactly the hosts it names", () => {
  const certificate = makeCertificate([
    "play.autodarts.com",
    "api.autodarts.com",
  ]);
  const x509 = new X509Certificate(certificate.cert);
  assert.equal(
    x509.subjectAltName,
    "DNS:play.autodarts.com, DNS:api.autodarts.com",
  );
  assert.equal(x509.checkHost("api.autodarts.com"), "api.autodarts.com");
  assert.equal(x509.checkHost("autodarts.com"), undefined);
  assert.equal(x509.ca, false);
  assert.ok(x509.verify(x509.publicKey), "it signs itself");
  assert.ok(
    new Date(x509.validFrom) < new Date() &&
      new Date() < new Date(x509.validTo),
  );
  assert.doesNotThrow(() =>
    createSecureContext({ cert: certificate.cert, key: certificate.key }),
  );
  assert.match(certificate.spki, /^[A-Za-z0-9+/]{43}=$/);
  // Each run makes a key of its own.
  assert.notEqual(
    makeCertificate(["play.autodarts.com"]).spki,
    certificate.spki,
  );
});

test("the certificate's serial number stays valid DER when the random bytes start with zeros", () => {
  // A serial of all zero bytes once gave the illegal padding that OpenSSL refuses.
  const certificate = makeCertificate(["play.autodarts.com"], (size) =>
    Buffer.alloc(size),
  );
  assert.doesNotThrow(() => new X509Certificate(certificate.cert));
  assert.doesNotThrow(() =>
    createSecureContext({ cert: certificate.cert, key: certificate.key }),
  );
});
