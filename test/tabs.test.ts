import assert from "node:assert/strict";
import { test } from "node:test";

import type { Identity } from "../src/autodarts.ts";
import { createQueue } from "../src/queue.ts";
import { EMPTY, find, park, setActive } from "../src/state.ts";
import { type Deps, signOutForNewAccount, switchTo } from "../src/switch.ts";
import {
  ANSWER_ATTEMPTS,
  createPage,
  NoPageError,
  type OpenTab,
  type PageRequest,
  PLAY_URL,
  POLL_MS,
  preparePage,
  rankTabs,
  SETTLE_ATTEMPTS,
  showPage,
  type Tab,
  type TabsPort,
  withPage,
} from "../src/tabs.ts";
import { FakeAutodarts, FakeStore } from "./helpers.ts";

const ada: Identity = { id: "a", username: "ada", name: "Ada", picture: null };
const bob: Identity = { id: "b", username: "bob", name: "Bob", picture: null };

/** A tab of the fake browser, with how its page is doing. */
interface FakeTab extends OpenTab {
  /** How many more requests find no content script, as while the tab loads. */
  silentFor: number;
  /** How many more answers until the page renews the session it started with. */
  renewsIn: number | null;
}

interface FakeTabOptions {
  windowId?: number;
  active?: boolean;
  lastAccessed?: number;
  silentFor?: number;
}

/**
 * A browser with Autodarts tabs that share one `localStorage`, as the tabs of one site
 * do. A tab that (re)loads finds no content script for a while, and its page renews
 * the session it starts with, as Autodarts does when it starts.
 */
class FakeBrowser implements TabsPort {
  /** The refresh token in the `localStorage` of Autodarts. */
  token: string | null;
  readonly tabs: FakeTab[] = [];
  focused: number | undefined = 1;
  /** What the extension did with the tabs, in order. */
  readonly log: string[] = [];
  waits = 0;
  /** How many requests a tab that (re)loads lets pass before its content script answers. */
  loadingFor = 1;
  /** How many answers a page that starts gives before it renews its session; null for never. */
  renewsAfter: number | null = 2;
  /** What the page does to renew its session. */
  renew: (token: string) => Promise<string | null> = (token) =>
    Promise.resolve(`${token}+`);
  /** Tabs that close as soon as they would reload. */
  readonly closing = new Set<number>();
  /** Whether a tab that opens has an id. */
  opensWithId = true;
  private nextId = 100;

  constructor(token: string | null = null) {
    this.token = token;
  }

  add(id: number, options: FakeTabOptions = {}): this {
    this.tabs.push({
      id,
      windowId: options.windowId ?? 1,
      active: options.active ?? false,
      lastAccessed: options.lastAccessed,
      silentFor: options.silentFor ?? 0,
      renewsIn: null,
    });
    return this;
  }

  query(): Promise<Tab[]> {
    return Promise.resolve(
      this.tabs.map(({ id, windowId, active, lastAccessed }) => ({
        id,
        windowId,
        active,
        lastAccessed,
      })),
    );
  }

  focusedWindow(): Promise<number | undefined> {
    return Promise.resolve(this.focused);
  }

  async send(tabId: number, request: PageRequest): Promise<unknown> {
    const tab = this.tabs.find((candidate) => candidate.id === tabId);
    if (tab === undefined || tab.silentFor > 0) {
      if (tab !== undefined) {
        tab.silentFor -= 1;
      }
      throw new Error(
        "Could not establish connection. Receiving end does not exist.",
      );
    }
    await this.starting(tab);
    this.log.push(`${request.action} ${tabId}`);
    switch (request.action) {
      case "read":
        return { token: this.token };
      case "write":
        this.token = request.token;
        return { ok: true };
      case "clear":
        this.token = null;
        return { ok: true };
    }
  }

  /** Lets a page that starts renew its session after a few answers. */
  private async starting(tab: FakeTab): Promise<void> {
    if (tab.renewsIn === null) {
      return;
    }
    tab.renewsIn -= 1;
    if (tab.renewsIn > 0) {
      return;
    }
    tab.renewsIn = null;
    if (this.token !== null) {
      this.token = await this.renew(this.token);
    }
  }

  reload(tabId: number): Promise<void> {
    this.log.push(`reload ${tabId}`);
    const tab = this.tabs.find((candidate) => candidate.id === tabId);
    if (tab === undefined || this.closing.has(tabId)) {
      return Promise.reject(new Error(`No tab with id: ${tabId}.`));
    }
    this.load(tab);
    return Promise.resolve();
  }

