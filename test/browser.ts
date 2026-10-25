/**
 * A browser for the service worker of `worker.ts`: the members of `chrome` that it uses,
 * as a fake that keeps what it was told and lets a test fire the events of the browser.
 * The Autodarts tabs share one session, as the tabs of one site share `localStorage`,
 * and each answers through its content script as `content.ts` does.
 */
import { IDBFactory as FakeIDBFactory } from "fake-indexeddb";

import type { PageRequest } from "../src/messages.ts";
import type { State } from "../src/state.ts";
import { createStore } from "../src/storage.ts";
import { createVault, keyStoreIn } from "../src/vault.ts";
import {
  type Alarm,
  type BrowserTab,
  type ChromeApi,
  type MessageSender,
  type Platform,
  type StartedWorker,
  type StorageChange,
  startWorker,
} from "../src/worker.ts";
import { FakeAutodarts } from "./helpers.ts";

export const EXTENSION_ID = "extension-id";
export const PLAY = "https://play.autodarts.com/";
export const POPUP = `chrome-extension://${EXTENSION_ID}/popup.html`;
export const SWITCHER = `chrome-extension://${EXTENSION_ID}/switcher.html`;

/** An event of the fake browser, which a test fires. */
export class FakeEvent<Listener extends (...args: never[]) => unknown> {
  readonly listeners: Listener[] = [];

  addListener(listener: Listener): void {
    this.listeners.push(listener);
  }

  fire(...args: Parameters<Listener>): ReturnType<Listener>[] {
    return this.listeners.map(
      (listener) => listener(...args) as ReturnType<Listener>,
    );
  }
}

/** A storage area of the fake browser, which tells `onChanged` of each change. */
class FakeArea {
  readonly data = new Map<string, unknown>();
  /** Makes each read or write fail, as a browser with a broken profile does. */
  failing = { get: false, set: false };
  accessLevel: string | null = null;
  setAccessLevel?:
    | ((options: { accessLevel: string }) => Promise<void>)
    | undefined = (options) => {
    this.accessLevel = options.accessLevel;
    return Promise.resolve();
  };

  private readonly name: string;
  private readonly changed: FakeEvent<
    (changes: Record<string, StorageChange>, area: string) => void
  >;

  constructor(
    name: string,
    changed: FakeEvent<
      (changes: Record<string, StorageChange>, area: string) => void
    >,
  ) {
    this.name = name;
    this.changed = changed;
  }

  get(keys: string[]): Promise<Record<string, unknown>> {
    if (this.failing.get) {
      return Promise.reject(new Error("storage broken"));
    }
    const found: Record<string, unknown> = {};
    for (const key of keys) {
      if (this.data.has(key)) {
        found[key] = structuredClone(this.data.get(key));
      }
    }
    return Promise.resolve(found);
  }

  set(items: Record<string, unknown>): Promise<void> {
    if (this.failing.set) {
      return Promise.reject(new Error("storage broken"));
    }
    const changes: Record<string, StorageChange> = {};
    for (const [key, value] of Object.entries(items)) {
      changes[key] = { oldValue: this.data.get(key), newValue: value };
      this.data.set(key, structuredClone(value));
    }
    this.changed.fire(changes, this.name);
    return Promise.resolve();
  }

  remove(keys: string[]): Promise<void> {
    const changes: Record<string, StorageChange> = {};
    for (const key of keys) {
      changes[key] = { oldValue: this.data.get(key) };
      this.data.delete(key);
    }
    this.changed.fire(changes, this.name);
    return Promise.resolve();
  }
}

/** A tab of the fake browser, and whether its content script answers. */
export interface FakeTab extends BrowserTab {
  id: number;
  /** Whether the content script answers; one that the worker runs again does. */
  answers: boolean;
  /** Whether the browser refuses to run a script there, as in a discarded tab. */
  blocked?: boolean;
}

type MessageListener = Parameters<
  ChromeApi["runtime"]["onMessage"]["addListener"]
>[0];

