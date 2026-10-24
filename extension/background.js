// The service worker: it wires the real browser (storage, the Autodarts tabs, the
// clock and fetch) to the logic in lib/, which is built from src/ and fully tested.
// It holds no account logic of its own — only the wiring. Every read and change of
// the accounts goes through lib/switch.js, which runs them one at a time in the queue
// below, so a double tap or the background renewal can't spend a token twice. When
// to renew, and what the toolbar icon says, lib/health.js decides; when the welcome
// page opens, lib/onboarding.js. lib/storage.js keeps the accounts, and never saves
// over accounts in a format that this version doesn't know.
//
// The popup and the switcher in the Autodarts page (switcher.html) send it the same
// requests; content.js asks it what the button in the page shows, and it relays the
// keyboard shortcut and the close of the switcher to the page. lib/trust.js decides who
// may send which request, and keeps the storage out of the reach of content.js.
import {
  badge,
  nextRunAt,
  parseHealth,
  planStart,
  REFRESH_PERIOD_MINUTES,
  recordRun,
  suggestsUpdate,
} from "./lib/health.js";
import { welcomes } from "./lib/onboarding.js";
import { isPlayPage, mustConfirm, PLAY_ORIGINS, SETTINGS_KEY, toButtonView } from "./lib/page.js";
import { createQueue } from "./lib/queue.js";
import { EMPTY, forget, forgetCredentials, rememberCredentials, toView } from "./lib/state.js";
import { ACCOUNTS_KEY, accountsIn, createStore, UnknownStateError } from "./lib/storage.js";
import {
  adoptCurrentSession,
  adoptNewSignIn,
  edit,
  readView,
  refreshParked,
  signOutForNewAccount,
  startAddingAccount,
  stopAddingAccount,
  switchTo,
  syncFromPage,
} from "./lib/switch.js";
import { createPage, injectAll, NoPageError, rankTabs, reach, settleTab, showPage, withPage } from "./lib/tabs.js";
import { fromExtension, fromExtensionPage, keepFromContentScripts } from "./lib/trust.js";

const TAB_MATCHES = PLAY_ORIGINS.map((origin) => `${origin}/*`);
const STORAGE_KEY = ACCOUNTS_KEY;
// How the renewal went, beside the accounts: see lib/health.js.
const HEALTH_KEY = "health";
const REFRESH_ALARM = "refresh-parked";
// The colors of the badge, each with white text at a contrast of at least 4.5:1: a dark
// red for the accounts that have to sign in again, an indigo for a session on the page
// that no account keeps yet, and a green for an account that was just saved.
const BADGE_COLORS = { signIn: "#b3261e", none: "#b3261e", unsaved: "#3949ab" };
const SAVED_COLOR = "#1e7e34";
const BADGE_TEXT_COLOR = "#ffffff";
// How long the check mark of a saved account stays on the icon.
const SAVED_BADGE_MS = 4000;
// When to look for the session of a new sign-in after an Autodarts page has finished
// loading: Autodarts stores it a moment after the page has loaded, so the extension
// looks again a few times. Within 15 seconds, while the service worker is awake.
const PICK_UP_DELAYS_MS = [0, 1000, 2000, 4000, 8000];
// How long a request to Autodarts may take. The account changes wait for each other,
// so one request that never ends would hold up every tap after it.
const REQUEST_TIMEOUT_MS = 20_000;

const t = (key, substitution) => chrome.i18n.getMessage(key, substitution);

const store = createStore(chrome.storage.local);

/**
 * Writes a failure of the service worker to its console, which `chrome://extensions`
 * shows, instead of dropping it, so that a renewal that keeps failing leaves a trace.
 */
const logFailure = (what) => (error) => console.error(`Player Switch: ${what} failed.`, error);

// The saved accounts hold tokens and remembered passwords: only the service worker and
// the pages of the extension may read them, not content.js in the Autodarts page.
keepFromContentScripts(chrome.storage.local).catch(logFailure("keeping the saved accounts from the Autodarts page"));