  open(url: string, active: boolean): Promise<Tab> {
    this.log.push(`open ${url} ${active ? "in front" : "behind"}`);
    const tab: FakeTab = {
      id: this.nextId,
      windowId: this.focused ?? 1,
      active,
      silentFor: 0,
      renewsIn: null,
    };
    this.nextId += 1;
    this.load(tab);
    this.tabs.push(tab);
    const { id, windowId } = tab;
    return Promise.resolve(
      this.opensWithId ? { id, windowId, active } : { windowId, active },
    );
  }

  focus(tab: OpenTab): Promise<void> {
    this.log.push(`focus ${tab.id}`);
    return Promise.resolve();
  }

  wait(ms: number): Promise<void> {
    assert.equal(ms, POLL_MS);
    this.waits += 1;
    return Promise.resolve();
  }

  private load(tab: FakeTab): void {
    tab.silentFor = this.loadingFor;
    tab.renewsIn = this.renewsAfter;
  }
}

test("the tab shown in the window used last comes first, wherever the browser lists it", () => {
  const tabs: Tab[] = [
    { id: 1, windowId: 1, active: false, lastAccessed: 900 },
    { id: 2, windowId: 2, active: true, lastAccessed: 100 },
    { id: 3, windowId: 1, active: true, lastAccessed: 50 },
  ];
  assert.deepEqual(
    rankTabs(tabs, 1).map((tab) => tab.id),
    [3, 2, 1],
  );
});

test("without a window used last, the tabs shown in their windows still come first", () => {
  const tabs: Tab[] = [
    { id: 1, windowId: 1, active: false, lastAccessed: 900 },
    { id: 2, windowId: 2, active: true, lastAccessed: 100 },
    { id: 3, windowId: 1, active: true, lastAccessed: 200 },
  ];
  assert.deepEqual(
    rankTabs(tabs, undefined).map((tab) => tab.id),
    [3, 2, 1],
  );
});

test("among the hidden tabs, the one shown most recently comes first", () => {
  const tabs: Tab[] = [
    { id: 1, windowId: 1, active: false, lastAccessed: 100 },
    { id: 2, windowId: 1, active: false },
    { id: 3, windowId: 1, active: false, lastAccessed: 300 },
    { id: 4, windowId: 1, active: false },
  ];
  // Tabs that the browser gives no time keep its order, after the others.
  assert.deepEqual(
    rankTabs(tabs, 1).map((tab) => tab.id),
    [3, 1, 2, 4],
  );
});

test("a tab without an id is left out, as the browser can't address it", () => {
  const tabs: Tab[] = [
    { windowId: 1, active: true },
    { id: 2, windowId: 1, active: false },
  ];
  assert.deepEqual(rankTabs(tabs, 1), [{ id: 2, windowId: 1, active: false }]);
  assert.deepEqual(rankTabs([], 1), []);
});

test("the page reads the session from the tab in front, not the first one listed", async () => {
  const browser = new FakeBrowser("t").add(1).add(2, { active: true });
  assert.equal(await createPage(browser).readToken(), "t");
  assert.deepEqual(browser.log, ["read 2"]);
});

test("when the tab in front has no content script that answers, the next one takes the request", async () => {
  const browser = new FakeBrowser("t")
    .add(1)
    .add(2, { active: true, silentFor: 1 });
  assert.equal(await createPage(browser).readToken(), "t");
  assert.deepEqual(browser.log, ["read 1"]);
});

test("the page fails with NoPageError when no tab answers, or none is open", async () => {
  const silent = new FakeBrowser("t")
    .add(1, { silentFor: 5 })
    .add(2, { silentFor: 5 });
  await assert.rejects(createPage(silent).readToken(), NoPageError);
  await assert.rejects(
    createPage(new FakeBrowser("t")).writeToken("n"),
    NoPageError,
  );
  await assert.rejects(
    createPage(new FakeBrowser("t")).clearToken(),
    NoPageError,
  );
});

test("the page reads no session from an answer without a token", async () => {
  const answers: unknown[] = [undefined, null, "t", { token: 7 }, {}];
  for (const answer of answers) {
    const browser = new FakeBrowser().add(1, { active: true });
    browser.send = () => Promise.resolve(answer);
    assert.equal(await createPage(browser).readToken(), null);
  }
});

test("a new session goes into the tab in front, and every other Autodarts tab reloads", async () => {
  const browser = new FakeBrowser("old")
    .add(1, { lastAccessed: 10 })
    .add(2, { windowId: 2, active: true })
    .add(3, { active: true });
  await createPage(browser).writeToken("new");
  assert.equal(browser.token, "new");
  assert.deepEqual(browser.log, ["write 3", "reload 2", "reload 1"]);
});

test("a sign-out clears the session in the tab in front and reloads the others", async () => {
  const browser = new FakeBrowser("old").add(1, { active: true }).add(2);
  await createPage(browser).clearToken();
  assert.equal(browser.token, null);
  assert.deepEqual(browser.log, ["clear 1", "reload 2"]);
});