/** The fake browser, with what the worker did in it. */
export class FakeBrowser implements ChromeApi {
  readonly autodarts = new FakeAutodarts();
  /** The session that Autodarts keeps in the `localStorage` of its tabs. */
  pageToken: string | null = null;
  tabs_: FakeTab[] = [];
  focusedWindow: number | undefined = 1;
  readonly told: { tabId: number; message: PageRequest }[] = [];
  readonly injected: number[] = [];
  readonly reloaded: number[] = [];
  readonly opened: string[] = [];
  readonly focused: number[] = [];
  readonly badge = { text: "", color: "", title: "", textColor: "" };
  readonly alarmsSet = new Map<
    string,
    { when?: number; periodInMinutes?: number }
  >();
  readonly logs: string[] = [];
  readonly waits: number[] = [];
  readonly later: { ms: number; task: () => void }[] = [];
  readonly idb = new FakeIDBFactory();
  clock = Date.UTC(2026, 9, 25, 12);
  /** Makes the next calls of a member fail, by name. */
  readonly broken = new Set<string>();
  private nextTab = 1;

  readonly changed = new FakeEvent<
    (changes: Record<string, StorageChange>, area: string) => void
  >();
  readonly local = new FakeArea("local", this.changed);
  readonly sessionArea = new FakeArea("session", this.changed);

  readonly runtime = {
    id: EXTENSION_ID,
    getURL: (path: string) => `chrome-extension://${EXTENSION_ID}/${path}`,
    onMessage: new FakeEvent<MessageListener>(),
    onStartup: new FakeEvent<() => void>(),
    onInstalled: new FakeEvent<(details: { reason: string }) => void>(),
  };

  readonly storage = {
    local: this.local,
    session: this.sessionArea,
    onChanged: this.changed,
  };

  readonly tabs = {
    query: (info: { url: string[] }) => {
      if (
        this.broken.has("tabs.query") ||
        this.broken.delete("tabs.query.once")
      ) {
        return Promise.reject(new Error("no tabs"));
      }
      return Promise.resolve(
        this.tabs_.filter((tab) =>
          info.url.some((pattern) =>
            (tab.url ?? "").startsWith(pattern.replace("*", "")),
          ),
        ),
      );
    },
    sendMessage: (tabId: number, message: PageRequest) => {
      this.told.push({ tabId, message });
      const tab = this.tabs_.find((candidate) => candidate.id === tabId);
      if (tab === undefined || !tab.answers) {
        return Promise.reject(
          new Error(
            "Could not establish connection. Receiving end does not exist.",
          ),
        );
      }
      return Promise.resolve(this.answer(message));
    },
    reload: (tabId: number) => {
      this.reloaded.push(tabId);
      return Promise.resolve();
    },
    create: (properties: { url: string; active?: boolean }) => {
      this.opened.push(properties.url);
      if (this.broken.has("tabs.create")) {
        return Promise.resolve({ windowId: 1, active: true } as BrowserTab);
      }
      return Promise.resolve(this.addTab({ url: properties.url }));
    },
    update: (tabId: number) => {
      this.focused.push(tabId);
      return Promise.resolve(undefined);
    },
    onUpdated: new FakeEvent<
      (tabId: number, change: { status?: string }, tab: BrowserTab) => void
    >(),
    onRemoved: new FakeEvent<() => void>(),
  };

  readonly windows = {
    getLastFocused: () =>
      this.focusedWindow === undefined
        ? Promise.reject(new Error("no window"))
        : Promise.resolve({ id: this.focusedWindow }),
    update: () => Promise.resolve(undefined),
  };

  readonly scripting = {
    executeScript: (injection: {
      target: { tabId: number };
      files: string[];
    }) => {
      const tab = this.tabs_.find(
        (candidate) => candidate.id === injection.target.tabId,
      );
      this.injected.push(injection.target.tabId);
      if (tab === undefined || tab.blocked === true) {
        return Promise.reject(new Error("Cannot access contents of the page."));
      }
      tab.answers = true;
      return Promise.resolve([]);
    },
  };

