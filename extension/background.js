// The service worker: it wires the real browser (storage, the Autodarts tab, the
// clock and fetch) to the logic in lib/, which is built from src/ and fully tested.
// It holds no logic of its own worth testing — only the wiring.
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

const store = {
  async load() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return parseState(data[STORAGE_KEY]);
  },
  async save(state) {
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
  },
};

async function autodartsTab() {
  const tabs = await chrome.tabs.query({ url: TAB_MATCHES });
  return tabs.find((tab) => typeof tab.id === "number") ?? null;
}

async function pageMessage(action, extra = {}) {
  const tab = await autodartsTab();
  if (tab === null) {
    return null;
  }
  try {
    return await chrome.tabs.sendMessage(tab.id, { type: "page", action, ...extra });
  } catch {
    // The content script isn't running on that tab yet (e.g. the tab is still loading).
    return null;
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

async function viewNow() {
  const state = await store.load();
  const token = await page.readToken();
  return toView(state, token !== null);
}

async function handlePopup(message) {
  let ok = true;
  switch (message.action) {
    case "view":
      await syncFromPage(deps);
      break;
    case "switch": {
      ({ ok } = await switchTo(deps, message.id));
      break;
    }
    case "adopt":
      await adoptCurrentSession(deps);
      break;
    case "signout":
      await signOutForNewAccount(deps);
      break;
    case "remember": {
      const state = await store.load();
      await store.save(
        rememberCredentials(state, message.id, { username: message.username, password: message.password }),
      );
      break;
    }
    case "forgetPassword": {
      const state = await store.load();
      await store.save(forgetCredentials(state, message.id));
      break;
    }
    case "removeAccount": {
      const state = await store.load();
      await store.save(forget(state, message.id));
      break;
    }
    default:
      break;
  }
  return { ok, view: await viewNow() };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message === null || typeof message !== "object" || message.type !== "popup") {
    return false;
  }
  handlePopup(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ error: String(error) }));
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