test("a tab that closed before its reload doesn't fail the switch", async () => {
  const browser = new FakeBrowser("old").add(1, { active: true }).add(2).add(3);
  browser.closing.add(2);
  await createPage(browser).writeToken("new");
  assert.deepEqual(browser.log, ["write 1", "reload 2", "reload 3"]);
});

test("a write that reaches only a later tab still reloads the one in front", async () => {
  // As after an update of the extension: the tab in front runs the content script of the
  // version before, which no longer answers, and a reload gives it the new one.
  const browser = new FakeBrowser("old")
    .add(1, { active: true, silentFor: 1 })
    .add(2);
  await createPage(browser).writeToken("new");
  assert.deepEqual(browser.log, ["write 2", "reload 1"]);
});

test("Open Autodarts opens a tab in front when none is open", async () => {
  const browser = new FakeBrowser();
  await showPage(browser);
  assert.deepEqual(browser.log, [`open ${PLAY_URL} in front`]);
});

test("Open Autodarts brings the tab in front forward and leaves a tab that answers as it is", async () => {
  const browser = new FakeBrowser("t")
    .add(1)
    .add(2, { windowId: 2, active: true });
  await showPage(browser);
  assert.deepEqual(browser.log, ["focus 2", "read 2"]);
});

test("Open Autodarts reloads a tab whose content script doesn't answer", async () => {
  const browser = new FakeBrowser("t").add(1, { active: true, silentFor: 1 });
  await showPage(browser);
  assert.deepEqual(browser.log, ["focus 1", "reload 1"]);
});

test("with no tab open, a tab opens behind the popup and the task runs once it answers", async () => {
  const browser = new FakeBrowser(null);
  browser.loadingFor = 3;
  const page = createPage(browser);
  const token = await withPage(browser, () => page.readToken());
  assert.equal(token, null);
  assert.deepEqual(browser.log, [
    `open ${PLAY_URL} behind`,
    "read 100",
    "read 100",
    "focus 100",
  ]);
  // Three looks found no content script yet, and no session meant nothing to wait for.
  assert.equal(browser.waits, 3);
});

test("a page that starts renews its session before the task reads it", async () => {
  const browser = new FakeBrowser("t");
  browser.loadingFor = 0;
  browser.renewsAfter = 3;
  const page = createPage(browser);
  assert.equal(await withPage(browser, () => page.readToken()), "t+");
  // The page answered "t" twice and renewed it at the third look.
  assert.deepEqual(browser.log, [
    `open ${PLAY_URL} behind`,
    "read 100",
    "read 100",
    "read 100",
    "read 100",
    "focus 100",
  ]);
  assert.equal(browser.waits, 2);
});

test("a page that renews nothing is waited for a few seconds at most", async () => {
  const browser = new FakeBrowser("t");
  browser.loadingFor = 0;
  browser.renewsAfter = null;
  assert.equal(await preparePage(browser).then((tab) => tab?.id), 100);
  assert.equal(browser.waits, SETTLE_ATTEMPTS);
});

test("a page that ends its session as it starts needs no more waiting", async () => {
  const browser = new FakeBrowser("dead");
  browser.loadingFor = 0;
  browser.renew = () => Promise.resolve(null);
  await preparePage(browser);
  assert.equal(browser.token, null);
  assert.equal(browser.waits, 1);
});

test("a tab that never answers ends in NoPageError", async () => {
  const browser = new FakeBrowser("t");
  browser.loadingFor = ANSWER_ATTEMPTS;
  await assert.rejects(preparePage(browser), NoPageError);
  assert.equal(browser.waits, ANSWER_ATTEMPTS - 1);
});

test("a tab that opens without an id ends in NoPageError", async () => {
  const browser = new FakeBrowser("t");
  browser.opensWithId = false;
  await assert.rejects(preparePage(browser), NoPageError);
});

test("open tabs that don't answer: the one in front reloads, and no new tab opens", async () => {
  // As after an update of the extension: no tab answers until a reload gives it the
  // content script of the new version.
  const browser = new FakeBrowser(null)
    .add(1, { silentFor: 9 })
    .add(2, { active: true, silentFor: 9 });
  const page = createPage(browser);
  assert.equal(await withPage(browser, () => page.readToken()), null);
  assert.deepEqual(browser.log, ["reload 2", "read 2", "read 2"]);
  assert.equal(browser.tabs.length, 2);
});

test("a tab that was opened stays behind when the task says its result isn't worth showing", async () => {
  const browser = new FakeBrowser(null);
  const page = createPage(browser);
  const result = await withPage(
    browser,
    async () => ({ ok: false, token: await page.readToken() }),
    (outcome) => outcome.ok,
  );
  assert.deepEqual(result, { ok: false, token: null });
  assert.ok(!browser.log.some((entry) => entry.startsWith("focus")));
});

