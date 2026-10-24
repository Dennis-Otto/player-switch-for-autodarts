// The service worker: it wires the real browser (storage, the Autodarts tabs, the
// clock and fetch) to the logic in lib/, which is built from src/ and fully tested.
// It holds no account logic of its own — only the wiring. Every read and change of
// the accounts goes through lib/switch.js, which runs them one at a time in the queue
// below, so a double tap or the background renewal can't spend a token twice. When
// to renew, and what the toolbar icon says, lib/health.js decides.
//
// The popup and the switcher in the Autodarts page (switcher.html) send it the same
// requests; content.js asks it what the button in the page shows, and it relays the
// keyboard shortcut and the close of the switcher to the page.
import {
  badge,
  nextRunAt,
  parseHealth,
  planStart,
  REFRESH_PERIOD_MINUTES,
  recordRun,
  suggestsUpdate,
} from "./lib/health.js";
import { isPlayPage, mustConfirm, SETTINGS_KEY, toButtonView } from "./lib/page.js";
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
import { createPage, NoPageError, rankTabs, showPage, withPage } from "./lib/tabs.js";

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

const withId = (tabs) => tabs.filter((tab) => typeof tab.id === "number");

// The Autodarts tabs. The host access of the manifest lets the query filter tabs by
// their address, so the extension needs no "tabs" permission, which would let it read
// the address of every tab.
const tabs = {
  query: () => chrome.tabs.query({ url: TAB_MATCHES }),
  focusedWindow: () =>
    chrome.windows.getLastFocused().then(
      (window) => window.id,
      () => undefined,
    ),
  send: (tabId, request) => chrome.tabs.sendMessage(tabId, request, { frameId: 0 }),
  reload: (tabId) => chrome.tabs.reload(tabId),
  open: (url, active) => chrome.tabs.create({ url, active }),
  async focus(tab) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  },
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * The Autodarts tab that a request of the toolbar popup is for: the one that
 * lib/tabs.js sends a switch to first, the tab in front in the window used last.
 */
async function findTab() {
  const [all, focused] = await Promise.all([tabs.query(), tabs.focusedWindow()]);
  return rankTabs(all, focused)[0];
}

/**
 * The tab of one request, chosen once, so that the check for a match and the switch
 * concern the same tab: the tab of the switcher in the page, where the person tapped,
 * or else the one that findTab picks for the toolbar popup.
 */
function tabOf(sender) {
  const tab = sender.tab;
  return typeof tab?.id === "number" && isPlayPage(tab.url) ? Promise.resolve(tab) : findTab();
}

async function loadHealth() {
  const data = await chrome.storage.local.get(HEALTH_KEY);
  return parseHealth(data[HEALTH_KEY]);
}

/** The page of a request: its tab first, and the tab in front when that one is gone. */
async function pageFor(tab) {
  return createPage(tabs, (await tab)?.id);
}

// What every change of the accounts shares; each one adds the page of its tab.
const shared = {
  store,
  fetcher: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
  now: () => Date.now(),
  queue: createQueue(),
};

/**
 * A switch, or the sign-out for a new account, reloads the page, and every other
 * Autodarts tab with it, and so ends a match that runs in any of them. Before it
 * spends a token, it asks the person, through the popup or the switcher, unless the
 * request carries their yes.
 */
async function mustAskFirst(tab, message) {
  const all = await tabs.query().catch(() => []);
  return [await tab, ...all].some((candidate) => mustConfirm(candidate?.url, message.confirmed));
}

