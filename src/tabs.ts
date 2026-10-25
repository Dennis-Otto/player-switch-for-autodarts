/**
 * The Autodarts tabs: which one a switch talks to, what happens to the others, and
 * what happens when none is open. The browser is passed in as a `TabsPort`: the
 * extension wires it to `chrome.tabs`, a test to a fake, so every path here runs
 * without a browser.
 *
 * Every Autodarts tab of the browser shares one `localStorage`, and with it one
 * refresh token. So a switch happens on the tab that the person is looking at, and
 * every other Autodarts tab reloads afterwards: a tab that went on running would keep
 * the account before in memory and, when it renews its session, spend a token of the
 * wrong account or write it over the new one.
 *
 * The extension finds the tabs through its access to the Autodarts sites, which lets
 * the browser filter tabs by their address; it needs no `tabs` permission, which
 * would let it read the address of every tab, the browsing history.
 *
 * Chrome runs the content script of the manifest only in pages that load after the
 * extension was installed or updated, and an update cuts the script of the version
 * before off from the extension. So a tab whose content script doesn't answer gets
 * `content.js` of this version, and the request once more, before the extension
 * gives up on it: a display that keeps Autodarts open for days still switches after
 * a silent update of the extension, without a reload. `content.js` runs once per
 * version of the extension in a page, so a tab that gets it twice answers once.
 */
import { PLAY_ORIGIN } from "./autodarts.ts";
import type { PagePort } from "./switch.ts";

/** Where a tab that the extension opens goes. */
export const PLAY_URL = `${PLAY_ORIGIN}/`;

/** How long to wait between two looks at a tab that is still loading. */
export const POLL_MS = 250;
/** How often to look for the content script of a tab that loads: 30 seconds. */
export const ANSWER_ATTEMPTS = 120;
/** How often to look for the page to renew the session it started with: 8 seconds. */
export const SETTLE_ATTEMPTS = 32;

/** What the extension needs to know of a tab; a `chrome.tabs.Tab` has it. */
export interface Tab {
  id?: number | undefined;
  windowId: number;
  /** Whether the tab is the one shown in its window. */
  active: boolean;
  /** When the tab was last shown in its window, in milliseconds since 1970. */
  lastAccessed?: number | undefined;
}

/** A tab that the browser can address. */
export type OpenTab = Tab & { id: number };

/** A request to the content script in an Autodarts tab. */
export type PageRequest =
  | { type: "page"; action: "read" }
  | { type: "page"; action: "write"; token: string }
  | { type: "page"; action: "clear" }
  | { type: "page"; action: "toggleSwitcher" };

/** The browser's tabs, as far as the extension uses them. */
export interface TabsPort {
  /** Every tab with Autodarts Play open, in every window. */
  query(): Promise<Tab[]>;
  /** The window the person used last, if the browser knows one. */
  focusedWindow(): Promise<number | undefined>;
  /** Sends a request to the content script of a tab; fails when none answers. */
  send(tabId: number, request: PageRequest): Promise<unknown>;
  /**
   * Runs `content.js` of this version in a tab; fails when the browser can't run a
   * script there, as in a tab that it discarded or that shows an error.
   */
  inject(tabId: number): Promise<void>;
  /** Loads a tab again. */
  reload(tabId: number): Promise<void>;
  /** Opens a new tab in the window used last, in front or behind the others. */
  open(url: string, active: boolean): Promise<Tab>;
  /** Shows a tab in its window and brings that window to the front. */
  focus(tab: OpenTab): Promise<void>;
  /** Waits; a test passes one that need not wait. */
  wait(ms: number): Promise<void>;
}

/** Thrown when no Autodarts tab has a content script that answers. */
export class NoPageError extends Error {
  constructor() {
    super("no Autodarts page");
    this.name = "NoPageError";
  }
}

/**
 * Orders the tabs by how likely the person looks at them: the tab shown in the
 * window used last, then the tabs shown in other windows, then the rest, each the
 * one shown most recently first. Tabs that can't be addressed are left out; tabs
 * alike keep the order of the browser.
 */
export function rankTabs(
  tabs: readonly Tab[],
  focusedWindow: number | undefined,
): OpenTab[] {
  const place = (tab: Tab): number => {
    if (!tab.active) {
      return 2;
    }
    return tab.windowId === focusedWindow ? 0 : 1;
  };
  return tabs
    .filter((tab): tab is OpenTab => typeof tab.id === "number")
    .toSorted(
      (a, b) =>
        place(a) - place(b) || (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0),
    );
}

