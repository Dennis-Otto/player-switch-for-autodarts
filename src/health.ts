/**
 * Whether the renewal of the parked sessions keeps working, and what the toolbar
 * and the popup say about it: plain decisions on plain data, with the clock and the
 * language passed in. The service worker does what they decide.
 *
 * Chrome may clear an alarm when the browser restarts, and a computer that was off
 * misses the renewal that was due meanwhile. So each time the service worker starts,
 * it asks `planStart` whether to create the alarm anew and whether to renew straight
 * away, from the time of the last renewal that reached Autodarts.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How often the parked sessions are renewed, in minutes, as the alarm takes it. */
export const REFRESH_PERIOD_MINUTES = 720;
export const REFRESH_PERIOD_MS = REFRESH_PERIOD_MINUTES * MINUTE;
/** How soon a renewal runs again when Autodarts could not be reached for an account. */
export const RETRY_MS = 15 * MINUTE;
/** The badge shows at most this many accounts, and a plus beyond. */
const BADGE_LIMIT = 9;

/** What the extension keeps about the renewal itself, beside the accounts. */
export interface Health {
  /** When the last renewal ended in which Autodarts answered for every account, or null. */
  lastRefreshAt: number | null;
  /** When the last renewal ran at all, answered or not, or null. */
  lastAttemptAt: number | null;
  /** The last renewal that got answers turned every parked account away. */
  suspectedChange: boolean;
}

export const NO_HEALTH: Health = {
  lastRefreshAt: null,
  lastAttemptAt: null,
  suspectedChange: false,
};

const time = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** Reads a stored record, and starts afresh from anything it doesn't recognise. */
export function parseHealth(stored: unknown): Health {
  if (typeof stored !== "object" || stored === null) {
    return NO_HEALTH;
  }
  const { lastRefreshAt, lastAttemptAt, suspectedChange } = stored as Record<
    string,
    unknown
  >;
  return {
    lastRefreshAt: time(lastRefreshAt),
    lastAttemptAt: time(lastAttemptAt),
    suspectedChange: suspectedChange === true,
  };
}

/**
 * The renewal is due: it never ran, its last run is a period ago or more, or the
 * clock went back behind it, so its time can't be trusted.
 */
export function isOverdue(health: Health, now: number): boolean {
  const last = health.lastRefreshAt;
  return last === null || last > now || now - last >= REFRESH_PERIOD_MS;
}

/** What the service worker does about the renewal when it starts. */
export interface StartPlan {
  /** When the alarm, which is missing, should first go off; null when it is there. */
  alarmAt: number | null;
  /** The renewal is overdue and runs right away. */
  refreshNow: boolean;
}

/**
 * A run was tried less than the retry time ago. Then a start does not try again, since
 * an account that Autodarts keeps failing for would otherwise renew everyone at every
 * wake-up of the service worker; the retry alarm comes soon enough.
 */
function triedRecently(health: Health, now: number): boolean {
  const last = health.lastAttemptAt;
  return last !== null && last <= now && now - last < RETRY_MS;
}

export function planStart(
  alarmExists: boolean,
  health: Health,
  now: number,
): StartPlan {
  const overdue = isOverdue(health, now);
  const refreshNow = overdue && !triedRecently(health, now);
  if (alarmExists) {
    return { alarmAt: null, refreshNow };
  }
  let alarmAt: number;
  if (refreshNow) {
    alarmAt = now + REFRESH_PERIOD_MS;
  } else if (overdue) {
    // Tried recently, so the last attempt is in the past: retry when its time is up.
    alarmAt = (health.lastAttemptAt as number) + RETRY_MS;
  } else {
    // Not overdue means that the last run is recent and in the past.
    alarmAt = (health.lastRefreshAt as number) + REFRESH_PERIOD_MS;
  }
  return { alarmAt, refreshNow };
}

/** How one renewal of the parked sessions went, account by account. */
export interface RunCounts {
  /** Accounts with a fresh session. */
  renewed: number;
  /** Accounts that Autodarts turned away, which now have to sign in again. */
  rejected: number;
  /** Accounts that Autodarts could not be asked about; they stay as they were. */
  unreachable: number;
}

