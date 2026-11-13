import assert from "node:assert/strict";
import { test } from "node:test";

import { AUTH_BASE, AuthError, GAME_BASE } from "../src/autodarts.ts";
import {
  appended,
  createJournal,
  DIAGNOSTICS_KEY,
  type DiagnosticEvent,
  type Diagnostics,
  diagnosticsText,
  EVENT_LIMIT,
  errorKind,
  parseEvents,
  renewalNote,
  requestNote,
  serviceOf,
} from "../src/diagnostics.ts";
import { createQueue } from "../src/queue.ts";

const AT = Date.UTC(2026, 10, 13, 9, 30, 15, 250);

const event = (at: number, outcome = "ok"): DiagnosticEvent => ({
  at,
  action: "switch",
  outcome,
  status: null,
});

/** A storage area in memory, which fails each write while `broken` is set. */
class Area {
  data = new Map<string, unknown>();
  broken = false;
  async get(keys: string[]) {
    return Object.fromEntries(
      keys
        .filter((key) => this.data.has(key))
        .map((key) => [key, this.data.get(key)]),
    );
  }
  async set(items: Record<string, unknown>) {
    if (this.broken) {
      throw new Error("quota");
    }
    for (const [key, value] of Object.entries(items)) {
      this.data.set(key, structuredClone(value));
    }
  }
}

test("the ring keeps the last fifty events, the oldest first", () => {
  assert.equal(EVENT_LIMIT, 50);
  let ring: DiagnosticEvent[] = [];
  for (let at = 1; at <= 60; at += 1) {
    ring = appended(ring, event(at));
  }
  assert.equal(ring.length, 50);
  assert.equal(ring[0]?.at, 11);
  assert.equal(ring.at(-1)?.at, 60);
});

test("parseEvents keeps only events of known kinds and words, and nothing else of them", () => {
  const stored = [
    event(1),
    { ...event(2), action: "steal" },
    { ...event(3), outcome: "ada@example.org" },
    { ...event(4), outcome: "" },
    { ...event(5), at: Number.NaN },
    { ...event(6), at: "6" },
    "switch ok",
    null,
    {
      ...event(7),
      action: "request",
      outcome: "http",
      status: 503,
      service: "signIn",
      username: "ada",
      token: "secret",
    },
    { ...event(8), status: 42, service: "elsewhere" },
    { ...event(9), status: 404.5 },
    {
      ...event(10),
      action: "renewal",
      counts: { renewed: 2, rejected: 0, unreachable: 1, requestRefused: 0 },
    },
    {
      ...event(11),
      action: "renewal",
      counts: { renewed: 2, rejected: -1, unreachable: 0, requestRefused: 0 },
    },
    { ...event(12), counts: "many" },
  ];
  assert.deepEqual(parseEvents(stored), [
    event(1),
    {
      at: 7,
      action: "request",
      outcome: "http",
      status: 503,
      service: "signIn",
    },
    event(8),
    event(9),
    {
      ...event(10),
      action: "renewal",
      counts: { renewed: 2, rejected: 0, unreachable: 1, requestRefused: 0 },
    },
    { ...event(11), action: "renewal" },
    event(12),
  ]);
  for (const value of [undefined, null, {}, "[]", 3]) {
    assert.deepEqual(parseEvents(value), []);
  }
  const many = Array.from({ length: 70 }, (_, index) => event(index));
  assert.equal(parseEvents(many).length, EVENT_LIMIT);
  assert.equal(parseEvents(many)[0]?.at, 20);
});

test("an event names the service of a request, never its address", () => {
  assert.equal(serviceOf(`${AUTH_BASE}/token`), "signIn");
  assert.equal(serviceOf(`${GAME_BASE}/lobbies/1234/players`), "game");
  assert.equal(serviceOf("https://example.org/"), "other");
  assert.equal(serviceOf(AUTH_BASE), "other");
});

