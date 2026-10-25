import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CONTRACT,
  checkForward,
  checkLogin,
  checkLogout,
  checkPage,
  checkRefresh,
  type Finding,
  locate,
  MADE_UP,
  OLD_PLAY_ORIGIN,
  placesOf,
  Requests,
  run,
  scriptsOf,
  summary,
} from "../scripts/upstream-contract.ts";
import {
  AUTH_BASE,
  CLIENT_ID,
  type Fetch,
  PLAY_ORIGIN,
  SESSION_KEY,
} from "../src/autodarts.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** The start page of the fake Autodarts Play, with its scripts as Vite writes them. */
const PAGE = `<!doctype html><html><head>
<script type="module" crossorigin src="/assets/index.js"></script>
<link rel="modulepreload" crossorigin href="/assets/vendor.js">
<link rel="modulepreload" crossorigin href="/assets/auth.js">
<link rel="modulepreload" crossorigin href="/assets/late.js">
<link rel="stylesheet" href="/assets/style.css">
</head><body><div id="root"></div></body></html>`;

/** The minified code of Autodarts Play that keeps its session and signs in. */
const AUTH_CODE = `var o=\`${AUTH_BASE}\`,s=\`${CLIENT_ID}\`;function E(e,t){n.set(\`${SESSION_KEY}\`,t)}`;

type Answer = (init: RequestInit) => Response | Promise<Response>;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const text = (body: string, status = 200): Response =>
  new Response(body, { status });

/** The answers of the real Autodarts on 2026-10-25, for the made-up data of the checks. */
const ANSWERS: Record<string, Answer> = {
  [`${PLAY_ORIGIN}/`]: () => text(PAGE),
  [`${PLAY_ORIGIN}/assets/index.js`]: () => text('import "./vendor.js";'),
  [`${PLAY_ORIGIN}/assets/vendor.js`]: () => text("var react = {};"),
  [`${PLAY_ORIGIN}/assets/auth.js`]: () => text(AUTH_CODE),
  [`${PLAY_ORIGIN}/assets/late.js`]: () => text("var late = 1;"),
  [`${OLD_PLAY_ORIGIN}/lobbies`]: () =>
    new Response(null, {
      status: 301,
      headers: { Location: `${PLAY_ORIGIN}/lobbies` },
    }),
  [`${AUTH_BASE}/refresh`]: () =>
    json(401, { error: { status: 401, code: "invalid_token" } }),
  [`${AUTH_BASE}/login`]: () =>
    json(401, { error: { status: 401, code: "invalid_credentials" } }),
  [`${AUTH_BASE}/logout`]: () => json(200, { success: true }),
};

interface FakeAutodarts {
  readonly fetch: Fetch;
  /** Every request, as METHOD url. */
  readonly requests: string[];
  /** The JSON bodies that reached the sign-in service, by path. */
  readonly bodies: Map<string, unknown>;
}

/** A fake Autodarts with the answers of ANSWERS, or others for some addresses. */
const autodarts = (
  overrides: Record<string, Answer | Error | string> = {},
): FakeAutodarts => {
  const requests: string[] = [];
  const bodies = new Map<string, unknown>();
  const fetcher: Fetch = async (url, init) => {
    requests.push(`${init.method ?? "GET"} ${url}`);
    if (typeof init.body === "string") {
      bodies.set(new URL(url).pathname, JSON.parse(init.body));
    }
    const answer = overrides[url] ?? ANSWERS[url];
    if (answer instanceof Error || typeof answer === "string") {
      throw answer;
    }
    return answer === undefined
      ? text("404 page not found", 404)
      : answer(init);
  };
  return { fetch: fetcher, requests, bodies };
};

const requestsOf = (fake: FakeAutodarts): Requests => new Requests(fake.fetch);

const byWhat = (findings: readonly Finding[], what: string): Finding => {
  const finding = findings.find((candidate) => candidate.what.startsWith(what));
  assert.ok(finding, `a finding "${what}"`);
  return finding;
};

