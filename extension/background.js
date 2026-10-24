// The service worker: it wires the real browser (storage, the Autodarts tabs, the
// clock and fetch) to the logic in lib/, which is built from src/ and fully tested.
// It holds no account logic of its own — only the wiring. Every read and change of
// the accounts goes through lib/switch.js, which runs them one at a time in the queue
// below, so a double tap or the background renewal can't spend a token twice.
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
import { createPage, NoPageError, showPage, withPage } from "./lib/tabs.js";

const TAB_MATCHES = ["https://play.autodarts.com/*", "https://play.autodarts.io/*"];
const STORAGE_KEY = "accounts";
const REFRESH_ALARM = "refresh-parked";
// How long a request to Autodarts may take. The account changes wait for each other,
// so one request that never ends would hold up every tap after it.
const REQUEST_TIMEOUT_MS = 20_000;

const store = {
  async load() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return parseState(data[STORAGE_KEY]);
  },
  async save(state) {
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
  },
};

// The Autodarts tabs. The host access of the manifest lets the query filter tabs by
// their address, so the extension needs no "tabs" permission and sees no other tab.
const tabs = {
  query: () => chrome.tabs.query({ url: TAB_MATCHES }),
  focusedWindow: () =>
    chrome.windows.getLastFocused().then(
      (window) => window.id,
      () => undefined,
    ),
  send: (tabId, request) => chrome.tabs.sendMessage(tabId, request),
  reload: (tabId) => chrome.tabs.reload(tabId),
  open: (url, active) => chrome.tabs.create({ url, active }),
  async focus(tab) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  },
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

const deps = {
  store,
  page: createPage(tabs),
  fetcher: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
  now: () => Date.now(),
  queue: createQueue(),
};

// Each answer says in `page` whether an Autodarts tab answered, when the action asked
// one, so the popup knows when to offer "Open Autodarts".
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
        return { ok: true, page: false };
      }
      return { ok: true, page: true };
    case "switch": {
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

async function handlePopup(message) {
  try {
    const result = await runAction(message);
    return { ...result, view: await readView(deps) };
  } catch (error) {
    if (error instanceof NoPageError) {
      return { error: "noPage", page: false, view: await readView(deps) };
    }
    return { error: "error", view: await readView(deps) };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message === null || typeof message !== "object" || message.type !== "popup") {
    return false;
  }
  handlePopup(message).then(sendResponse);
  return true; // the answer comes later
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: 720 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    refreshParked(deps).catch(() => {});
  }
});