// The Autodarts tabs. The host access of the manifest lets the query filter tabs by
// their address, so the extension needs no "tabs" permission, which would let it read
// the address of every tab. It also lets "scripting" run content.js, the extension's
// own file and no other code, in an Autodarts tab whose content script doesn't answer.
const tabs = {
  query: () => chrome.tabs.query({ url: TAB_MATCHES }),
  focusedWindow: () =>
    chrome.windows.getLastFocused().then(
      (window) => window.id,
      () => undefined,
    ),
  send: (tabId, request) => chrome.tabs.sendMessage(tabId, request, { frameId: 0 }),
  inject: async (tabId) => {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  },
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
    case "view": {
      // A new account that signed in before the page told the worker is saved now.
      const picked = await adoptNewSignIn(deps, noMatchRuns).catch(() => null);
      // A missing page here is normal (the popup may be open with no Autodarts tab).
      try {
        await syncFromPage(deps);
      } catch (error) {
        if (!(error instanceof NoPageError)) {
          throw error;
        }
        return { ok: true, page: false };
      }
      return picked?.kind === "saved" ? { ok: true, page: true, saved: picked.identity.name } : { ok: true, page: true };
    }
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
    case "stopAdding":
      await stopAddingAccount(deps);
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
async function popupView(tab) {
  const [view, health] = await Promise.all([readView({ ...shared, page: await pageFor(tab) }), loadHealth()]);
  return { ...view, updateHint: suggestsUpdate(health, view.profiles) };
}

/** The view of the popup after a failure: with no account when the accounts can't be read. */
function viewAfter(tab) {
  return popupView(tab).catch(() => ({ ...toView(EMPTY, false, 0), updateHint: false }));
}

async function handlePopup(message, tab) {
  try {
    const result = await runAction(message, tab);
    return { ...result, view: await popupView(tab) };
  } catch (error) {
    if (error instanceof NoPageError) {
      return { error: "noPage", page: false, view: await viewAfter(tab) };
    }
    if (error instanceof UnknownStateError) {
      // The accounts of a newer version stay as they are, and the popup says why.
      return { error: "unknownFormat", view: await viewAfter(tab) };
    }
    logFailure(`the request "${message.action}"`)(error);
    return { error: "error", view: await viewAfter(tab) };
  }
}

/** What the button in the page shows: the settings, and the player without a session. */
async function buttonView() {
  const data = await chrome.storage.local.get([STORAGE_KEY, SETTINGS_KEY]);
  return toButtonView(accountsIn(data), data[SETTINGS_KEY]);
}

/** Tells the content script of an Autodarts tab something; a tab without one has no say. */
function tellPage(tabId, message) {
  chrome.tabs.sendMessage(tabId, { type: "page", ...message }, { frameId: 0 }).catch(() => {});
}

// Only a page of the extension, such as the popup or the switcher, may see the accounts
// and change them; the content script in the Autodarts page may only ask what its
// button shows.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message === null || typeof message !== "object" || !fromExtension(sender, chrome.runtime.id)) {
    return false;
  }
  const fromPage = fromExtensionPage(sender, chrome.runtime.id);
  switch (message.type) {
    case "popup":
      if (!fromPage) {
        return false;
      }
      handlePopup(message, tabOf(sender)).then(sendResponse);
      return true; // the answer comes later
    case "button":
      buttonView().then(sendResponse, () => sendResponse(null));
      return true;
    case "switcher":
      // The switcher asks to close; only its own tab hears it.
      if (fromPage && message.action === "close" && typeof sender.tab?.id === "number") {
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
    redrawButtons().catch(logFailure("redrawing the button in the page"));
  }
});

// The keyboard shortcut of the switcher opens or closes it in the Autodarts tab in front.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "toggle-switcher" && typeof tab?.id === "number" && isPlayPage(tab.url)) {
    // A tab that was open before an update gets the content script of this version first.
    reach(tabs, tab.id, { type: "page", action: "toggleSwitcher" }).catch(() => {});
  }
});

// Until when the check mark of a saved account shows, which the badge then waits for.
let confirmingUntil = 0;
// The text on the badge now, so that closing a tab looks again only after a "+".
let badgeText = "";

async function setBadge(text, color, title) {
  badgeText = text;
  await Promise.all([
    chrome.action.setBadgeText({ text }),
    chrome.action.setBadgeBackgroundColor({ color }),
    chrome.action.setTitle({ title }),
  ]);
}

/**
 * Shows on the toolbar icon a "+" while the Autodarts page holds a session that no
 * account keeps yet, and otherwise how many accounts have to sign in again; the tooltip
 * says who.
 */
async function showBadge() {
  if (Date.now() < confirmingUntil) {
    return;
  }
  const view = await readView({ ...shared, page: createPage(tabs) });
  // A new account was saved while the view was read: its check mark stays.
  if (Date.now() < confirmingUntil) {
    return;
  }
  const { text, names, kind } = badge(view.profiles, t("locale"), view.unsaved);
  const lines = [];
  if (kind === "unsaved") {
    lines.push(t("badgeUnsaved"));
  }
  if (names !== "") {
    lines.push(t("badgeTitle", names));
  }
  await setBadge(text, BADGE_COLORS[kind], lines.length === 0 ? t("extName") : lines.join("\n"));
}

