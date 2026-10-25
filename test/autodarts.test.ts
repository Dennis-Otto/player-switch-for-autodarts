import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AuthError,
  type Fetch,
  readIdentity,
  refreshSession,
  revokeSession,
  signIn,
} from "../src/autodarts.ts";
import { accessTokenFor, jsonResponse, makeAccessToken } from "./helpers.ts";

const answer =
  (response: Response): Fetch =>
  () =>
    Promise.resolve(response);
const throwing: Fetch = () => Promise.reject(new Error("offline"));

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

for (const status of [400, 401]) {
  test(`status ${status} means the session is rejected`, async () => {
    await assert.rejects(
      refreshSession(answer(jsonResponse({}, status)), "x"),
      (error: AuthError) => {
        assert.equal(error.kind, "rejected");
        return true;
      },
    );
  });
}

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
    const fetcher = answer(jsonResponse({ error: "invalid_grant" }, status));
    assert.equal(await revokeSession(fetcher, "token"), true);
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
