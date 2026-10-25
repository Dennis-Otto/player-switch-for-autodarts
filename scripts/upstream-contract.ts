// Checks that Autodarts still works the way the extension relies on: the key under
// which Autodarts Play keeps its session, the sign-in service and the client that it
// signs in as, the answer to a dead session and to a wrong password, the end of a
// session, and the forwarding of play.autodarts.io. None of it is a public contract
// of Autodarts, so this is how a change shows up before a player notices it.
// .github/workflows/upstream.yml runs this file every day; test/upstream-contract.test.ts
// tests it. No dependencies: the values come from src/autodarts.ts, and the requests
// to the sign-in service go through the functions of the extension itself, so neither
// can drift apart from what the extension does.
//
//   node scripts/upstream-contract.ts
//
// It sends no account, password or token of anybody, only made-up ones that Autodarts
// refuses, and about a dozen requests in all. It writes its report to the file
// GITHUB_STEP_SUMMARY, or to the output when the variable is missing, an annotation
// for each change, and exits with 1 when Autodarts no longer works as the extension
// expects.
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  AUTH_BASE,
  AuthError,
  CLIENT_ID,
  type Fetch,
  PLAY_ORIGIN,
  refreshSession,
  revokeSession,
  SESSION_KEY,
  signIn,
} from "../src/autodarts.ts";
import { escapeData } from "./store-status.ts";

/** The old address of Autodarts Play, which forwards every address to PLAY_ORIGIN. */
export const OLD_PLAY_ORIGIN = "https://play.autodarts.io";

/** The address whose forwarding the check follows; any address of the app would do. */
export const FORWARDED_PATH = "/lobbies";

/** What the requests to the sign-in service carry: made up, so Autodarts refuses them. */
export const MADE_UP = {
  token: "upstream-check-not-a-token",
  username: "upstream-check@example.invalid",
  password: "upstream-check-not-a-password",
} as const;

/** How long a request may take before it counts as unanswered. */
export const TIMEOUT_MS = 20_000;

/** Where the fix for a change of Autodarts is described. */
export const DOCS =
  "https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/docs/development.md#what-autodarts-and-the-next-chrome-change";

/** The root of the repository, where the files of Place are. */
const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** A place of the code that relies on a value: a file of the repository and the text in it. */
export interface Place {
  readonly file: string;
  readonly text: string;
}

/** What the extension expects of Autodarts; CONTRACT holds the values of src/autodarts.ts. */
export interface Contract {
  readonly playOrigin: string;
  readonly oldPlayOrigin: string;
  readonly sessionKey: string;
  readonly authBase: string;
  readonly clientId: string;
}

export const CONTRACT: Contract = {
  playOrigin: PLAY_ORIGIN,
  oldPlayOrigin: OLD_PLAY_ORIGIN,
  sessionKey: SESSION_KEY,
  authBase: AUTH_BASE,
  clientId: CLIENT_ID,
};

/** The places that rely on each part of the contract, the fake Autodarts of the end-to-end tests among them. */
export const placesOf = (contract: Contract) => {
  const authHost = new URL(contract.authBase);
  return {
    sessionKey: [
      { file: "src/autodarts.ts", text: contract.sessionKey },
      { file: "extension/content.js", text: contract.sessionKey },
      { file: "test/e2e/fake/play.js", text: contract.sessionKey },
    ],
    authBase: [
      { file: "src/autodarts.ts", text: contract.authBase },
      { file: "extension/manifest.json", text: authHost.origin },
      { file: "test/e2e/fake/play.js", text: contract.authBase },
      { file: "test/e2e/fake/server.ts", text: authHost.hostname },
    ],
    clientId: [
      { file: "src/autodarts.ts", text: contract.clientId },
      { file: "test/e2e/fake/play.js", text: contract.clientId },
    ],
    forward: [
      { file: "src/page.ts", text: new URL(contract.oldPlayOrigin).host },
    ],
    refresh: [
      { file: "src/autodarts.ts", text: '"/refresh"' },
      { file: "src/autodarts.ts", text: "response.status === 401" },
      { file: "test/e2e/fake/play.js", text: '"/refresh"' },
    ],
    login: [
      { file: "src/autodarts.ts", text: '"/login"' },
      { file: "test/e2e/fake/play.js", text: '"/login"' },
    ],
    logout: [{ file: "src/autodarts.ts", text: "/logout" }],
  } satisfies Record<string, readonly Place[]>;
};