async function ranked(tabs: TabsPort): Promise<OpenTab[]> {
  const [all, focused] = await Promise.all([
    tabs.query(),
    tabs.focusedWindow(),
  ]);
  return rankTabs(all, focused);
}

/**
 * Sends a request to the content script of one tab. When none answers there, as in a
 * tab that was open before the extension was installed or updated, it runs
 * `content.js` of this version in the tab and sends the request once more. Fails
 * when the tab doesn't answer even then.
 *
 * Sending the request again is safe: a request that found no content script reached
 * no page, and `content.js` answers a request before it reloads the page.
 */
export async function reach(
  tabs: TabsPort,
  tabId: number,
  request: PageRequest,
): Promise<unknown> {
  try {
    return await tabs.send(tabId, request);
  } catch {
    // No content script of this version answers in the tab: run one there.
  }
  await tabs.inject(tabId);
  return tabs.send(tabId, request);
}

/**
 * Runs `content.js` of this version in every open Autodarts tab, as after an install
 * or an update: the button comes back without a reload, and a running match goes on.
 * A tab that the browser discarded, or that still loads, gets the script when it
 * loads.
 */
export async function injectAll(tabs: TabsPort): Promise<void> {
  const open = (await tabs.query()).filter(
    (tab): tab is OpenTab => typeof tab.id === "number",
  );
  await Promise.all(
    open.map((tab) => tabs.inject(tab.id).catch(() => undefined)),
  );
}

/** The answer of a tab to a request, the tab that answered, and the other Autodarts tabs. */
interface Delivery {
  reply: unknown;
  tab: OpenTab;
  others: OpenTab[];
}

/**
 * Sends a request to the tab in front, or to the `preferred` one while it is open.
 * A tab whose content script doesn't answer gets the one of this version first, as
 * `reach` does; only when it doesn't answer even then, as a tab that the browser
 * discarded, the next tab gets the request.
 */
async function deliver(
  tabs: TabsPort,
  request: PageRequest,
  preferred: number | undefined,
): Promise<Delivery> {
  const all = await ranked(tabs);
  const candidates = [
    ...all.filter((tab) => tab.id === preferred),
    ...all.filter((tab) => tab.id !== preferred),
  ];
  for (const tab of candidates) {
    try {
      const reply = await reach(tabs, tab.id, request);
      return {
        reply,
        tab,
        others: candidates.filter((other) => other !== tab),
      };
    } catch {
      // Not even a content script of this version answers in this tab: try the next one.
    }
  }
  throw new NoPageError();
}

function tokenOf(reply: unknown): string | null {
  if (typeof reply !== "object" || reply === null) {
    return null;
  }
  const { token } = reply as { token?: unknown };
  return typeof token === "string" ? token : null;
}

/**
 * Changes the session in the page, which reloads the tab that does it, and reloads
 * every other Autodarts tab as well, so none goes on as the account before.
 *
 * The tabs reload one after another, each once the one before has renewed the
 * session it started with. Autodarts renews its session as it starts, and every tab
 * reads the same token from the shared `localStorage`: two tabs that started at the
 * same moment would both send that token, and Autodarts takes a token that comes a
 * second time for a stolen one and ends the session of its account.
 */
async function change(
  tabs: TabsPort,
  request: PageRequest,
  preferred: number | undefined,
): Promise<void> {
  const { tab, others } = await deliver(tabs, request, preferred);
  // The session is in the page already; a tab that doesn't come back fails no switch.
  await settle(tabs, tab.id).catch(() => undefined);
  for (const other of others) {
    try {
      await tabs.reload(other.id);
    } catch {
      // A tab that closed in the meantime needs no reload.
      continue;
    }
    await settle(tabs, other.id).catch(() => undefined);
  }
}

/**
 * The page of `switch.ts`, in the Autodarts tab in front, or in the `preferred` tab
 * while it is open, such as the one whose switcher the person tapped.
 */
export function createPage(tabs: TabsPort, preferred?: number): PagePort {
  return {
    async readToken() {
      const { reply } = await deliver(
        tabs,
        { type: "page", action: "read" },
        preferred,
      );
      return tokenOf(reply);
    },
    writeToken(token) {
      return change(tabs, { type: "page", action: "write", token }, preferred);
    },
    clearToken() {
      return change(tabs, { type: "page", action: "clear" }, preferred);
    },
  };
}