test("a tab that closes before it can come to the front doesn't fail the task", async () => {
  const browser = new FakeBrowser(null);
  browser.focus = () => Promise.reject(new Error("No tab with id: 100."));
  const page = createPage(browser);
  assert.equal(await withPage(browser, () => page.readToken()), null);
});

test("a task that works the first time opens nothing", async () => {
  const browser = new FakeBrowser("t").add(1, { active: true });
  const page = createPage(browser);
  assert.equal(await withPage(browser, () => page.readToken()), "t");
  assert.deepEqual(browser.log, ["read 1"]);
});

test("a task that fails for another reason fails as it is, and opens nothing", async () => {
  const browser = new FakeBrowser();
  await assert.rejects(
    withPage(browser, () => Promise.reject(new Error("offline"))),
    /offline/,
  );
  assert.deepEqual(browser.log, []);
});

/** A fake browser whose Autodarts page renews its session at a fake Autodarts. */
function withAutodarts(
  autodarts: FakeAutodarts,
  token: string | null,
): FakeBrowser {
  const browser = new FakeBrowser(token);
  browser.renew = async (current) => {
    const response = await autodarts.fetch(
      "https://api.autodarts.com/auth/v1/refresh",
      {
        method: "POST",
        body: JSON.stringify({ refresh_token: current }),
      },
    );
    if (!response.ok) {
      return null;
    }
    return ((await response.json()) as { refresh_token: string }).refresh_token;
  };
  return browser;
}

function deps(
  store: FakeStore,
  browser: FakeBrowser,
  autodarts: FakeAutodarts,
): Deps {
  return {
    store,
    page: createPage(browser),
    fetcher: autodarts.fetch,
    now: () => 1000,
    queue: createQueue(),
  };
}

test("with two windows, a switch happens on the tab in front and the other tab reloads", async () => {
  const autodarts = new FakeAutodarts();
  const browser = withAutodarts(autodarts, autodarts.issue("a"))
    .add(1, { windowId: 2, active: true })
    .add(2, { windowId: 1, active: true });
  const store = new FakeStore(
    setActive(park(EMPTY, bob, autodarts.issue("b"), 0), ada),
  );
  const result = await switchTo(deps(store, browser, autodarts), "b");
  assert.ok(result.ok);
  assert.equal(browser.token, autodarts.live.get("b"));
  assert.deepEqual(browser.log, ["read 2", "write 2", "reload 1"]);
  assert.equal(store.state.activeId, "b");
});

test("a tap with no Autodarts tab open opens one, switches there and keeps the player before", async () => {
  const autodarts = new FakeAutodarts();
  // Ada played last: her session is in the storage of Autodarts, with no tab open.
  const browser = withAutodarts(autodarts, autodarts.issue("a"));
  const store = new FakeStore(
    setActive(park(EMPTY, bob, autodarts.issue("b"), 0), ada),
  );
  const run = deps(store, browser, autodarts);

  const result = await withPage(
    browser,
    () => switchTo(run, "b"),
    (outcome) => outcome.ok,
  );
  assert.ok(result.ok);
  assert.equal(store.state.activeId, "b");
  assert.equal(browser.token, autodarts.live.get("b"));
  assert.equal(browser.log.at(-1), "focus 100");
  // Ada's session was parked after the page had renewed it as it started, not before:
  // the token the extension keeps for her is the one that works.
  assert.equal(find(store.state, "a")?.token, autodarts.live.get("a"));

  const back = await switchTo(run, "a");
  assert.ok(back.ok);
  assert.equal(autodarts.reuses, 0);
});

test("a tap that can't switch leaves the tab it opened behind the popup", async () => {
  const autodarts = new FakeAutodarts();
  const browser = withAutodarts(autodarts, null);
  // Bob's parked token is dead and he has no remembered password.
  const store = new FakeStore(park(EMPTY, bob, "dead", 0));
  const result = await withPage(
    browser,
    () => switchTo(deps(store, browser, autodarts), "b"),
    (outcome) => outcome.ok,
  );
  assert.deepEqual([result.ok, result.reason], [false, "signin"]);
  assert.ok(!browser.log.some((entry) => entry.startsWith("focus")));
});

test("Add account with no tab open opens Autodarts and shows it signed out", async () => {
  const autodarts = new FakeAutodarts();
  const browser = withAutodarts(autodarts, autodarts.issue("a"));
  const store = new FakeStore(setActive(EMPTY, ada));
  await withPage(browser, () =>
    signOutForNewAccount(deps(store, browser, autodarts)),
  );
  assert.equal(browser.token, null);
  assert.equal(browser.log.at(-1), "focus 100");
  assert.equal(find(store.state, "a")?.token, autodarts.live.get("a"));
});
