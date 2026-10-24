/**
 * Properties of what the extension reads from Autodarts, checked by fast-check on
 * many generated inputs. The answers of the sign-in service and the access tokens
 * come from the network: no answer may make the extension fail in a way it doesn't
 * expect, or take for a session what isn't one.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import fc from "fast-check";

import {
  AuthError,
  type Fetch,
  type Identity,
  readIdentity,
  refreshSession,
  revokeSession,
  type Session,
  signIn,
} from "../src/autodarts.ts";
import "./properties.ts";

/** Any text, beyond ASCII: names come from people, tokens from the network. */
const text = fc.string({ unit: "binary" });
const filled = fc.string({ unit: "binary", minLength: 1 });

/** Every status a Response can carry; 204, 205 and 304 carry no body. */
const status = fc.integer({ min: 200, max: 599 });
const WITHOUT_BODY = new Set([204, 205, 304]);

/** An answer of the sign-in service: JSON of any shape, nearly a session, or no JSON. */
const answerBody = fc.oneof(
  fc.jsonValue().map((value) => JSON.stringify(value)),
  fc
    .record(
      {
        access_token: fc.oneof(text, fc.jsonValue()),
        refresh_token: fc.oneof(text, fc.jsonValue()),
      },
      { requiredKeys: [] },
    )
    .map((value) => JSON.stringify(value)),
  text,
);

function respond(code: number, body: string): Fetch {
  return () => Promise.resolve(new Response(WITHOUT_BODY.has(code) ? null : body, { status: code }));
}

/** The text of the claims of an access token, as Autodarts writes it: base64url, unpadded or padded. */
function encode(bytes: Uint8Array, padded: boolean): string {
  const payload = Buffer.from(bytes).toString("base64url");
  return padded ? payload.padEnd(Math.ceil(payload.length / 4) * 4, "=") : payload;
}

function accessToken(claims: unknown, padded = false): string {
  const part = (value: unknown) => encode(Buffer.from(JSON.stringify(value), "utf8"), padded);
  return `${part({ alg: "none" })}.${part(claims)}.signature`;
}

/** What a session request ended in: the session, or the kind of its AuthError. */
async function outcome(request: Promise<Session>): Promise<Session | AuthError["kind"]> {
  try {
    return await request;
  } catch (error) {
    assert.ok(error instanceof AuthError, `not an AuthError: ${String(error)}`);
    return error.kind;
  }
}

/** A read account is never blank, keeps no stray spaces and shows only a secure picture. */
function assertReadable(identity: Identity): void {
  for (const value of [identity.id, identity.username, identity.name]) {
    assert.notEqual(value, "");
    assert.equal(value, value.trim());
  }
  assert.ok(identity.picture === null || identity.picture.startsWith("https://"));
}

test("every answer is a session or an AuthError, and a refusal only for 400 and 401", async () => {
  await fc.assert(
    fc.asyncProperty(status, answerBody, async (code, body) => {
      const result = await outcome(refreshSession(respond(code, body), "token"));
      if (typeof result === "string") {
        assert.equal(result === "rejected", code === 400 || code === 401);
        return;
      }
      // A session comes only from a successful answer that names both tokens.
      assert.ok(code >= 200 && code < 300);
      const data = JSON.parse(body) as Record<string, unknown>;
      assert.deepEqual(result, { accessToken: data.access_token, refreshToken: data.refresh_token });
      assert.notEqual(result.accessToken, "");
      assert.notEqual(result.refreshToken, "");
    }),
  );
});

test("every successful answer with two tokens is a session, whatever else it carries", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 200, max: 299 }).filter((code) => !WITHOUT_BODY.has(code)),
      filled,
      filled,
      fc.dictionary(text, fc.jsonValue()),
      async (code, access, refresh, extra) => {
        const body = JSON.stringify({ ...extra, access_token: access, refresh_token: refresh });
        const session = await signIn(respond(code, body), "user", "password");
        assert.deepEqual(session, { accessToken: access, refreshToken: refresh });
      },
    ),
  );
});