// Each answer says in `page` whether an Autodarts tab answered, when the action asked
// one, so the popup knows when to offer "Open Autodarts".
async function runAction(message, tab) {
  const deps = { ...shared, page: await pageFor(tab) };
  switch (message.action) {
    case "view":
      // A missing page here is normal (the popup may be open with no Autodarts tab).
      try {
        await syncFromPage(deps);
      } catch (error) {
        if (!(error instanceof NoPageError)) {
          throw error;
        }
        return { ok: true, page: false };
      }
      return { ok: true, page: true };
    case "switch": {
      if (await mustAskFirst(tab, message)) {
        return { ok: false, reason: "match" };
      }
      // With no Autodarts tab that answers, the switch opens one and goes on there.
      const { ok, reason } = await withPage(
        tabs,
        () => switchTo(deps, message.id),
        (result) => result.ok,
      );
      return { ok, reason, page: true };
    }
    case "adopt":
      await adoptCurrentSession(deps);
      return { ok: true, page: true };
    case "signout":
      if (await mustAskFirst(tab, message)) {
        return { ok: false, reason: "match" };
      }
      // The new player signs in on the page, so a page opens when none answers.
      await withPage(tabs, () => signOutForNewAccount(deps));
      return { ok: true, page: true };
    case "openPage":
      await showPage(tabs);
      return { ok: true, page: true };
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
async function popupView(tab) {
  const [view, health] = await Promise.all([readView({ ...shared, page: await pageFor(tab) }), loadHealth()]);
  return { ...view, updateHint: suggestsUpdate(health, view.profiles) };
}

async function handlePopup(message, tab) {
  try {
    const result = await runAction(message, tab);
    return { ...result, view: await popupView(tab) };
  } catch (error) {
    if (error instanceof NoPageError) {
      return { error: "noPage", page: false, view: await popupView(tab) };
    }
    return { error: "error", view: await popupView(tab) };
  }
}

/** What the button in the page shows: the settings, and the player without a session. */
async function buttonView() {
  const data = await chrome.storage.local.get([STORAGE_KEY, SETTINGS_KEY]);
  return toButtonView(parseState(data[STORAGE_KEY]), data[SETTINGS_KEY]);
}

/** Tells the content script of an Autodarts tab something; a tab without one has no say. */
function tellPage(tabId, message) {
  chrome.tabs.sendMessage(tabId, { type: "page", ...message }, { frameId: 0 }).catch(() => {});
}

/**
 * The message comes from a page of the extension, such as the popup or the switcher,
 * not from the content script in the Autodarts page. Only those may see the accounts
 * and change them.
 */
function fromExtensionPage(sender) {
  return typeof sender.url === "string" && sender.url.startsWith(chrome.runtime.getURL(""));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message === null || typeof message !== "object") {
    return false;
  }
  switch (message.type) {
    case "popup":
      if (!fromExtensionPage(sender)) {
        return false;
      }
      handlePopup(message, tabOf(sender)).then(sendResponse);
      return true; // the answer comes later
    case "button":
      buttonView().then(sendResponse, () => sendResponse(null));
      return true;
    case "switcher":
      // The switcher asks to close; only its own tab hears it.
      if (message.action === "close" && typeof sender.tab?.id === "number") {
        tellPage(sender.tab.id, { action: "closeSwitcher" });
      }
      return false;
    default:
      return false;
  }
});

/** Redraws the button in every Autodarts tab. */
async function redrawButtons() {
  const view = await buttonView();
  for (const tab of await chrome.tabs.query({ url: TAB_MATCHES })) {
    if (typeof tab.id === "number") {
      tellPage(tab.id, { action: "button", view });
    }
  }
}

// A change of the settings or of the accounts redraws the button in every Autodarts tab.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (SETTINGS_KEY in changes || STORAGE_KEY in changes)) {
    redrawButtons().catch(() => {});
  }
});

// The keyboard shortcut of the switcher opens or closes it in the Autodarts tab in front.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "toggle-switcher" && typeof tab?.id === "number" && isPlayPage(tab.url)) {
    tellPage(tab.id, { action: "toggleSwitcher" });
  }
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
      const run = await refreshParked({ ...shared, page: createPage(tabs) });
      const now = shared.now();
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
    const plan = planStart(alarm !== undefined, health, shared.now());
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
chrome.runtime.onInstalled.addListener((details) => {
  void ensureRenewal();
  if (details.reason === "install" || details.reason === "update") {
    injectIntoOpenTabs().catch(() => {});
  }
});

/**
 * Chrome runs the content script only in pages that load after an install or an
 * update, and the script of the version before loses its link to the extension. So
 * the Autodarts tabs that are already open get the new script here, which takes over
 * from the old one without a reload: a display in kiosk mode, where nobody can reload
 * the page, keeps its button, and a running match goes on.
 */
async function injectIntoOpenTabs() {
  for (const tab of withId(await chrome.tabs.query({ url: TAB_MATCHES }))) {
    // A tab that Chrome discarded, or that is still loading, gets the script when it loads.
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }).catch(() => {});
  }
}

chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR }).catch(() => {});
// Chrome sets the color of the badge text since version 110; an older one picks its own.
chrome.action.setBadgeTextColor?.({ color: BADGE_TEXT_COLOR })?.catch(() => {});
void ensureRenewal();
