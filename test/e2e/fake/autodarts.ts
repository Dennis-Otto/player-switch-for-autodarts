/**
 * The sign-in service of Autodarts as the end-to-end tests meet it, at
 * https://api.autodarts.com/auth/v1: it renews a session, signs an account in with
 * its password and ends a session, with the rules of the real one that the
 * extension depends on.
 *
 * - Every renewal rotates the refresh token: the answer carries a new one, and the
 *   one that was sent is spent.
 * - A spent token that comes back is taken for a stolen one: the service refuses it
 *   with 400 and ends the session it belonged to. The test records it in `reused`,
 *   and the fixture fails every test that sent one, so a token sent twice can't
 *   pass unnoticed.
 * - A wrong password is refused with 401, a token that it doesn't know with 400.
 *
 * It knows no browser and no network: `answer` takes the path and the body of a
 * request and gives the status and the body of the answer, which the fake HTTPS server
 * of server.ts sends back to the browser.
 */

/** An account of the fake Autodarts, made up for the tests. */
export interface Account {
  readonly id: string;
  readonly username: string;
  readonly name: string;
  readonly password: string;
}

export const ALICE: Account = {
  id: "alice-id",
  username: "alice",
  name: "Alice",
  password: "alice-password",
};
export const BOB: Account = {
  id: "bob-id",
  username: "bob",
  name: "Bob",
  password: "bob-password",
};
export const CAROL: Account = {
  id: "carol-id",
  username: "carol",
  name: "Carol",
  password: "carol-password",
};

/** What the service answers to one request. */
export interface Answer {
  readonly status: number;
  readonly body: unknown;
}

/** One request that the service was sent, for the checks of a test. */
export interface Sent {
  readonly path: string;
  /** The account that the request was for, or null when the service knew none. */
  readonly account: string | null;
}

interface Session {
  readonly account: Account;
  token: string;
}

function base64url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

/** An access token with the claims that the extension and the fake page read. */
export function accessTokenOf(account: Account): string {
  const header = base64url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      sub: account.id,
      preferred_username: account.username,
      name: account.name,
    }),
  );
  return `${header}.${claims}.e2e`;
}

function field(body: unknown, key: string): string | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const value: unknown = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

const REFUSED: Answer = {
  status: 400,
  body: { error: "invalid_grant", error_description: "Token is not active" },
};

export class FakeAutodarts {
  /** The refresh tokens that came back after they were spent, in order. */
  readonly reused: string[] = [];
  /** Every request, in order. */
  readonly sent: Sent[] = [];
  private readonly accounts: readonly Account[];
  private readonly live = new Map<string, Session>();
  private readonly spent = new Map<string, Session>();
  private issued = 0;

  constructor(accounts: readonly Account[] = [ALICE, BOB, CAROL]) {
    this.accounts = accounts;
  }

  /** Answers a request to `/auth/v1/<path>` with the JSON body that it carried. */
  answer(path: string, body: unknown): Answer {
    switch (path) {
      case "refresh":
        return this.refresh(field(body, "refresh_token"));
      case "login":
        return this.login(field(body, "username"), field(body, "password"));
      case "logout":
        return this.logout(field(body, "refresh_token"));
      default:
        this.sent.push({ path, account: null });
        return { status: 404, body: { error: "not_found" } };
    }
  }

  /** Ends every session of an account, as an expiry or a sign-out elsewhere does. */
  end(account: Account): void {
    for (const session of this.live.values()) {
      if (session.account === account) {
        this.close(session);
      }
    }
  }

  /** How many sessions of an account work now. */
  sessionsOf(account: Account): number {
    return [...this.live.values()].filter(
      (session) => session.account === account,
    ).length;
  }

  /** How often a request of this kind was sent for an account. */
  count(path: string, account: Account): number {
    return this.sent.filter(
      (request) => request.path === path && request.account === account.id,
    ).length;
  }

  private refresh(token: string | null): Answer {
    const session = this.use(token);
    if (session === null) {
      this.sent.push({ path: "refresh", account: null });
      return REFUSED;
    }
    this.sent.push({ path: "refresh", account: session.account.id });
    this.spend(session);
    this.rotate(session);
    return this.sessionAnswer(session);
  }

  private login(username: string | null, password: string | null): Answer {
    const account = this.accounts.find(
      (candidate) =>
        candidate.username === username && candidate.password === password,
    );
    this.sent.push({ path: "login", account: account?.id ?? null });
    if (account === undefined) {
      return {
        status: 401,
        body: {
          error: "invalid_grant",
          error_description: "Invalid user credentials",
        },
      };
    }
    const session: Session = { account, token: "" };
    this.rotate(session);
    return this.sessionAnswer(session);
  }

  private logout(token: string | null): Answer {
    const session = this.use(token);
    this.sent.push({ path: "logout", account: session?.account.id ?? null });
    if (session === null) {
      return REFUSED;
    }
    this.spend(session);
    this.close(session);
    return { status: 204, body: null };
  }

  /**
   * The live session of a refresh token, or null. A spent token is recorded as
   * reused, and its session ends, as the reuse detection of the real service does.
   */
  private use(token: string | null): Session | null {
    if (token === null) {
      return null;
    }
    const session = this.live.get(token);
    if (session !== undefined) {
      return session;
    }
    const robbed = this.spent.get(token);
    if (robbed !== undefined) {
      this.reused.push(token);
      this.close(robbed);
    }
    return null;
  }

  /** Spends the token that a session has now: it never works again. */
  private spend(session: Session): void {
    this.live.delete(session.token);
    this.spent.set(session.token, session);
  }

  private rotate(session: Session): void {
    this.issued += 1;
    session.token = `refresh-${session.account.username}-${this.issued}`;
    this.live.set(session.token, session);
  }

  private close(session: Session): void {
    this.live.delete(session.token);
  }

  private sessionAnswer(session: Session): Answer {
    return {
      status: 200,
      body: {
        access_token: accessTokenOf(session.account),
        refresh_token: session.token,
        expires_in: 300,
        token_type: "Bearer",
      },
    };
  }
}