/**
 * What one tab answers to a read: its session, `null` for none, or `undefined` when
 * its content script doesn't answer.
 */
async function look(
  tabs: TabsPort,
  tabId: number,
): Promise<string | null | undefined> {
  try {
    return tokenOf(await tabs.send(tabId, { type: "page", action: "read" }));
  } catch {
    return undefined;
  }
}

/**
 * Shows Autodarts: the Autodarts tab in front comes to the front of its window. When
 * its content script doesn't answer, it gets the one of this version, and reloads
 * only when that doesn't answer either; with no Autodarts tab, a new one opens.
 */
export async function showPage(tabs: TabsPort): Promise<void> {
  const [tab] = await ranked(tabs);
  if (tab === undefined) {
    await tabs.open(PLAY_URL, true);
    return;
  }
  await tabs.focus(tab);
  try {
    await reach(tabs, tab.id, { type: "page", action: "read" });
  } catch {
    // Not even a content script of this version answers: a reload loads the page anew.
    await tabs.reload(tab.id);
  }
}

/**
 * Waits until a tab that loads can take a switch: until its content script answers,
 * and then until the page has renewed the session it started with. Autodarts renews
 * its session as it starts, which spends the token in `localStorage`; a switch that
 * parked that token before would park a spent one. When the page renews nothing,
 * the wait ends after `SETTLE_ATTEMPTS` looks.
 */
async function settle(tabs: TabsPort, tabId: number): Promise<void> {
  let start = await look(tabs, tabId);
  for (let attempt = 1; start === undefined; attempt += 1) {
    if (attempt === ANSWER_ATTEMPTS) {
      throw new NoPageError();
    }
    await tabs.wait(POLL_MS);
    start = await look(tabs, tabId);
  }
  if (start === null) {
    // No session in the page, so there is nothing that it could renew.
    return;
  }
  for (let attempt = 0; attempt < SETTLE_ATTEMPTS; attempt += 1) {
    await tabs.wait(POLL_MS);
    if ((await look(tabs, tabId)) !== start) {
      // Renewed, ended, or the tab went away, which the switch then finds.
      return;
    }
  }
}

/**
 * Waits until an Autodarts tab that just loaded has renewed the session it started
 * with, or until it has had time to: then its token can be read without racing the
 * page. A tab that doesn't answer ends the wait as well.
 */
export function settleTab(tabs: TabsPort, tabId: number): Promise<void> {
  return settle(tabs, tabId).catch(() => undefined);
}

/**
 * Makes an Autodarts tab answer when none does: reloads the tab in front, or, with
 * no Autodarts tab at all, opens one in the background, so that the popup stays open
 * and can show how the switch ended. Answers with the tab that it opened, if any.
 */
export async function preparePage(tabs: TabsPort): Promise<OpenTab | null> {
  const [front] = await ranked(tabs);
  if (front !== undefined) {
    await tabs.reload(front.id);
    await settle(tabs, front.id);
    return null;
  }
  const opened = await tabs.open(PLAY_URL, false);
  if (typeof opened.id !== "number") {
    throw new NoPageError();
  }
  const tab: OpenTab = { ...opened, id: opened.id };
  await settle(tabs, tab.id);
  return tab;
}

/**
 * Runs `task`, which talks to the page. When no Autodarts tab answers, it makes one
 * answer and runs the task once more: a tap needs no open Autodarts tab. A tab that
 * it opened comes to the front when `shows` says so of the result, such as of a
 * switch that worked; after one that failed, the popup stays open with the reason.
 *
 * Running the task again is safe: `switch.ts` reads the page before it spends a
 * token, and keeps every fresh token before it writes one into the page.
 */
export async function withPage<T>(
  tabs: TabsPort,
  task: () => Promise<T>,
  shows: (result: T) => boolean = () => true,
): Promise<T> {
  try {
    return await task();
  } catch (error) {
    if (!(error instanceof NoPageError)) {
      throw error;
    }
  }
  const opened = await preparePage(tabs);
  const result = await task();
  if (opened !== null && shows(result)) {
    // A tab closed in the meantime can't come to the front; the task worked all the same.
    await tabs.focus(opened).catch(() => undefined);
  }
  return result;
}