/** One thing that the extension relies on, what it found, and where the code relies on it. */
export interface Finding {
  readonly what: string;
  readonly expected: string;
  readonly found: string;
  readonly ok: boolean;
  readonly places: readonly Place[];
}

/** The line of each place, as file:line, or the file alone when its text is gone. */
export const locate = (root: string, places: readonly Place[]): string[] =>
  places.flatMap(({ file, text }) => {
    let lines: string[];
    try {
      lines = readFileSync(`${root}/${file}`, "utf8").split("\n");
    } catch {
      return [file];
    }
    const found = lines.flatMap((line, index) =>
      line.includes(text) ? [`${file}:${index + 1}`] : [],
    );
    return found.length > 0 ? found : [file];
  });

/** The fetch of the checks: it counts the requests, keeps the last status and stops a request that hangs. */
export class Requests {
  count = 0;
  /** The status of the last answer, undefined when the last request got none. */
  status: number | undefined;
  private readonly base: Fetch;
  private readonly timeoutMs: number;

  constructor(base: Fetch, timeoutMs = TIMEOUT_MS) {
    this.base = base;
    this.timeoutMs = timeoutMs;
  }

  readonly fetch: Fetch = async (url, init) => {
    this.count += 1;
    this.status = undefined;
    const response = await this.base(url, {
      ...init,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    this.status = response.status;
    return response;
  };
}

const reason = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** The value of an attribute in the text of an HTML tag. */
const attribute = (tag: string, name: string): string | undefined => {
  const match = new RegExp(
    `\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`,
    "i",
  ).exec(tag);
  return match === null ? undefined : (match[1] ?? match[2] ?? match[3]);
};

/**
 * The scripts that a page loads at its start, in their order: those of its script
 * tags and its module preloads, from its own origin only.
 */
export const scriptsOf = (html: string, pageUrl: string): string[] => {
  const origin = new URL(pageUrl).origin;
  const scripts: string[] = [];
  for (const [tag] of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const isScript = /^<script/i.test(tag);
    const rel = (attribute(tag, "rel") ?? "").toLowerCase().split(/\s+/);
    const address = isScript
      ? attribute(tag, "src")
      : rel.includes("modulepreload")
        ? attribute(tag, "href")
        : undefined;
    if (address === undefined || address === "") {
      continue;
    }
    let url: URL;
    try {
      url = new URL(address, pageUrl);
    } catch {
      continue;
    }
    if (url.origin === origin && !scripts.includes(url.href)) {
      scripts.push(url.href);
    }
  }
  return scripts;
};

/**
 * Looks for the key of the session, the sign-in service and the client in the code
 * of Autodarts Play: its page, then its scripts one after another, until each is
 * found. A visit of a player loads every script; this stops at the one that has them.
 */
export const checkPage = async (
  requests: Requests,
  contract: Contract,
): Promise<Finding[]> => {
  const places = placesOf(contract);
  const wanted = [
    {
      what: "The key of the session in the page",
      value: contract.sessionKey,
      places: places.sessionKey,
    },
    {
      what: "The sign-in service",
      value: contract.authBase,
      places: places.authBase,
    },
    {
      what: "The client that Autodarts Play signs in as",
      value: contract.clientId,
      places: places.clientId,
    },
  ];
  const where = new Map<string, string>();
  const page = `${contract.playOrigin}/`;
  let failure: string | undefined;
  let scripts: string[] = [];
  let unloaded = 0;
  try {
    const response = await requests.fetch(page, {});
    if (response.ok) {
      scripts = scriptsOf(await response.text(), response.url || page);
    } else {
      failure = `the page answered ${response.status}`;
    }
  } catch (error) {
    failure = `the page didn't answer: ${reason(error)}`;
  }
  for (const script of scripts) {
    if (where.size === wanted.length) {
      break;
    }
    let code: string;
    try {
      const response = await requests.fetch(script, {});
      if (!response.ok) {
        unloaded += 1;
        continue;
      }
      code = await response.text();
    } catch {
      unloaded += 1;
      continue;
    }
    const path = new URL(script).pathname;
    for (const { value } of wanted) {
      if (!where.has(value) && code.includes(value)) {
        where.set(value, path);
      }
    }
  }
  const missing =
    failure ??
    `missing from the page and its ${scripts.length} ${scripts.length === 1 ? "script" : "scripts"}${unloaded > 0 ? `, ${unloaded} of which didn't load` : ""}`;
  return wanted.map(({ what, value, places: placesOfValue }) => {
    const path = where.get(value);
    return {
      what,
      expected: `\`${value}\` in the code of ${contract.playOrigin}`,
      found: path === undefined ? missing : `in ${path}`,
      ok: path !== undefined,
      places: placesOfValue,
    };
  });
};

/** Checks that the old address forwards to Autodarts Play, with the path that it was given. */
export const checkForward = async (
  requests: Requests,
  contract: Contract,
): Promise<Finding> => {
  const target = `${contract.playOrigin}${FORWARDED_PATH}`;
  let found: string;
  let ok = false;
  try {
    const response = await requests.fetch(
      `${contract.oldPlayOrigin}${FORWARDED_PATH}`,
      { redirect: "manual" },
    );
    const location = response.headers.get("location");
    if (location === null) {
      found = `${response.status}, without a forward`;
    } else {
      const to = new URL(location, contract.oldPlayOrigin).href;
      ok = [301, 302, 303, 307, 308].includes(response.status) && to === target;
      found = `${response.status}, a forward to ${to}`;
    }
  } catch (error) {
    found = `no answer: ${reason(error)}`;
  }
  return {
    what: `The forward of ${new URL(contract.oldPlayOrigin).host}`,
    expected: `a forward to ${target}`,
    found,
    ok,
    places: placesOf(contract).forward,
  };
};

/** The answers of a server for an address that it doesn't have (any more). */
const GONE: readonly number[] = [404, 405, 410];

/** What a request that Autodarts must refuse found: ok only for a refusal, 400 or 401. */
const refused = async (
  requests: Requests,
  call: () => Promise<unknown>,
): Promise<{ found: string; ok: boolean }> => {
  try {
    await call();
    return { found: "a session, for made-up data", ok: false };
  } catch (error) {
    const status = requests.status;
    if (error instanceof AuthError && error.kind === "rejected") {
      return { found: `refused with ${status}`, ok: true };
    }
    let found: string;
    if (status === undefined) {
      found = `no answer: ${reason(error)}`;
    } else if (GONE.includes(status)) {
      found = `answered ${status}: the address is gone, and the extension takes that for an outage and keeps retrying`;
    } else {
      found = `answered ${status}, which the extension takes for an outage`;
    }
    return { found, ok: false };
  }
};

/** Renews a made-up refresh token, as the extension renews a session: Autodarts must refuse it. */
export const checkRefresh = async (
  requests: Requests,
  contract: Contract,
): Promise<Finding> => ({
  what: "The answer to a dead session",
  expected: `${contract.authBase}/refresh refuses a made-up token with 400 or 401`,
  ...(await refused(requests, () =>
    refreshSession(requests.fetch, MADE_UP.token),
  )),
  places: placesOf(contract).refresh,
});

/** Signs in with a made-up account, as the extension does with a remembered password: Autodarts must refuse it. */
export const checkLogin = async (
  requests: Requests,
  contract: Contract,
): Promise<Finding> => ({
  what: "The answer to a wrong password",
  expected: `${contract.authBase}/login refuses a made-up account with 400 or 401`,
  ...(await refused(requests, () =>
    signIn(requests.fetch, MADE_UP.username, MADE_UP.password),
  )),
  places: placesOf(contract).login,
});

/**
 * Ends a made-up session, as "Remove account" ends one. The extension forgets the
 * session whatever the answer is, so a sign-in service that no longer has the address
 * would leave every removed session alive until it expires.
 */
export const checkLogout = async (
  requests: Requests,
  contract: Contract,
): Promise<Finding> => {
  let failure: string | undefined;
  const ended = await revokeSession(async (url, init) => {
    try {
      return await requests.fetch(url, init);
    } catch (error) {
      failure = reason(error);
      throw error;
    }
  }, MADE_UP.token);
  const status = requests.status;
  return {
    what: "The end of a session",
    expected: `${contract.authBase}/logout answers 2xx, or 400 or 401 with invalid_grant`,
    found:
      status === undefined
        ? `no answer: ${failure}`
        : `answered ${status}${GONE.includes(status) ? ": the address is gone, so the session of a removed account stays alive until it expires" : ""}`,
    // The extension's own reading of the answer, so the two can't drift apart.
    ok: status !== undefined && ended,
    places: placesOf(contract).logout,
  };
};

/** Every check, one after another, so that Autodarts gets one request at a time. */
export const checkAll = async (
  requests: Requests,
  contract: Contract,
): Promise<Finding[]> => [
  ...(await checkPage(requests, contract)),
  await checkForward(requests, contract),
  await checkRefresh(requests, contract),
  await checkLogin(requests, contract),
  await checkLogout(requests, contract),
];

const cell = (text: string): string => text.replaceAll("|", "\\|");

const list = (items: readonly string[]): string =>
  items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/** The report for the job summary: a table of every check and what to do about each change. */
export const summary = (
  findings: readonly Finding[],
  requestCount: number,
  root: string = ROOT,
): string => {
  const changed = findings.filter((finding) => !finding.ok);
  const lines = [
    "### What the extension relies on at Autodarts",
    "",
    "| | Expected | Found | |",
    "| --- | --- | --- | --- |",
    ...findings.map(
      (finding) =>
        `| ${cell(finding.what)} | ${cell(finding.expected)} | ${cell(finding.found)} | ${finding.ok ? "as expected" : "**changed**"} |`,
    ),
    "",
    `${requestCount} ${requestCount === 1 ? "request" : "requests"} reached Autodarts, with made-up data only.`,
    "",
  ];
  if (changed.length === 0) {
    lines.push("Autodarts works the way the extension relies on.");
  } else {
    for (const finding of changed) {
      const at = locate(root, finding.places).map((place) => `\`${place}\``);
      lines.push(
        `- **Changed: ${finding.what}.** Expected: ${finding.expected}. Found: ${finding.found}. The extension relies on it in ${list(at)}.`,
      );
    }
    lines.push(
      "",
      `What to do: look at Autodarts Play in a browser, change the code at these places and the fake Autodarts of the end-to-end tests with it, and run this check again: ${DOCS}`,
    );
  }
  return `${lines.join("\n")}\n`;
};

/** Runs every check with the variables of the workflow; returns the exit code. */
export const run = async (
  env: NodeJS.ProcessEnv,
  fetcher: Fetch = fetch,
  log: (line: string) => void = console.log,
  contract: Contract = CONTRACT,
  root: string = ROOT,
): Promise<number> => {
  const requests = new Requests(fetcher);
  const findings = await checkAll(requests, contract);
  for (const finding of findings) {
    const line = `${finding.what}. Expected: ${finding.expected}. Found: ${finding.found}.`;
    log(
      finding.ok
        ? line
        : `::error title=Autodarts changed::${escapeData(`${line} The extension relies on it in ${list(locate(root, finding.places))}.`)}`,
    );
  }
  const report = summary(findings, requests.count, root);
  const file = env.GITHUB_STEP_SUMMARY;
  if (file) {
    appendFileSync(file, report);
  } else {
    log(report);
  }
  return findings.every((finding) => finding.ok) ? 0 : 1;
};

if (import.meta.main) {
  process.exitCode = await run(process.env);
}