/**
 * Autodarts turned away every parked account in one run, at least two of them. One
 * account can lose its session on its own; all of them at once more likely means that
 * Autodarts changed how it signs in, and that the extension needs an update.
 */
export function looksLikeSignInChanged(run: RunCounts): boolean {
  return run.rejected >= 2 && run.renewed === 0 && run.unreachable === 0;
}

/**
 * The record after a run. Its time moves on only when Autodarts answered for every
 * account, so a start without a network catches up at the next start; the time of the
 * attempt moves on always, so that such a catch-up is tried at most once per retry time. A run that
 * renews an account clears the suspicion of a change, and one without any answer
 * leaves it as it was.
 */
export function recordRun(health: Health, run: RunCounts, now: number): Health {
  let suspectedChange = health.suspectedChange;
  if (looksLikeSignInChanged(run)) {
    suspectedChange = true;
  } else if (run.renewed > 0) {
    suspectedChange = false;
  }
  return {
    lastRefreshAt: run.unreachable === 0 ? now : health.lastRefreshAt,
    lastAttemptAt: now,
    suspectedChange,
  };
}

/** When the next run should start: soon when an account could not be renewed for now. */
export function nextRunAt(run: RunCounts, now: number): number {
  return now + (run.unreachable > 0 ? RETRY_MS : REFRESH_PERIOD_MS);
}

/** What an account shows to the toolbar: its name and whether it has to sign in again. */
export interface Attention {
  name: string;
  needsSignIn: boolean;
}

/** The text on the toolbar icon, and the names that its tooltip lists. */
export interface Badge {
  /**
   * "+" while the page holds a session that no account keeps yet, so that it gets
   * saved; otherwise the number of accounts that have to sign in again, or "".
   */
  text: string;
  /** The accounts that have to sign in again, as a list in the given language, or "". */
  names: string;
  /** What the text stands for, which picks the color of the badge and its tooltip. */
  kind: "unsaved" | "signIn" | "none";
}

export function badge(
  profiles: readonly Attention[],
  locale: string,
  unsaved = false,
): Badge {
  const waiting = profiles
    .filter((profile) => profile.needsSignIn)
    .map((profile) => profile.name);
  const names =
    waiting.length === 0
      ? ""
      : new Intl.ListFormat(locale, { type: "conjunction" }).format(waiting);
  if (unsaved) {
    return { text: "+", names, kind: "unsaved" };
  }
  if (waiting.length === 0) {
    return { text: "", names, kind: "none" };
  }
  const text =
    waiting.length > BADGE_LIMIT ? `${BADGE_LIMIT}+` : String(waiting.length);
  return { text, names, kind: "signIn" };
}

/**
 * The popup suggests an update of the extension while the last run suspected a change
 * at Autodarts and an account still has to sign in again.
 */
export function suggestsUpdate(
  health: Health,
  profiles: readonly Attention[],
): boolean {
  return (
    health.suspectedChange && profiles.some((profile) => profile.needsSignIn)
  );
}

/**
 * How long ago a session was renewed, in words of the given language, such as
 * "3 hours ago" or "vor 3 Stunden". A time ahead of the clock counts as now.
 */
export function renewedAgo(
  renewedAt: number,
  now: number,
  locale: string,
): string {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const elapsed = Math.max(0, now - renewedAt);
  if (elapsed < HOUR) {
    return format.format(-Math.floor(elapsed / MINUTE), "minute");
  }
  if (elapsed < 2 * DAY) {
    return format.format(-Math.floor(elapsed / HOUR), "hour");
  }
  return format.format(-Math.floor(elapsed / DAY), "day");
}

/**
 * Since when the renewal of a parked session fails, as "Manage accounts" shows it: a
 * date and a time in the language of the popup, such as "Oct 22, 2026, 9:15 PM", in
 * the time zone of the computer, unless a test names one.
 */
export function failingSince(
  since: number,
  locale: string,
  timeZone?: string,
): string {
  const zone = timeZone === undefined ? {} : { timeZone };
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    ...zone,
  }).format(since);
}
