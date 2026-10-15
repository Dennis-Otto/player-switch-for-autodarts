/** Shared fakes for the tests: no browser, no network, a clock that stands still. */
import type { Fetch } from "../src/autodarts.ts";
import type { PagePort, Store } from "../src/switch.ts";
import { EMPTY, type State } from "../src/state.ts";

function base64url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

/** An access token the extension can read, with the claims of an account. */
export function makeAccessToken(claims: Record<string, unknown>): string {
  return `${base64url(JSON.stringify({ alg: "none" }))}.${base64url(JSON.stringify(claims))}.signature`;
}

/** The access token of a plain account, named by its id. */
export function accessTokenFor(id: string, name = id): string {
  return makeAccessToken({ sub: id, preferred_username: name, name });
}

/** A JSON response, as Autodarts' auth service answers. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A session answer, with a readable access token for the given account. */
export function sessionResponse(id: string, refreshToken: string): Response {
  return jsonResponse({
    access_token: accessTokenFor(id),
    refresh_token: refreshToken,
    expires_in: 900,
    token_type: "Bearer",
  });
}

/** What a fake page refuses to do, as a page without the extension's script would. */
export type PageFailure = "read" | "write" | "clear";

export class FakePage implements PagePort {
  token: string | null;
  readonly writes: string[] = [];
  clears = 0;
  readonly failing: ReadonlySet<PageFailure>;

  constructor(token: string | null = null, failing: PageFailure[] = []) {
    this.token = token;
    this.failing = new Set(failing);
  }

  readToken(): Promise<string | null> {
    if (this.failing.has("read")) {
      return Promise.reject(new Error("no page"));
    }
    return Promise.resolve(this.token);
  }

  writeToken(token: string): Promise<void> {
    if (this.failing.has("write")) {
      return Promise.reject(new Error("no page"));
    }
    this.token = token;
    this.writes.push(token);
    return Promise.resolve();
  }

  clearToken(): Promise<void> {
    if (this.failing.has("clear")) {
      return Promise.reject(new Error("no page"));
    }
    this.token = null;
    this.clears += 1;
    return Promise.resolve();
  }
}

/** A fetch that counts its calls, to show that no token was spent. */
export function counting(fetcher: Fetch): Fetch & { calls: number } {
  const wrapped = ((url: string, init: RequestInit) => {
    wrapped.calls += 1;
    return fetcher(url, init);
  }) as Fetch & { calls: number };
  wrapped.calls = 0;
  return wrapped;
}

export class FakeStore implements Store {
  state: State;
  saves = 0;

  constructor(state: State = EMPTY) {
    this.state = state;
  }

  load(): Promise<State> {
    return Promise.resolve(this.state);
  }

  save(state: State): Promise<void> {
    this.state = state;
    this.saves += 1;
    return Promise.resolve();
  }
}

/** A fetch that answers by the request's URL and body, built from handlers. */
export function router(
  handlers: { refresh?: Fetch; login?: Fetch; logout?: Fetch } = {},
): Fetch {
  return (url, init) => {
    const path = url.endsWith("/refresh") ? "refresh" : url.endsWith("/login") ? "login" : "logout";
    const handler = handlers[path];
    if (handler === undefined) {
      throw new Error(`unexpected request to ${url}`);
    }
    return handler(url, init);
  };
}
