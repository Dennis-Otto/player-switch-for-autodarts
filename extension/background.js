// The service worker: it wires the real browser (storage, the Autodarts tab, the
// clock and fetch) to the logic in lib/, which is built from src/ and fully tested.
// It holds no account logic of its own — only the wiring. Every read and change of
// the accounts goes through lib/switch.js, which runs them one at a time in the queue
// below, so a double tap or the background renewal can't spend a token twice. When
// to renew, and what the toolbar icon says, lib/health.js decides.
import {
  badge,
  nextRunAt,
  parseHealth,
  planStart,
  REFRESH_PERIOD_MINUTES,
  recordRun,
  suggestsUpdate,
} from "./lib/health.js";
import { createQueue } from "./lib/queue.js";
import { forget, forgetCredentials, parseState, rememberCredentials } from "./lib/state.js";
import {
  adoptCurrentSession,
  edit,
  readView,
  refreshParked,
  signOutForNewAccount,
  switchTo,
  syncFromPage,
} from "./lib/switch.js";

const TAB_MATCHES = ["https://play.autodarts.com/*", "https://play.autodarts.io/*"];
const STORAGE_KEY = "accounts";
// How the renewal went, beside the accounts: see lib/health.js.
const HEALTH_KEY = "health";
const REFRESH_ALARM = "refresh-parked";
// The badge of the accounts that have to sign in again: white on a dark red.
const BADGE_COLOR = "#b3261e";
const BADGE_TEXT_COLOR = "#ffffff";
// How long a request to Autodarts may take. The account changes wait for each other,
// so one request that never ends would hold up every tap after it.
const REQUEST_TIMEOUT_MS = 20_000;

/** Thrown when there is no Autodarts tab with the content script to talk to. */
class NoPageError extends Error {
  constructor() {
    super("no Autodarts page");
    this.name = "NoPageError";
  }
}

const t = (key, substitution) => chrome.i18n.getMessage(key, substitution);

const store = {
  async load() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return parseState(data[STORAGE_KEY]);
  },
  async save(state) {
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
  },
};

async function loadHealth() {
  const data = await chrome.storage.local.get(HEALTH_KEY);
  return parseHealth(data[HEALTH_KEY]);
}

async function pageMessage(action, extra = {}) {
  const tabs = await chrome.tabs.query({ url: TAB_MATCHES });
  const tab = tabs.find((candidate) => typeof candidate.id === "number");
  if (tab === undefined) {
    throw new NoPageError();
  }
  try {
    return await chrome.tabs.sendMessage(tab.id, { type: "page", action, ...extra });
  } catch {
    // The tab is there but the content script isn't ready (e.g. still loading).
    throw new NoPageError();
  }
}

const page = {
  async readToken() {
    const reply = await pageMessage("read");
    return reply !== null && typeof reply.token === "string" ? reply.token : null;
  },
  async writeToken(token) {
    await pageMessage("write", { token });
  },
  async clearToken() {
    await pageMessage("clear");
  },
};

const deps = {
  store,
  page,
  fetcher: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
  now: () => Date.now(),
  queue: createQueue(),
};

async function runAction(message) {
  switch (message.action) {
    case "view":
      // A missing page here is normal (the popup may be open with no Autodarts tab).
      try {
        await syncFromPage(deps);
      } catch (error) {
        if (!(error instanceof NoPageError)) {
          throw error;
        }
      }
      return { ok: true };
    case "switch": {
      const { ok, reason } = await switchTo(deps, message.id);
      return { ok, reason };
    }
    case "adopt":
      await adoptCurrentSession(deps);
      return { ok: true };
    case "signout":
      await signOutForNewAccount(deps);
      return { ok: true };
    case "remember":
      await edit(deps, (state) =>
        rememberCredentials(state, message.id, { username: message.username, password: message.password }),
      );
      return { ok: true };
    case "forgetPassword":
      await edit(deps, (state) => forgetCredentials(state, message.id));
      return { ok: true };
    case "removeAccount":
      await edit(deps, (state) => forget(state, message.id));
      return { ok: true };
    default:
      return { ok: true };
  }
}

/** The view of the popup, and whether it should suggest an update of the extension. */
async function popupView() {
  const [view, health] = await Promise.all([readView(deps), loadHealth()]);
  return { ...view, updateHint: suggestsUpdate(health, view.profiles) };
}

async function handlePopup(message) {
  try {
    const result = await runAction(message);
    return { ...result, view: await popupView() };
  } catch (error) {
    if (error instanceof NoPageError) {
      return { error: "noPage", view: await popupView() };
    }
    return { error: "error", view: await popupView() };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message === null || typeof message !== "object" || message.type !== "popup") {
    return false;
  }
  handlePopup(message).then(sendResponse);
  return true; // the answer comes later
});

/** Shows on the toolbar icon how many accounts have to sign in again, and who. */
async function showBadge(state) {
  const { text, names } = badge(state.profiles, t("locale"));
  await chrome.action.setBadgeText({ text });
  await chrome.action.setTitle({ title: names === "" ? t("extName") : t("badgeTitle", names) });
}

function scheduleRefresh(when) {
  return chrome.alarms.create(REFRESH_ALARM, { when, periodInMinutes: REFRESH_PERIOD_MINUTES });
}

// The run that is on its way, so that the alarm and a start that catches up share one.
let refreshing = null;

/**
 * Renews the parked sessions and records how that went: the time, for the catch-up
 * after a restart, and whether Autodarts turned everyone away. Then it sets the alarm
 * for the next run, soon when Autodarts could not be reached for an account.
 */
function refresh() {
  refreshing ??= (async () => {
    try {
      const run = await refreshParked(deps);
      const now = deps.now();
      await chrome.storage.local.set({ [HEALTH_KEY]: recordRun(await loadHealth(), run, now) });
      await scheduleRefresh(nextRunAt(run, now));
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// The check of this start of the service worker, which runs once however it starts.
let started = null;

/**
 * Makes sure that the renewal keeps running. Chrome may clear an alarm when the
 * browser restarts, and a computer that was off misses the run that was due, so each
 * start of the service worker sets the alarm again where it is missing and renews
 * straight away where the last run is a period ago. It also puts the badge back,
 * which a restart of the browser clears.
 */
function ensureRenewal() {
  started ??= (async () => {
    const [alarm, health, state] = await Promise.all([chrome.alarms.get(REFRESH_ALARM), loadHealth(), store.load()]);
    // The badge must not hold up the renewal, nor a failure of it stop the renewal.
    showBadge(state).catch(() => {});
    const plan = planStart(alarm !== undefined, health, deps.now());
    if (plan.alarmAt !== null) {
      await scheduleRefresh(plan.alarmAt);
    }
    if (plan.refreshNow) {
      await refresh();
    }
  })().catch(() => {});
  return started;
}

// Every change of the accounts, from the popup or the renewal, updates the badge.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && STORAGE_KEY in changes) {
    showBadge(parseState(changes[STORAGE_KEY].newValue)).catch(() => {});
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    refresh().catch(() => {});
  }
});

// The browser starts, or the extension is installed or updated: these wake the
// service worker, whose start then runs the check below.
chrome.runtime.onStartup.addListener(ensureRenewal);
chrome.runtime.onInstalled.addListener(ensureRenewal);

chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR }).catch(() => {});
// Chrome sets the color of the badge text since version 110; an older one picks its own.
chrome.action.setBadgeTextColor?.({ color: BADGE_TEXT_COLOR })?.catch(() => {});
void ensureRenewal();