test("an event names an error by its kind, never by its message", () => {
  assert.equal(errorKind(new AuthError("rejected", "for ada")), "rejected");
  assert.equal(errorKind(new AuthError("unreachable", "down")), "unreachable");
  assert.equal(errorKind(new TypeError("Failed to fetch ada")), "TypeError");
  assert.equal(
    errorKind(new DOMException("timed out", "TimeoutError")),
    "TimeoutError",
  );
  const odd = new Error("x");
  odd.name = "Error for ada@example.org";
  assert.equal(errorKind(odd), "unknown");
  assert.equal(errorKind("ada"), "unknown");
});

test("a renewal is noted by its worst outcome, with its counts", () => {
  const counts = { renewed: 2, rejected: 0, unreachable: 0, requestRefused: 0 };
  assert.deepEqual(renewalNote(counts), {
    action: "renewal",
    outcome: "ok",
    status: null,
    counts,
  });
  assert.equal(renewalNote({ ...counts, rejected: 1 }).outcome, "rejected");
  assert.equal(
    renewalNote({ ...counts, rejected: 1, unreachable: 1 }).outcome,
    "unreachable",
  );
  assert.equal(
    renewalNote({ ...counts, unreachable: 1, requestRefused: 1 }).outcome,
    "requestRefused",
  );
  // A copy of the counts alone, whatever else the run holds.
  assert.deepEqual(
    renewalNote({ ...counts, state: { secret: 1 } } as typeof counts).counts,
    counts,
  );
});

test("a request of the popup is noted by how it ended, but not a question or a view that worked", () => {
  assert.deepEqual(requestNote("switch", { ok: true, page: true }), {
    action: "switch",
    outcome: "ok",
    status: null,
  });
  assert.deepEqual(requestNote("adopt", { ok: true })?.action, "save");
  assert.deepEqual(
    requestNote("removeAccount", { ok: true })?.action,
    "remove",
  );
  assert.equal(
    requestNote("join", { ok: false, reason: "refused" })?.outcome,
    "refused",
  );
  assert.equal(
    requestNote("switch", {
      ok: false,
      reason: "signin",
      page: true,
    })?.outcome,
    "signin",
  );
  assert.equal(
    requestNote("switch", {
      ok: false,
      reason: "pin",
      pin: "player",
      wrong: true,
    })?.outcome,
    "wrongPin",
  );
  assert.equal(
    requestNote("switch", { ok: false, reason: "locked", retryIn: 1000 })
      ?.outcome,
    "locked",
  );
  assert.equal(
    requestNote("switch", {
      ok: false,
      reason: "pin",
      pin: "player",
      wrong: false,
    }),
    null,
  );
  assert.equal(requestNote("signout", { ok: false, reason: "match" }), null);
  assert.equal(requestNote("view", { ok: true, page: true }), null);
  assert.deepEqual(requestNote("view", { error: "noPage" }), {
    action: "view",
    outcome: "noPage",
    status: null,
  });
  for (const action of [
    "openPage",
    "stopAdding",
    "unlock",
    "forgetAll",
    "diagnostics",
  ] as const) {
    assert.equal(requestNote(action, { error: "error" }), null, action);
  }
});

test("the journal notes events in their turn with the time of its clock, and a ring that can't be written fails nothing", async () => {
  const area = new Area();
  let clock = 100;
  const journal = createJournal(area, () => clock, createQueue());
  await Promise.all([
    journal.note({ action: "switch", outcome: "ok", status: null }),
    journal.note({ action: "join", outcome: "refused", status: null }),
  ]);
  clock = 200;
  await journal.note({
    action: "request",
    outcome: "http",
    status: 503,
    service: "game",
  });
  assert.deepEqual(
    (await journal.read()).map(({ at, action }) => [at, action]),
    [
      [100, "switch"],
      [100, "join"],
      [200, "request"],
    ],
  );
  // Nothing noted before a task that it holds lands after it.
  void journal.note({ action: "switch", outcome: "ok", status: null });
  await journal.hold(async () => {
    area.data.clear();
  });
  assert.deepEqual(await journal.read(), []);
  area.broken = true;
  await journal.note({ action: "switch", outcome: "ok", status: null });
  assert.equal(area.data.has(DIAGNOSTICS_KEY), false);
});

