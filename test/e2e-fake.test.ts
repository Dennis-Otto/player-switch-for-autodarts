// The fakes of the end-to-end tests (test/e2e/fake/) follow the rules of the real
// Autodarts that the extension depends on; a fake that let a token pass twice would
// let the end-to-end tests pass a bug.
import assert from "node:assert/strict";
import { X509Certificate } from "node:crypto";
import { test } from "node:test";
import { createSecureContext } from "node:tls";

import { readIdentity } from "../src/autodarts.ts";
import { ALICE, BOB, FakeAutodarts } from "./e2e/fake/autodarts.ts";
import { makeCertificate } from "./e2e/fake/certificate.ts";

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

test("a wrong password or an unknown account is refused with 401", () => {
  const autodarts = new FakeAutodarts();
  assert.equal(
    autodarts.answer("login", {
      username: ALICE.username,
      password: BOB.password,
    }).status,
    401,
  );
  assert.equal(
    autodarts.answer("login", { username: "nobody", password: "secret" })
      .status,
    401,
  );
  assert.equal(autodarts.answer("login", null).status, 401);
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

  assert.equal(
    autodarts.answer("refresh", { refresh_token: first }).status,
    400,
  );
  assert.deepEqual(autodarts.reused, [first]);
  // The thief and the owner both lose the session.
  assert.equal(
    autodarts.answer("refresh", { refresh_token: second }).status,
    400,
  );
  assert.equal(autodarts.sessionsOf(ALICE), 0);
});

test("a token that it never issued is refused without counting as reused", () => {
  const autodarts = new FakeAutodarts();
  assert.equal(
    autodarts.answer("refresh", { refresh_token: "made-up" }).status,
    400,
  );
  assert.equal(autodarts.answer("refresh", {}).status, 400);
  assert.equal(autodarts.answer("refresh", "not json").status, 400);
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
    400,
  );
  assert.equal(
    autodarts.answer("refresh", { refresh_token: parked }).status,
    400,
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
  assert.equal(
    autodarts.answer("logout", { refresh_token: token }).status,
    400,
  );
  assert.deepEqual(autodarts.reused, [token]);
  assert.equal(autodarts.count("logout", ALICE), 1);
});

test("a path that the service doesn't have answers 404", () => {
  const autodarts = new FakeAutodarts();
  assert.equal(autodarts.answer("token", {}).status, 404);
  assert.deepEqual(autodarts.sent, [{ path: "token", account: null }]);
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
