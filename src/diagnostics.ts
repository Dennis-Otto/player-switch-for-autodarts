/**
 * What the extension notes of its own work for a bug report: a ring of the last events,
 * such as a switch, a join or a renewal and how it ended, and the text that "Copy
 * diagnostics" in "Manage accounts" puts on the clipboard for the field "Logs" of the
 * bug form.
 *
 * An event holds the time, the kind of action, a word for its outcome, the HTTP status
 * of a request that failed, and for a renewal, how many accounts it renewed. Never a
 * token, a password, a name, a username, the id of an account or an address: each field
 * comes from a closed list of the code or is a number, and `parseEvents` drops whatever
 * else a stored value holds. The ring lives in `chrome.storage.local`, which only the
 * service worker and the pages of the extension read, and "Forget all accounts"
 * deletes it with everything else.
 */
import { AUTH_BASE, AuthError, GAME_BASE } from "./autodarts.ts";
import type { RunCounts } from "./health.ts";
import type { Failure, Outcome, PlayersAction } from "./messages.ts";
import type { PageSettings } from "./page.ts";
import type { Queue } from "./queue.ts";
import type { StorageArea } from "./storage.ts";

/** The key under which the extension keeps the ring of events in its storage. */
export const DIAGNOSTICS_KEY = "diagnostics";
/** How many events the ring keeps: the oldest goes as a new one comes. */
export const EVENT_LIMIT = 50;

/** The kinds of action that an event can be about. */
export const EVENT_ACTIONS = [
  "view",
  "switch",
  "join",
  "save",
  "remember",
  "forgetPassword",
  "remove",
  "protect",
  "signout",
  "renewal",
  "request",
  "failure",
] as const;

export type EventAction = (typeof EVENT_ACTIONS)[number];

/** The words of an outcome: a short word of the code, never a text of a person. */
const OUTCOME = /^[a-zA-Z]{1,24}$/;

/** One event of the ring. */
export interface DiagnosticEvent {
  /** When it ended, in milliseconds. */
  readonly at: number;
  readonly action: EventAction;
  /** How it ended, such as "ok", "unreachable", "signin" or "http". */
  readonly outcome: string;
  /** The HTTP status of a request that failed, or null. */
  readonly status: number | null;
  /** Of a request: the service of Autodarts that it went to. */
  readonly service?: Service;
  /** Of a renewal: how many accounts it renewed, and how many it couldn't. */
  readonly counts?: RunCounts;
}

/** The services of Autodarts that the extension talks to, as an event names them. */
export type Service = "signIn" | "game" | "other";

/** An event before the ring gives it its time. */
export type Note = Omit<DiagnosticEvent, "at">;

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

/** The counts of a renewal as they were stored, or undefined for anything else. */
function parseCounts(value: unknown): RunCounts | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const { renewed, rejected, unreachable, requestRefused } = value as Record<
    string,
    unknown
  >;
  return isCount(renewed) &&
    isCount(rejected) &&
    isCount(unreachable) &&
    isCount(requestRefused)
    ? { renewed, rejected, unreachable, requestRefused }
    : undefined;
}

/** One stored event, or null when it is none that this version writes. */
function parseEvent(value: unknown): DiagnosticEvent | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { at, action, outcome, status, service, counts } = value as Record<
    string,
    unknown
  >;
  if (
    typeof at !== "number" ||
    !Number.isFinite(at) ||
    !EVENT_ACTIONS.some((known) => known === action) ||
    typeof outcome !== "string" ||
    !OUTCOME.test(outcome)
  ) {
    return null;
  }
  const event: {
    at: number;
    action: EventAction;
    outcome: string;
    status: number | null;
    service?: Service;
    counts?: RunCounts;
  } = {
    at,
    action: action as EventAction,
    outcome,
    status: isCount(status) && status >= 100 && status <= 599 ? status : null,
  };
  if (service === "signIn" || service === "game" || service === "other") {
    event.service = service;
  }
  const parsed = parseCounts(counts);
  if (parsed !== undefined) {
    event.counts = parsed;
  }
  return event;
}

/**
 * Reads the stored ring: the events that this version knows, at most the last
 * `EVENT_LIMIT`, and none from anything that is no ring.
 */
export function parseEvents(stored: unknown): DiagnosticEvent[] {
  if (!Array.isArray(stored)) {
    return [];
  }
  return stored
    .map(parseEvent)
    .filter((event): event is DiagnosticEvent => event !== null)
    .slice(-EVENT_LIMIT);
}

