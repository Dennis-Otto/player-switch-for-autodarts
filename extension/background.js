// The service worker: it wires the real browser (storage, the Autodarts tab, the
// clock and fetch) to the logic in lib/, which is built from src/ and fully tested.
// It holds no account logic of its own — only the wiring.
import { forget, forgetCredentials, parseState, rememberCredentials, toView } from "./lib/state.js";
import {
  adoptCurrentSession,
  refreshParked,
  signOutForNewAccount,
  switchTo,
  syncFromPage,
} from "./lib/switch.js";

const TAB_MATCHES = ["https://play.autodarts.com/*", "https://play.autodarts.io/*"];
const STORAGE_KEY = "accounts";
const REFRESH_ALARM = "refresh-parked";

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

const deps = { store, page, fetcher: (url, init) => fetch(url, init), now: () => Date.now() };

/** The current view, treating a missing page as simply no session on the page. */
async function viewNow() {
  const state = await store.load();
  let hasSession = false;
  try {
    hasSession = (await page.readToken()) !== null;
  } catch {
    hasSession = false;
  }
  return toView(state, hasSession);
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
      const { ok, reason } = await switchTo(deps, message.id);
      return { ok, reason };
    }
    case "adopt":
      await adoptCurrentSession(deps);
      return { ok: true };
    case "signout":
      await signOutForNewAccount(deps);
      return { ok: true };
    case "remember": {
      const state = await store.load();
      await store.save(
        rememberCredentials(state, message.id, { username: message.username, password: message.password }),
      );
      return { ok: true };
    }
    case "forgetPassword": {
      const state = await store.load();
      await store.save(forgetCredentials(state, message.id));
      return { ok: true };
    }
    case "removeAccount": {
      const state = await store.load();
      await store.save(forget(state, message.id));
      return { ok: true };
    }
    default:
      return { ok: true };
  }
}

async function handlePopup(message) {
  try {
    const result = await runAction(message);
    return { ...result, view: await viewNow() };
  } catch (error) {
    if (error instanceof NoPageError) {
      return { error: "noPage", view: await viewNow() };
    }
    return { error: "error", view: await viewNow() };
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