test("a service that can't be reached is never taken for a refusal", async () => {
  await fc.assert(
    fc.asyncProperty(fc.anything(), async (reason) => {
      const fetcher: Fetch = () => Promise.reject(reason);
      assert.equal(await outcome(refreshSession(fetcher, "token")), "unreachable");
      assert.equal(await outcome(signIn(fetcher, "user", "password")), "unreachable");
      await revokeSession(fetcher, "token");
    }),
  );
});

test("every request carries exactly the token, username and password it is given", async () => {
  await fc.assert(
    fc.asyncProperty(text, text, text, async (token, username, password) => {
      const sent: { url: string; method: string | undefined; body: unknown }[] = [];
      const fetcher: Fetch = (url, init) => {
        sent.push({ url, method: init.method, body: JSON.parse(String(init.body)) });
        return Promise.resolve(new Response(null, { status: 204 }));
      };
      await outcome(refreshSession(fetcher, token));
      await outcome(signIn(fetcher, username, password));
      await revokeSession(fetcher, token);
      assert.deepEqual(sent, [
        {
          url: "https://api.autodarts.com/auth/v1/refresh",
          method: "POST",
          body: { refresh_token: token, client_id: "autodarts-play" },
        },
        {
          url: "https://api.autodarts.com/auth/v1/login",
          method: "POST",
          body: { username, password, client_id: "autodarts-play" },
        },
        {
          url: "https://api.autodarts.com/auth/v1/logout",
          method: "POST",
          body: { refresh_token: token },
        },
      ]);
    }),
  );
});

test("readIdentity reads any token as an account or refuses it with an AuthError", () => {
  const claimName = fc.constantFrom("sub", "preferred_username", "name", "picture");
  const token = fc.oneof(
    text,
    fc.tuple(text, text, text).map((parts) => parts.join(".")),
    fc
      .tuple(fc.uint8Array(), fc.boolean())
      .map(([bytes, padded]) => `x.${encode(bytes, padded)}.y`),
    fc.tuple(fc.jsonValue(), fc.boolean()).map(([claims, padded]) => accessToken(claims, padded)),
    fc
      .tuple(fc.dictionary(claimName, fc.jsonValue()), fc.boolean())
      .map(([claims, padded]) => accessToken(claims, padded)),
  );
  fc.assert(
    fc.property(token, (value) => {
      let identity: Identity;
      try {
        identity = readIdentity(value);
      } catch (error) {
        assert.ok(error instanceof AuthError, `not an AuthError: ${String(error)}`);
        assert.equal(error.kind, "unreachable");
        return;
      }
      assertReadable(identity);
    }),
  );
});

test("readIdentity names the account of the token, in any language", () => {
  const nonBlank = text.filter((value) => value.trim() !== "");
  const picture = fc.oneof(text, fc.webUrl({ validSchemes: ["https", "http"] }));
  const claims = fc.record(
    {
      sub: nonBlank,
      preferred_username: fc.oneof(text, fc.jsonValue()),
      name: fc.oneof(text, fc.jsonValue()),
      picture: fc.oneof(picture, fc.jsonValue()),
    },
    { requiredKeys: ["sub"] },
  );
  fc.assert(
    fc.property(claims, fc.boolean(), (value, padded) => {
      const identity = readIdentity(accessToken(value, padded));
      assertReadable(identity);
      const trimmed = (claim: unknown): string => (typeof claim === "string" ? claim.trim() : "");
      const username = trimmed(value.preferred_username) || trimmed(value.name) || value.sub.trim();
      assert.deepEqual(identity, {
        id: value.sub.trim(),
        username,
        name: trimmed(value.name) || username,
        picture: trimmed(value.picture).startsWith("https://") ? trimmed(value.picture) : null,
      });
    }),
  );
});