/** Confirms on the toolbar icon, for a moment, that a new account was saved by itself. */
async function confirmSaved(name) {
  confirmingUntil = Date.now() + SAVED_BADGE_MS;
  setTimeout(() => {
    confirmingUntil = 0;
    showBadge().catch(logFailure("the badge"));
  }, SAVED_BADGE_MS);
  // A check mark, white on green.
  await setBadge("\u2713", SAVED_COLOR, t("badgeSaved", name));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Whether no match runs in any Autodarts tab: saving a session by itself reloads every
 * Autodarts tab, which would end a match without asking, as a switch asks first.
 */
async function noMatchRuns() {
  return !(await chrome.tabs.query({ url: TAB_MATCHES })).some((tab) => mustConfirm(tab.url, false));
}

/**
 * After an Autodarts tab has finished loading: saves the session of a new account that
 * signed in there while an account is being added, and keeps the badge current, also for
 * a session that Autodarts stores a moment after the load.
 */
async function pickUp(tab) {
  const deps = { ...shared, page: createPage(tabs, tab.id) };
  // Autodarts renews the session it started with as the page loads: reading the token
  // before that would send it a second time, which ends the session.
  const ready = async () => {
    await settleTab(tabs, tab.id);
    return noMatchRuns();
  };
  for (const delay of PICK_UP_DELAYS_MS) {
    await sleep(delay);
    const result = await adoptNewSignIn(deps, ready).catch(() => null);
    if (result?.kind === "saved") {
      await confirmSaved(result.identity.name);
      return;
    }
    await showBadge();
  }
}

/**
 * The first start after the install: waits for the first account, so that the session
 * that Autodarts signs in with next is saved by itself, and shows the welcome page, once.
 */
async function welcome() {
  await startAddingAccount({ ...shared, page: createPage(tabs) });
  await chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
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
    const [alarm, health] = await Promise.all([chrome.alarms.get(REFRESH_ALARM), loadHealth()]);
    // The badge must not hold up the renewal, nor a failure of it stop the renewal.
    showBadge().catch(logFailure("the badge"));
    const plan = planStart(alarm !== undefined, health, shared.now());
    if (plan.alarmAt !== null) {
      await scheduleRefresh(plan.alarmAt);
    }
    if (plan.refreshNow) {
      await refresh();
    }
  })().catch(logFailure("the check of the renewal at the start"));
  return started;
}

// Every change of the accounts, from the popup or the renewal, updates the badge.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && STORAGE_KEY in changes) {
    showBadge().catch(logFailure("the badge"));
  }
});

// An Autodarts page that finished loading may hold the session of a new sign-in.
chrome.tabs.onUpdated.addListener((_tabId, change, tab) => {
  if (change.status === "complete" && isPlayPage(tab.url)) {
    pickUp(tab).catch(logFailure("saving a new sign-in"));
  }
});

// A closed tab may have held the session that the "+" stood for.
chrome.tabs.onRemoved.addListener(() => {
  if (badgeText === "+") {
    showBadge().catch(logFailure("the badge"));
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    refresh().catch(logFailure("the renewal of the parked sessions"));
  }
});

// The browser starts, or the extension is installed or updated: these wake the
// service worker, whose start then runs the check below. Only the install opens the
// welcome page; an update stores the accounts in the format of the new version.
chrome.runtime.onStartup.addListener(ensureRenewal);
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "update") {
    shared.queue(() => store.migrate()).catch(logFailure("bringing the saved accounts up to date"));
  }
  void ensureRenewal();
  if (details.reason === "install" || details.reason === "update") {
    // Chrome runs the content script only in pages that load after an install or an
    // update, and the script of the version before loses its link to the extension. So
    // the open Autodarts tabs get the new script now, which takes over from the old one
    // without a reload: a display in kiosk mode keeps its button, a running match goes
    // on, and a tab that this misses gets the script at the next request (lib/tabs.js).
    injectAll(tabs).catch(logFailure("adding the button to the open Autodarts tabs"));
  }
  if (welcomes(details.reason)) {
    welcome().catch(logFailure("the welcome"));
  }
});

// Chrome sets the color of the badge text since version 110; an older one picks its own.
chrome.action.setBadgeTextColor?.({ color: BADGE_TEXT_COLOR })?.catch(() => {});
void ensureRenewal();