const withSummary = async (
  action: (file: string) => Promise<void>,
): Promise<void> => {
  const dir = mkdtempSync(join(tmpdir(), "upstream-"));
  try {
    await action(join(dir, "summary.md"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("Autodarts as it is passes every check, with a handful of requests and made-up data", async () => {
  const fake = autodarts();
  const lines: string[] = [];
  await withSummary(async (file) => {
    const code = await run({ GITHUB_STEP_SUMMARY: file }, fake.fetch, (line) =>
      lines.push(line),
    );
    assert.equal(code, 0);
    const report = readFileSync(file, "utf8");
    assert.match(report, /### What the extension relies on at Autodarts/);
    assert.match(report, /Autodarts works the way the extension relies on\./);
    assert.match(
      report,
      /8 requests reached Autodarts, with made-up data only/,
    );
    assert.doesNotMatch(report, /\*\*changed\*\*/);
  });
  assert.equal(lines.length, 7);
  assert.ok(lines.every((line) => !line.startsWith("::error")));
  // The search stops at the script that has everything; the page has one more.
  assert.deepEqual(fake.requests, [
    `GET ${PLAY_ORIGIN}/`,
    `GET ${PLAY_ORIGIN}/assets/index.js`,
    `GET ${PLAY_ORIGIN}/assets/vendor.js`,
    `GET ${PLAY_ORIGIN}/assets/auth.js`,
    `GET ${OLD_PLAY_ORIGIN}/lobbies`,
    `POST ${AUTH_BASE}/refresh`,
    `POST ${AUTH_BASE}/login`,
    `POST ${AUTH_BASE}/logout`,
  ]);
  // Only made-up data reaches Autodarts, through the functions of the extension.
  assert.deepEqual(fake.bodies.get("/auth/v1/refresh"), {
    refresh_token: MADE_UP.token,
    client_id: CLIENT_ID,
  });
  assert.deepEqual(fake.bodies.get("/auth/v1/login"), {
    username: MADE_UP.username,
    password: MADE_UP.password,
    client_id: CLIENT_ID,
  });
  assert.deepEqual(fake.bodies.get("/auth/v1/logout"), {
    refresh_token: MADE_UP.token,
  });
});

test("a renamed key of the session fails the check and names every place that relies on it", async () => {
  const fake = autodarts({
    [`${PLAY_ORIGIN}/assets/auth.js`]: () =>
      text(AUTH_CODE.replaceAll(SESSION_KEY, "autodarts_session")),
  });
  const lines: string[] = [];
  await withSummary(async (file) => {
    const code = await run({ GITHUB_STEP_SUMMARY: file }, fake.fetch, (line) =>
      lines.push(line),
    );
    assert.equal(code, 1);
    const report = readFileSync(file, "utf8");
    assert.match(
      report,
      /\| The key of the session in the page \| `autodarts_refresh_token` in the code of https:\/\/play\.autodarts\.com \| missing from the page and its 4 scripts \| \*\*changed\*\* \|/,
    );
    const change = report
      .split("\n")
      .find((line) =>
        line.startsWith("- **Changed: The key of the session in the page.**"),
      );
    assert.ok(change, report);
    for (const file of [
      "src/autodarts.ts",
      "extension/content.js",
      "test/e2e/fake/play.js",
    ]) {
      assert.ok(change.includes(`\`${file}:`), `${file} in ${change}`);
    }
    assert.match(report, /What to do: .*development\.md#/);
  });
  // Every script was searched, since the key was in none of them.
  assert.ok(fake.requests.includes(`GET ${PLAY_ORIGIN}/assets/late.js`));
  const errors = lines.filter((line) => line.startsWith("::error"));
  assert.equal(errors.length, 1);
  assert.match(
    errors[0] ?? "",
    /^::error title=Autodarts changed::The key of the session in the page\. .*src\/autodarts\.ts:\d+/,
  );
});

test("a change of the expected key or sign-in service on this side fails the check too", async () => {
  // As after a change of src/autodarts.ts that Autodarts doesn't share.
  const contract = {
    ...CONTRACT,
    sessionKey: "autodarts_session",
    authBase: "https://api.autodarts.com/auth/v2",
  };
  const fake = autodarts();
  const findings = await checkPage(requestsOf(fake), contract);
  assert.deepEqual(
    findings.map((finding) => finding.ok),
    [false, false, true],
  );
  const report = summary(findings, 6);
  assert.match(report, /6 requests reached Autodarts/);
  // A text that the code no longer has leaves the file alone.
  assert.match(
    report,
    /relies on it in `src\/autodarts\.ts`, `extension\/content\.js`/,
  );
});

test("the report of the run goes to the output without a job summary", async () => {
  const lines: string[] = [];
  const code = await run({}, autodarts().fetch, (line) => lines.push(line));
  assert.equal(code, 0);
  assert.match(lines.at(-1) ?? "", /^### What the extension relies on/);
});

test("a page that doesn't load fails every check of its code, without a request for its scripts", async () => {
  for (const [answer, found] of [
    [() => text("bad gateway", 502), "the page answered 502"],
    [
      new Error("getaddrinfo ENOTFOUND"),
      "the page didn't answer: getaddrinfo ENOTFOUND",
    ],
    ["offline", "the page didn't answer: offline"],
  ] as const) {
    const fake = autodarts({ [`${PLAY_ORIGIN}/`]: answer });
    const findings = await checkPage(requestsOf(fake), CONTRACT);
    assert.equal(findings.length, 3);
    for (const finding of findings) {
      assert.equal(finding.ok, false);
      assert.equal(finding.found, found);
    }
    assert.equal(fake.requests.length, 1);
  }
});

test("scripts that don't load are counted and skipped", async () => {
  const fake = autodarts({
    [`${PLAY_ORIGIN}/assets/index.js`]: () => text("gone", 404),
    [`${PLAY_ORIGIN}/assets/vendor.js`]: new Error("reset"),
    [`${PLAY_ORIGIN}/assets/auth.js`]: () => text("var nothing;"),
  });
  const findings = await checkPage(requestsOf(fake), CONTRACT);
  assert.equal(
    byWhat(findings, "The sign-in service").found,
    "missing from the page and its 4 scripts, 2 of which didn't load",
  );
});

test("a page with one script says so", async () => {
  const fake = autodarts({
    [`${PLAY_ORIGIN}/`]: () =>
      text('<script type="module" src="/assets/index.js"></script>'),
  });
  const findings = await checkPage(requestsOf(fake), CONTRACT);
  assert.equal(findings[0]?.found, "missing from the page and its 1 script");
});

test("the scripts of a forwarded page are found from the address it ended at", async () => {
  const fake = autodarts({
    [`${PLAY_ORIGIN}/`]: () => {
      const response = text('<script src="assets/app.js"></script>');
      Object.defineProperty(response, "url", { value: `${PLAY_ORIGIN}/de/` });
      return response;
    },
    [`${PLAY_ORIGIN}/de/assets/app.js`]: () => text(AUTH_CODE),
  });
  const findings = await checkPage(requestsOf(fake), CONTRACT);
  assert.ok(findings.every((finding) => finding.ok));
  assert.equal(findings[0]?.found, "in /de/assets/app.js");
});

test("scriptsOf takes the scripts and module preloads of the page's own origin, once each", () => {
  const html = `
    <script>inline()</script>
    <script src=""></script>
    <script type="module" crossorigin src="/assets/a.js"></script>
    <SCRIPT SRC='/assets/b.js'></SCRIPT>
    <script src=/assets/c.js defer></script>
    <script data-src="/assets/lazy.js"></script>
    <link rel="modulepreload" href="/assets/d.js">
    <link rel="preload modulepreload" href="/assets/a.js">
    <link rel="stylesheet" href="/assets/style.css">
    <link href="/assets/no-rel.js">
    <link rel="modulepreload">
    <script src="https://cdn.example.com/x.js"></script>
    <script src="http://[broken"></script>`;
  assert.deepEqual(scriptsOf(html, `${PLAY_ORIGIN}/`), [
    `${PLAY_ORIGIN}/assets/a.js`,
    `${PLAY_ORIGIN}/assets/b.js`,
    `${PLAY_ORIGIN}/assets/c.js`,
    `${PLAY_ORIGIN}/assets/d.js`,
  ]);
});

test("the forward of play.autodarts.io has to keep the path and reach Autodarts Play", async () => {
  const forward = (status: number, location?: string) => () =>
    new Response(null, {
      status,
      headers: location === undefined ? {} : { Location: location },
    });
  const cases: [Answer | Error, boolean, string][] = [
    [
      forward(302, `${PLAY_ORIGIN}/lobbies`),
      true,
      `302, a forward to ${PLAY_ORIGIN}/lobbies`,
    ],
    [
      forward(301, `${PLAY_ORIGIN}/`),
      false,
      `301, a forward to ${PLAY_ORIGIN}/`,
    ],
    [
      forward(301, "/lobbies"),
      false,
      `301, a forward to ${OLD_PLAY_ORIGIN}/lobbies`,
    ],
    [
      forward(200, `${PLAY_ORIGIN}/lobbies`),
      false,
      `200, a forward to ${PLAY_ORIGIN}/lobbies`,
    ],
    [forward(200), false, "200, without a forward"],
    [new Error("timeout"), false, "no answer: timeout"],
  ];
  for (const [answer, ok, found] of cases) {
    const fake = autodarts({ [`${OLD_PLAY_ORIGIN}/lobbies`]: answer });
    const finding = await checkForward(requestsOf(fake), CONTRACT);
    assert.equal(finding.ok, ok, found);
    assert.equal(finding.found, found);
    assert.equal(finding.what, "The forward of play.autodarts.io");
  }
});

test("the sign-in service has to refuse a made-up token and a made-up account with 400 or 401", async () => {
  const cases: [Answer | Error, boolean, string][] = [
    [() => json(401, {}), true, "refused with 401"],
    [() => json(400, {}), true, "refused with 400"],
    [
      () => text("404 page not found", 404),
      false,
      "answered 404: the address is gone, and the extension takes that for an outage and keeps retrying",
    ],
    [
      () => text("", 503),
      false,
      "answered 503, which the extension takes for an outage",
    ],
    [
      () => json(200, { access_token: "a.b.c", refresh_token: "r" }),
      false,
      "a session, for made-up data",
    ],
    [new Error("reset"), false, "no answer: Autodarts could not be reached"],
  ];
  for (const check of [checkRefresh, checkLogin]) {
    for (const [answer, ok, found] of cases) {
      const fake = autodarts({
        [`${AUTH_BASE}/refresh`]: answer,
        [`${AUTH_BASE}/login`]: answer,
      });
      const finding = await check(requestsOf(fake), CONTRACT);
      assert.equal(finding.ok, ok, found);
      assert.equal(finding.found, found);
    }
  }
});

test("the end of a session has to answer at its address", async () => {
  const cases: [Answer | Error, boolean, string][] = [
    [() => json(200, { success: true }), true, "answered 200"],
    [() => json(401, { error: "invalid_grant" }), true, "answered 401"],
    [() => json(400, { error: "invalid_grant" }), true, "answered 400"],
    [() => json(400, { error: "invalid_request" }), false, "answered 400"],
    [() => json(401, {}), false, "answered 401"],
    [
      () => text("404 page not found", 404),
      false,
      "answered 404: the address is gone, so the session of a removed account stays alive until it expires",
    ],
    [() => text("", 500), false, "answered 500"],
    [new Error("reset"), false, "no answer: reset"],
  ];
  for (const [answer, ok, found] of cases) {
    const fake = autodarts({ [`${AUTH_BASE}/logout`]: answer });
    const finding = await checkLogout(requestsOf(fake), CONTRACT);
    assert.equal(finding.ok, ok, found);
    assert.equal(finding.found, found);
  }
});

test("a request that hangs counts as unanswered", async () => {
  const hanging: Fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    });
  const requests = new Requests(hanging, 10);
  const finding = await checkLogout(requests, CONTRACT);
  assert.equal(finding.ok, false);
  assert.match(finding.found, /^no answer: .*timed? ?out/i);
  assert.equal(requests.count, 1);
  assert.equal(requests.status, undefined);
});

test("the report escapes its table and counts in words", () => {
  const finding: Finding = {
    what: "A | B",
    expected: "x",
    found: "y",
    ok: false,
    places: [{ file: "src/autodarts.ts", text: "export const SESSION_KEY" }],
  };
  const report = summary([finding], 1);
  assert.match(report, /\| A \\\| B \| x \| y \| \*\*changed\*\* \|/);
  assert.match(report, /^1 request reached Autodarts/m);
  assert.match(report, /relies on it in `src\/autodarts\.ts:13`\./);
});

test("locate finds every line with the text, or names the file alone", () => {
  assert.deepEqual(
    locate(ROOT, [
      { file: "src/autodarts.ts", text: "export const SESSION_KEY" },
      { file: "src/autodarts.ts", text: "no such text in the file" },
      { file: "no/such/file.ts", text: "anything" },
    ]),
    ["src/autodarts.ts:13", "src/autodarts.ts", "no/such/file.ts"],
  );
});

test("every place that the report names still has its value, the copies in extension/ and the fake Autodarts among them", () => {
  for (const [part, places] of Object.entries(placesOf(CONTRACT))) {
    for (const place of places) {
      const [where] = locate(ROOT, [place]);
      assert.match(
        where ?? "",
        /:\d+$/,
        `${place.file} no longer has ${place.text} (${part}); change it with src/autodarts.ts, or the place in scripts/upstream-contract.ts`,
      );
    }
  }
});

test("the workflow runs the file itself, which writes the report", async () => {
  await withSummary(async (file) => {
    const script = fileURLToPath(
      new URL("../scripts/upstream-contract.ts", import.meta.url),
    );
    // No request leaves the test: the fetch of the child process fails at once.
    const offline =
      "data:text/javascript,globalThis.fetch=()=>Promise.reject(new Error('offline'))";
    const result = spawnSync(process.execPath, ["--import", offline, script], {
      env: { ...process.env, GITHUB_STEP_SUMMARY: file },
      encoding: "utf8",
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /::error title=Autodarts changed::/);
    assert.match(
      readFileSync(file, "utf8"),
      /\| The answer to a dead session \| .* \| no answer: Autodarts could not be reached \| \*\*changed\*\* \|/,
    );
  });
});