  readonly alarms = {
    create: (
      name: string,
      info: { when?: number; periodInMinutes?: number },
    ) => {
      this.alarmsSet.set(name, info);
      return Promise.resolve();
    },
    get: (name: string): Promise<Alarm | undefined> => {
      if (
        this.broken.has("alarms.get") ||
        this.broken.has(`alarms.get:${name}`)
      ) {
        return Promise.reject(new Error("no alarms"));
      }
      return Promise.resolve(this.alarmsSet.has(name) ? { name } : undefined);
    },
    clear: (name: string) => Promise.resolve(this.alarmsSet.delete(name)),
    onAlarm: new FakeEvent<(alarm: Alarm) => void>(),
  };

  readonly action: ChromeApi["action"] & {
    setBadgeTextColor?:
      | ((details: { color: string }) => Promise<void>)
      | undefined;
  } = {
    setBadgeText: (details: { text: string }) => {
      this.badge.text = details.text;
      return this.broken.has("badge")
        ? Promise.reject(new Error("no badge"))
        : Promise.resolve();
    },
    setBadgeBackgroundColor: (details: { color: string }) => {
      this.badge.color = details.color;
      return Promise.resolve();
    },
    setTitle: (details: { title: string }) => {
      this.badge.title = details.title;
      return Promise.resolve();
    },
    setBadgeTextColor: (details: { color: string }) => {
      this.badge.textColor = details.color;
      return Promise.resolve();
    },
  };

  readonly commands = {
    onCommand: new FakeEvent<(command: string, tab?: BrowserTab) => void>(),
  };

  readonly i18n = {
    getMessage: (key: string, substitutions?: string | string[]) =>
      key === "locale"
        ? "en"
        : substitutions === undefined
          ? key
          : `${key}: ${String(substitutions)}`,
  };

  /** What the content script of an Autodarts tab answers, as `content.ts` does. */
  private answer(message: PageRequest): unknown {
    switch (message.action) {
      case "read":
        return { token: this.pageToken };
      case "write":
        this.pageToken = message.token;
        return { ok: true };
      case "clear":
        this.pageToken = null;
        return { ok: true };
      default:
        return { ok: true };
    }
  }

  /** Opens an Autodarts tab, or another page, in front of its window. */
  addTab(options: Partial<FakeTab> = {}): FakeTab {
    const tab: FakeTab = {
      id: this.nextTab,
      windowId: 1,
      active: true,
      url: PLAY,
      answers: true,
      lastAccessed: this.nextTab,
      ...options,
    };
    this.nextTab += 1;
    this.tabs_.push(tab);
    return tab;
  }

  /** The platform of the worker: the IndexedDB, the network and the clock of this browser. */
  platform(): Platform {
    return {
      indexedDB: this.idb,
      fetch: (url, init) =>
        this.broken.has("fetch")
          ? Promise.reject(new TypeError("Failed to fetch"))
          : this.autodarts.fetch(url, init),
      now: () => this.clock,
      wait: (ms) => {
        this.waits.push(ms);
        return Promise.resolve();
      },
      later: (ms, task) => {
        this.later.push({ ms, task });
      },
      log: (text) => {
        this.logs.push(text);
      },
    };
  }

  /** The store of the accounts, as the worker keeps them in this browser. */
  store() {
    return createStore(this.local, createVault(keyStoreIn(this.idb)));
  }

  /** Saves accounts as the worker would have before. */
  async seed(state: State): Promise<void> {
    await this.store().save(state);
  }

  /** Starts the service worker in this browser. */
  start(): StartedWorker {
    return startWorker(this, this.platform());
  }

  /**
   * Sends the worker a message, as a page of the extension or a content script does, and
   * answers whether it takes it and what it answers.
   */
  async send(
    message: unknown,
    sender: MessageSender = { id: EXTENSION_ID, url: POPUP },
  ): Promise<{ handled: boolean; reply: unknown }> {
    let respond: (reply: unknown) => void = () => {};
    const replied = new Promise<unknown>((resolve) => {
      respond = resolve;
    });
    const [handled] = this.runtime.onMessage.fire(message, sender, respond);
    return {
      handled: handled === true,
      reply: handled ? await replied : undefined,
    };
  }
}

/** Waits until a condition holds, while the work of the worker goes on in the background. */
export async function until(
  condition: () => boolean,
  what = "the condition",
): Promise<void> {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${what}.`);
}

/** Lets the work that the worker started in the background run for a moment. */
export function settle(ms = 40): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
