// The service worker: it wires the real browser (storage, the Autodarts tab, the
// clock and fetch) to the logic in lib/, which is built from src/ and fully tested.
// It holds no account logic of its own — only the wiring. Every read and change of
// the accounts goes through lib/switch.js, which runs them one at a time in the queue
// below, so a double tap or the background renewal can't spend a token twice.
//
// The popup and the switcher in the Autodarts page (switcher.html) send it the same
// requests; content.js asks it what the button in the page shows, and it relays the
// keyboard shortcut and the close of the switcher to the page.
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

const TAB_MATCHES = ["https://play.autodarts.com/*", "https://play.autodarts.io/*"];
const STORAGE_KEY = "accounts";
const REFRESH_ALARM = "refresh-parked";
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

const store = {
  async load() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return parseState(data[STORAGE_KEY]);
  },
  async save(state) {
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
  },
};

/** The Autodarts tab to switch in: the one in front, if one is, or else the first. */
async function findTab() {
  const tabs = (await chrome.tabs.query({ url: TAB_MATCHES })).filter((tab) => typeof tab.id === "number");
  return tabs.find((tab) => tab.active) ?? tabs[0];
}

async function pageMessage(action, extra = {}) {
  const tab = await findTab();
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

/**
 * A switch, or the sign-out for a new account, reloads the page and so ends a match
 * that runs there. Before it spends a token, it asks the person, through the popup or
 * the switcher, unless the request carries their yes.
 */
async function mustAskFirst(message) {
  const tab = await findTab();
  return mustConfirm(tab?.url, message.confirmed);
}

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
      if (await mustAskFirst(message)) {
        return { ok: false, reason: "match" };
      }
      const { ok, reason } = await switchTo(deps, message.id);
      return { ok, reason };
    }
    case "adopt":
      await adoptCurrentSession(deps);
      return { ok: true };
    case "signout":
      if (await mustAskFirst(message)) {
        return { ok: false, reason: "match" };
      }
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

async function handlePopup(message) {
  try {
    const result = await runAction(message);
    return { ...result, view: await readView(deps) };
  } catch (error) {
    if (error instanceof NoPageError) {
      return { error: "noPage", view: await readView(deps) };
    }
    return { error: "error", view: await readView(deps) };
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
      handlePopup(message).then(sendResponse);
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

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: 720 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    refreshParked(deps).catch(() => {});
  }
});
