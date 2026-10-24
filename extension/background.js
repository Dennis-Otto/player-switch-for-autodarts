// The service worker: it wires the real browser (storage, the Autodarts tab, the
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