/** The ring with `event` at its end, and its oldest event gone once it is full. */
export function appended(
  events: readonly DiagnosticEvent[],
  event: DiagnosticEvent,
): DiagnosticEvent[] {
  return [...events, event].slice(-EVENT_LIMIT);
}

/** The service of Autodarts that an address belongs to, without the address itself. */
export function serviceOf(url: string): Service {
  if (url.startsWith(`${AUTH_BASE}/`)) {
    return "signIn";
  }
  return url.startsWith(`${GAME_BASE}/`) ? "game" : "other";
}

/** A word for an error, as an event keeps it: never its message, which may say more. */
export function errorKind(error: unknown): string {
  if (error instanceof AuthError) {
    return error.kind;
  }
  if (error instanceof Error && OUTCOME.test(error.name)) {
    return error.name;
  }
  return "unknown";
}

/** The event of a renewal of the parked sessions: the worst outcome, and the counts. */
export function renewalNote(run: RunCounts): Note {
  let outcome = "ok";
  if (run.requestRefused > 0) {
    outcome = "requestRefused";
  } else if (run.unreachable > 0) {
    outcome = "unreachable";
  } else if (run.rejected > 0) {
    outcome = "rejected";
  }
  const { renewed, rejected, unreachable, requestRefused } = run;
  return {
    action: "renewal",
    outcome,
    status: null,
    counts: { renewed, rejected, unreachable, requestRefused },
  };
}

/** The kind of event of each request of the popup that the ring notes. */
const NOTED: Partial<Record<PlayersAction["action"], EventAction>> = {
  view: "view",
  switch: "switch",
  join: "join",
  adopt: "save",
  remember: "remember",
  forgetPassword: "forgetPassword",
  removeAccount: "remove",
  protect: "protect",
  signout: "signout",
};

/**
 * The event of a request of the popup, or null when the ring doesn't note it: the
 * requests that only show something, such as the view that works or "Copy
 * diagnostics", "Forget all accounts", after which nothing is kept, and a question that
 * the request asks first, such as for a PIN or the yes to end a match.
 */
export function requestNote(
  action: PlayersAction["action"],
  outcome: Outcome | { readonly error: Failure },
): Note | null {
  const kind = NOTED[action];
  if (kind === undefined) {
    return null;
  }
  if ("error" in outcome) {
    return { action: kind, outcome: outcome.error, status: null };
  }
  if (kind === "view" && outcome.ok) {
    return null;
  }
  if (outcome.ok) {
    return { action: kind, outcome: "ok", status: null };
  }
  if (
    outcome.reason === "match" ||
    (outcome.reason === "pin" && !outcome.wrong)
  ) {
    return null;
  }
  return {
    action: kind,
    outcome: outcome.reason === "pin" ? "wrongPin" : outcome.reason,
    status: null,
  };
}

/** The ring of events, which the service worker writes one change at a time. */
export interface Journal {
  /** Adds an event at the time of the clock. Never fails: a ring that can't be written stays as it was. */
  note(note: Note): Promise<void>;
  /** The events, the oldest first. */
  read(): Promise<DiagnosticEvent[]>;
  /**
   * Runs `task` between two changes of the ring, such as the wipe of "Forget all
   * accounts", so that no event noted before it lands after it.
   */
  hold<T>(task: () => Promise<T>): Promise<T>;
}

/** The ring in `area`, with the time from `now`, each change in its turn of `queue`. */
export function createJournal(
  area: Pick<StorageArea, "get" | "set">,
  now: () => number,
  queue: Queue,
): Journal {
  const read = async () =>
    parseEvents((await area.get([DIAGNOSTICS_KEY]))[DIAGNOSTICS_KEY]);
  return {
    note: (note) =>
      queue(async () => {
        const events = appended(await read(), { at: now(), ...note });
        await area.set({ [DIAGNOSTICS_KEY]: events });
      }).catch(() => {
        // The ring is a help for a report, never a reason for a request to fail.
      }),
    read: () => queue(read),
    hold: (task) => queue(task),
  };
}

/** What a person shares of an account: only how it stands, never who it is. */
export interface AccountDiagnosis {
  readonly playing: boolean;
  readonly needsSignIn: boolean;
  readonly remembersPassword: boolean;
  /** Since when the renewal of its session fails, or null. */
  readonly renewalFailingSince: number | null;
}