const DIAGNOSTICS: Diagnostics = {
  format: 2,
  accounts: [
    {
      playing: true,
      needsSignIn: false,
      remembersPassword: false,
      renewalFailingSince: null,
    },
    {
      playing: false,
      needsSignIn: false,
      remembersPassword: true,
      renewalFailingSince: AT,
    },
    {
      playing: false,
      needsSignIn: true,
      remembersPassword: false,
      renewalFailingSince: null,
    },
  ],
  renewal: {
    lastRefreshAt: AT,
    lastAttemptAt: null,
    suspectedChange: false,
    requestRefused: true,
  },
  venue: {
    managerPin: true,
    playerPins: 2,
    idleMinutes: 30,
    houseAccount: true,
  },
  settings: { showButton: true, corner: "top-left", order: "recent" },
  events: [
    { at: AT, action: "switch", outcome: "ok", status: null },
    {
      at: AT,
      action: "request",
      service: "signIn",
      outcome: "http",
      status: 400,
    },
    {
      at: AT,
      action: "renewal",
      outcome: "requestRefused",
      status: null,
      counts: { renewed: 1, rejected: 0, unreachable: 1, requestRefused: 1 },
    },
  ],
};

const SURROUNDINGS = {
  version: "1.7.0",
  browser: "Google Chrome 142",
  language: "de",
  browserLanguage: "de-DE",
};

test("the copy for the report says how everything stands, in a block of text", () => {
  assert.equal(
    diagnosticsText(DIAGNOSTICS, SURROUNDINGS),
    [
      "Player Switch 1.7.0",
      "Browser: Google Chrome 142",
      "Language: de (browser de-DE)",
      "Stored format: 2",
      "Accounts: 3",
      "  1: playing",
      "  2: ready, password remembered, renewal failing since 2026-11-13T09:30:15Z",
      "  3: sign in again",
      "Last renewal answered: 2026-11-13T09:30:15Z, last attempt: never",
      "Sign-in changed: no, request refused: yes",
      "Venue mode: manager PIN, 2 player PINs, return after 30 minutes to the house account",
      "Button: top-left, tiles: last played first",
      "Events (3, oldest first):",
      "  2026-11-13T09:30:15Z switch ok",
      "  2026-11-13T09:30:15Z request signIn http 400",
      "  2026-11-13T09:30:15Z renewal requestRefused (renewed 1, rejected 0, unreachable 1, refused 1)",
    ].join("\n"),
  );
});

test("the copy says when the venue mode is off, the button hidden and the format unknown", () => {
  const text = diagnosticsText(
    {
      ...DIAGNOSTICS,
      format: "unknown",
      accounts: [],
      renewal: { ...DIAGNOSTICS.renewal, suspectedChange: true },
      venue: {
        managerPin: false,
        playerPins: 0,
        idleMinutes: null,
        houseAccount: false,
      },
      settings: { showButton: false, corner: "top-left", order: "name" },
      events: [],
    },
    SURROUNDINGS,
  );
  for (const line of [
    "Stored format: unknown",
    "Accounts: 0",
    "Sign-in changed: yes, request refused: yes",
    "Venue mode: off",
    "Button: hidden, tiles: by name",
    "Events (0, oldest first):",
  ]) {
    assert.ok(text.split("\n").includes(line), line);
  }
  const single = diagnosticsText(
    {
      ...DIAGNOSTICS,
      venue: {
        managerPin: false,
        playerPins: 1,
        idleMinutes: 15,
        houseAccount: false,
      },
    },
    SURROUNDINGS,
  );
  assert.ok(
    single.includes(
      "Venue mode: 1 player PIN, return after 15 minutes by signing out",
    ),
  );
});