/** What the service worker answers to "Copy diagnostics". */
export interface Diagnostics {
  /** The version of the format of the stored accounts, or "unknown" for one of a newer version. */
  readonly format: number | "unknown";
  readonly accounts: readonly AccountDiagnosis[];
  /** The renewal of the parked sessions, as `health.ts` keeps it. */
  readonly renewal: {
    readonly lastRefreshAt: number | null;
    readonly lastAttemptAt: number | null;
    readonly suspectedChange: boolean;
    readonly requestRefused: boolean;
  };
  /** Which switches of the venue mode are on: never a PIN or its hash. */
  readonly venue: {
    readonly managerPin: boolean;
    readonly playerPins: number;
    readonly idleMinutes: number | null;
    readonly houseAccount: boolean;
  };
  readonly settings: PageSettings;
  readonly events: readonly DiagnosticEvent[];
}

/** What the page that copies the diagnostics knows of itself and its browser. */
export interface Surroundings {
  readonly version: string;
  readonly browser: string;
  /** The language of the texts of the extension. */
  readonly language: string;
  /** The language that the browser asks for. */
  readonly browserLanguage: string;
}

/** A time as a report shows it: in UTC, to the second, or "never". */
function when(time: number | null): string {
  return time === null
    ? "never"
    : new Date(time).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** How an account stands, in a few words. */
function standing(account: AccountDiagnosis): string {
  const words: string[] = [];
  if (account.playing) {
    words.push("playing");
  } else if (account.needsSignIn) {
    words.push("sign in again");
  } else {
    words.push("ready");
  }
  if (account.remembersPassword) {
    words.push("password remembered");
  }
  if (account.renewalFailingSince !== null) {
    words.push(`renewal failing since ${when(account.renewalFailingSince)}`);
  }
  return words.join(", ");
}

/** One event as a line of the report. */
function eventLine(event: DiagnosticEvent): string {
  const parts = [when(event.at), event.action];
  if (event.service !== undefined) {
    parts.push(event.service);
  }
  parts.push(event.outcome);
  if (event.status !== null) {
    parts.push(String(event.status));
  }
  if (event.counts !== undefined) {
    const { renewed, rejected, unreachable, requestRefused } = event.counts;
    parts.push(
      `(renewed ${renewed}, rejected ${rejected}, unreachable ${unreachable}, refused ${requestRefused})`,
    );
  }
  return parts.join(" ");
}

/** What the venue mode has switched on, in a few words. */
function venueLine(venue: Diagnostics["venue"]): string {
  const on: string[] = [];
  if (venue.managerPin) {
    on.push("manager PIN");
  }
  if (venue.playerPins > 0) {
    on.push(
      `${venue.playerPins} player PIN${venue.playerPins === 1 ? "" : "s"}`,
    );
  }
  if (venue.idleMinutes !== null) {
    on.push(
      `return after ${venue.idleMinutes} minutes ${venue.houseAccount ? "to the house account" : "by signing out"}`,
    );
  }
  return on.length === 0 ? "off" : on.join(", ");
}

const yesNo = (value: boolean) => (value ? "yes" : "no");

/**
 * The text that "Copy diagnostics" puts on the clipboard, in English for the field
 * "Logs" of the bug form, which shows it as it is.
 */
export function diagnosticsText(
  diagnostics: Diagnostics,
  surroundings: Surroundings,
): string {
  const { renewal, settings } = diagnostics;
  const lines = [
    `Player Switch ${surroundings.version}`,
    `Browser: ${surroundings.browser}`,
    `Language: ${surroundings.language} (browser ${surroundings.browserLanguage})`,
    `Stored format: ${diagnostics.format}`,
    `Accounts: ${diagnostics.accounts.length}`,
    ...diagnostics.accounts.map(
      (account, index) => `  ${index + 1}: ${standing(account)}`,
    ),
    `Last renewal answered: ${when(renewal.lastRefreshAt)}, last attempt: ${when(renewal.lastAttemptAt)}`,
    `Sign-in changed: ${yesNo(renewal.suspectedChange)}, request refused: ${yesNo(renewal.requestRefused)}`,
    `Venue mode: ${venueLine(diagnostics.venue)}`,
    `Button: ${settings.showButton ? settings.corner : "hidden"}, tiles: ${settings.order === "recent" ? "last played first" : "by name"}`,
    `Events (${diagnostics.events.length}, oldest first):`,
    ...diagnostics.events.map((event) => `  ${eventLine(event)}`),
  ];
  return lines.join("\n");
}
