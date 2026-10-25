import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { afterEach, test } from "node:test";
import { type Context, createContext, runInContext } from "node:vm";

import { SESSION_KEY } from "../src/autodarts.ts";
import type { PageButtonView } from "../src/messages.ts";

// The content script, run as Chrome runs it: a classic script, in a world of its own
// beside an Autodarts page (happy-dom), with a fake `chrome`. A second run in the same
// world is a second injection into the same tab, as after an update of the extension.
// A script with an import or an export would fail to run here at all.
const FILE = new URL("../src/content.ts", import.meta.url);
const SCRIPT = stripTypeScriptTypes(readFileSync(FILE, "utf8"));
const EXTENSION_ID = "extension-id";

/** A window of happy-dom: the DOM of a browser, which closes again after a test. */
type PageWindow = Window &
  typeof globalThis & { happyDOM: { close(): Promise<void> } };

// The types of happy-dom need a newer @types/node than the Node 24 of this project has,
// so the test takes its window as the DOM of the TypeScript lib, which happy-dom
// implements, and leaves the module out of the type check: a specifier that isn't a
// literal makes the compiler skip it.
const HAPPY_DOM: string = "happy-dom";
const { Window: HappyWindow } = (await import(HAPPY_DOM)) as {
  Window: new (options: {
    url: string;
    settings: { disableIframePageLoading: boolean };
  }) => PageWindow;
};

type Listener = (
  message: unknown,
  sender: { id?: string },
  sendResponse: (response: unknown) => void,
) => boolean;

/** The part of `chrome` that the content script uses, with what it sent and heard. */
class FakeChrome {
  readonly listeners: Listener[] = [];
  readonly sent: unknown[] = [];
  /** What the worker answers to "button", or an error to throw. */
  button: unknown = undefined;
  /** Whether the worker answers "activity" with a failure. */
  activityFails = false;
  readonly runtime = {
    id: EXTENSION_ID as string | undefined,
    getURL: (path: string) => `chrome-extension://${EXTENSION_ID}/${path}`,
    sendMessage: (message: { type: string }) => {
      // A copy from the world of the script, so that it compares as a plain object.
      this.sent.push(structuredClone(message));
      if (message.type === "button") {
        return this.button instanceof Error
          ? Promise.reject(this.button)
          : Promise.resolve(this.button);
      }
      return this.activityFails
        ? Promise.reject(new Error("no worker"))
        : Promise.resolve(undefined);
    },
    onMessage: {
      addListener: (listener: Listener) => {
        this.listeners.push(listener);
      },
    },
  };
  readonly i18n = {
    getMessage: (key: string, substitution?: string) =>
      substitution === undefined ? key : `${key}: ${substitution}`,
  };
}

const opened: PageWindow[] = [];

afterEach(async () => {
  for (const window of opened.splice(0)) {
    await window.happyDOM.close();
  }
});

interface PageOptions {
  url?: string;
  /** Whether the page has its body yet; without, the script waits for it. */
  body?: boolean;
  /** The answer of window.confirm. */
  confirms?: boolean;
}

/** An Autodarts page, the world of the content script beside it, and what happened there. */
function page({
  url = "https://play.autodarts.com/",
  body = true,
  confirms = false,
}: PageOptions = {}) {
  const window = new HappyWindow({
    url,
    settings: { disableIframePageLoading: true },
  });
  opened.push(window);
  const { document } = window;
  if (!body) {
    document.body.remove();
  }
  // The shadow roots are closed: the test keeps them as they are made.
  const roots: ShadowRoot[] = [];
  const attach = window.HTMLElement.prototype.attachShadow;
  window.HTMLElement.prototype.attachShadow = function (init) {
    const root = attach.call(this, init);
    roots.push(root as unknown as ShadowRoot);
    return root;
  };
  let fullscreen: Element | null = null;
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => fullscreen,
  });
  const chrome = new FakeChrome();
  const clock = { now: 1_000_000 };
  const reloads: string[] = [];
  const questions: string[] = [];
  const pageWindow = {
    localStorage: window.localStorage,
    location: {
      get pathname() {
        return window.location.pathname;
      },
      reload: () => reloads.push(window.location.pathname),
    },
    confirm: (question: string) => {
      questions.push(question);
      return confirms;
    },
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window),
  };
  const world: Context = createContext({
    window: pageWindow,
    document,
    location: window.location,
    HTMLElement: window.HTMLElement,
    chrome,
    Date: { now: () => clock.now },
  });
  return {
    window,
    document,
    chrome,
    clock,
    reloads,
    questions,
    world,
    roots,
    setFullscreen(element: Element | null) {
      fullscreen = element;
      document.dispatchEvent(new window.Event("fullscreenchange"));
    },
    run() {
      runInContext(SCRIPT, world, { filename: FILE.href });
    },
    /** Sends the content script a message, as the worker does, and answers what it says. */
    tell(message: unknown, sender: { id?: string } = { id: EXTENSION_ID }) {
      const answers: unknown[] = [];
      const results = chrome.listeners.map((listener) =>
        listener(message, sender, (response) =>
          answers.push(structuredClone(response)),
        ),
      );
      return { answers, results };
    },
    /** The button of the switcher in the shadow root of the newest script. */
    button(): HTMLButtonElement {
      const root = roots.at(-1);
      assert.ok(root, "the script made no shadow root");
      return root.querySelector("button") as HTMLButtonElement;
    },
    frame(): HTMLIFrameElement | null {
      return roots.at(-1)?.querySelector("iframe") ?? null;
    },
    host(): Element | null {
      return document.querySelector("player-switch-ui");
    },
  };
}

/** Lets the answers of the fake worker arrive. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

const VIEW: PageButtonView = {
  settings: { showButton: true, corner: "top-left" },
  player: { name: "Ada", picture: null, initial: "A" },
  reportActivity: false,
};

test("the content script runs as a classic script and touches the session under the key of autodarts.ts", () => {
  const tab = page();
  tab.run();
  tab.window.localStorage.setItem(SESSION_KEY, "token-a");

  assert.deepEqual(tab.tell({ type: "page", action: "read" }).answers, [
    { token: "token-a" },
  ]);
  assert.deepEqual(
    tab.tell({ type: "page", action: "write", token: "token-b" }).answers,
    [{ ok: true }],
  );
  assert.equal(tab.window.localStorage.getItem(SESSION_KEY), "token-b");
  assert.deepEqual(tab.tell({ type: "page", action: "clear" }).answers, [
    { ok: true },
  ]);
  assert.equal(tab.window.localStorage.getItem(SESSION_KEY), null);
  // Autodarts picks up a new session, or none, with a reload.
  assert.deepEqual(tab.reloads, ["/", "/"]);
});

test("the content script writes only a token into the session of the page", () => {
  const tab = page();
  tab.run();
  tab.window.localStorage.setItem(SESSION_KEY, "token-a");

  for (const token of ["", 42, undefined]) {
    const { answers, results } = tab.tell({
      type: "page",
      action: "write",
      token,
    });
    assert.deepEqual(answers, [{ ok: false }]);
    assert.deepEqual(results, [false]);
  }
  assert.equal(tab.window.localStorage.getItem(SESSION_KEY), "token-a");
  assert.deepEqual(tab.reloads, []);
});

test("the content script answers only requests of the page from its own extension", () => {
  const tab = page();
  tab.run();
  tab.window.localStorage.setItem(SESSION_KEY, "token-a");

  for (const [message, sender] of [
    [null, { id: EXTENSION_ID }],
    ["read", { id: EXTENSION_ID }],
    [{ type: "popup", action: "read" }, { id: EXTENSION_ID }],
    [{ type: "page", action: "read" }, { id: "another-extension" }],
    [{ type: "page", action: "read" }, {}],
    [{ type: "page", action: "unknown" }, { id: EXTENSION_ID }],
  ] as const) {
    const { answers, results } = tab.tell(message, sender);
    assert.deepEqual(answers, [], JSON.stringify(message));
    assert.deepEqual(results, [false]);
  }
});

test("the content script does nothing in a tab that went to another site", () => {
  const tab = page({ url: "https://example.com/" });
  tab.run();
  assert.equal(tab.chrome.listeners.length, 0);
  assert.equal(tab.host(), null);
});

test("a second run beside a script that still works leaves that one in charge", () => {
  const tab = page();
  tab.run();
  tab.run();
  assert.equal(tab.chrome.listeners.length, 1);
  assert.equal(tab.document.querySelectorAll("player-switch-ui").length, 1);
});

test("the script of a new version takes over from one that was cut off, without a reload", async () => {
  const tab = page();
  tab.chrome.button = VIEW;
  tab.run();
  await settle();
  tab.tell({ type: "page", action: "toggleSwitcher" });
  const content = tab.document.createElement("main");
  tab.document.body.prepend(content);
  // The page made inert by the old switcher: the old script marked what it did.
  content.inert = true;
  content.setAttribute("data-player-switch-inert", "");
  // The update cuts the old script off, and the new one runs in the same world.
  tab.chrome.runtime.id = undefined;
  tab.chrome.runtime.id = EXTENSION_ID;
  (tab.world as { playerSwitchAlive?: () => boolean }).playerSwitchAlive = () =>
    false;
  tab.run();
  await settle();

  assert.equal(tab.document.querySelectorAll("player-switch-ui").length, 1);
  assert.equal(content.inert, false);
  assert.equal(content.hasAttribute("data-player-switch-inert"), false);
  assert.equal(tab.reloads.length, 0);
});

test("the button shows the player in the corner that the settings say", async () => {
  const tab = page();
  tab.chrome.button = VIEW;
  tab.run();
  await settle();

  assert.deepEqual(tab.chrome.sent, [{ type: "button" }]);
  const button = tab.button();
  assert.equal(button.hidden, false);
  assert.equal(button.className, "button top-left");
  assert.equal(button.getAttribute("aria-label"), "switchButtonPlaying: Ada");
  assert.equal(button.title, "switchButtonPlaying: Ada");
  assert.equal(button.textContent, "A");
  assert.equal(button.getAttribute("aria-haspopup"), "dialog");
});

test("the button stays hidden while the worker has no view for it", async () => {
  for (const answer of [
    undefined,
    null,
    { settings: "none" },
    new Error("no worker"),
  ]) {
    const tab = page();
    tab.chrome.button = answer;
    tab.run();
    await settle();
    assert.equal(tab.button().hidden, true, String(answer));
  }
});

test("the button shows the picture of the player, the initial when it fails, and a symbol for nobody", async () => {
  const tab = page();
  tab.chrome.button = {
    ...VIEW,
    player: {
      name: "Ada",
      picture: "https://example.com/ada.png",
      initial: "A",
    },
  };
  tab.run();
  await settle();
  const image = tab.button().querySelector("img") as HTMLImageElement;
  assert.equal(image.src, "https://example.com/ada.png");
  assert.equal(image.alt, "");
  image.dispatchEvent(new tab.window.Event("error"));
  assert.equal(tab.button().querySelector("img"), null);
  assert.equal(tab.button().textContent, "A");

  tab.tell({
    type: "page",
    action: "button",
    view: {
      ...VIEW,
      settings: { showButton: false, corner: "bottom-left" },
      player: null,
    },
  });
  const button = tab.button();
  assert.equal(button.hidden, true);
  assert.equal(button.className, "button bottom-left");
  assert.equal(button.getAttribute("aria-label"), "switchButton");
  assert.ok(button.querySelector("svg path"));
});

test("a tap on the button lays the switcher over the page, which then takes no tap, and a second tap closes it", async () => {
  const tab = page();
  tab.chrome.button = VIEW;
  const before = tab.document.createElement("button");
  const asleep = tab.document.createElement("aside");
  asleep.inert = true;
  const drawing = tab.document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg",
  );
  tab.document.body.append(before, asleep, drawing);
  tab.run();
  await settle();
  before.focus();
  tab.button().click();

  const frame = tab.frame();
  assert.ok(frame);
  assert.equal(frame.src, `chrome-extension://${EXTENSION_ID}/switcher.html`);
  assert.equal(frame.title, "title");
  assert.equal(tab.button().getAttribute("aria-expanded"), "true");
  assert.equal(before.inert, true);
  assert.equal(before.hasAttribute("data-player-switch-inert"), true);
  // What was inert before stays so, and is not the switcher's to restore.
  assert.equal(asleep.hasAttribute("data-player-switch-inert"), false);
  frame.dispatchEvent(new tab.window.Event("load"));
  assert.equal(tab.document.activeElement, tab.host());
  // A second request to open it changes nothing.
  tab.tell({ type: "page", action: "toggleSwitcher" });
  tab.tell({ type: "page", action: "closeSwitcher" });
  assert.equal(tab.frame(), null);
  tab.tell({ type: "page", action: "toggleSwitcher" });
  assert.ok(tab.frame());

  tab.button().click();
  assert.equal(tab.frame(), null);
  assert.equal(tab.button().getAttribute("aria-expanded"), "false");
  assert.equal(before.inert, false);
  assert.equal(asleep.inert, true);
});

test("the focus goes back to where it was in the page, or else to the button", async () => {
  const tab = page();
  tab.chrome.button = VIEW;
  const field = tab.document.createElement("input");
  tab.document.body.append(field);
  tab.run();
  await settle();

  field.focus();
  tab.tell({ type: "page", action: "toggleSwitcher" });
  tab.tell({ type: "page", action: "closeSwitcher" });
  assert.equal(tab.document.activeElement, field);

  // The shortcut opened it with the focus nowhere in the page: back to the button.
  field.blur();
  tab.tell({ type: "page", action: "toggleSwitcher" });
  tab.tell({ type: "page", action: "closeSwitcher" });
  assert.equal(tab.document.activeElement, tab.host());

  // A control that went away in between takes no focus, and a hidden button neither.
  tab.tell({
    type: "page",
    action: "button",
    view: { ...VIEW, settings: { showButton: false, corner: "top-left" } },
  });
  field.focus();
  tab.tell({ type: "page", action: "toggleSwitcher" });
  field.remove();
  (tab.document.activeElement as HTMLElement | null)?.blur();
  tab.tell({ type: "page", action: "closeSwitcher" });
  assert.equal(tab.document.activeElement, tab.document.body);
  // Nothing to close.
  assert.deepEqual(
    tab.tell({ type: "page", action: "closeSwitcher" }).answers,
    [{ ok: true }],
  );
});

test("closing before anything opened changes nothing", () => {
  const tab = page({ body: false });
  tab.run();
  assert.deepEqual(
    tab.tell({ type: "page", action: "closeSwitcher" }).answers,
    [{ ok: true }],
  );
});

test("before the page has a body, the script waits for it, and the switcher opens only in a page", async () => {
  const tab = page({ body: false });
  tab.chrome.button = VIEW;
  tab.run();
  assert.deepEqual(tab.chrome.sent, []);
  // The shortcut before the page is there: nothing to lay the switcher over.
  tab.tell({ type: "page", action: "toggleSwitcher" });
  assert.equal(tab.frame(), null);

  tab.document.documentElement.append(tab.document.createElement("body"));
  tab.document.dispatchEvent(new tab.window.Event("DOMContentLoaded"));
  await settle();
  assert.deepEqual(tab.chrome.sent, [{ type: "button" }]);
  assert.equal(tab.host()?.parentNode, tab.document.body);
});

test("in fullscreen the button moves into the element that shows, and back after", async () => {
  const tab = page();
  tab.chrome.button = VIEW;
  tab.run();
  await settle();
  const board = tab.document.createElement("div");
  tab.document.body.append(board);

  tab.setFullscreen(board);
  assert.equal(tab.host()?.parentNode, board);
  tab.setFullscreen(tab.document.documentElement);
  assert.equal(tab.host()?.parentNode, tab.document.body);
  tab.setFullscreen(null);
  assert.equal(tab.host()?.parentNode, tab.document.body);
});

test("a script that an update cut off steps aside, and its button reloads the page", async () => {
  const tab = page();
  tab.chrome.button = VIEW;
  tab.run();
  await settle();
  const button = tab.button();
  tab.chrome.runtime.id = undefined;

  button.click();
  assert.equal(tab.host(), null);
  assert.deepEqual(tab.reloads, ["/"]);
  assert.deepEqual(tab.questions, []);
});

test("on a match page, the button of a cut-off script reloads only after a yes", async () => {
  for (const confirms of [false, true]) {
    const tab = page({
      url: "https://play.autodarts.com/matches/42",
      confirms,
    });
    tab.chrome.button = VIEW;
    tab.run();
    await settle();
    const button = tab.button();
    tab.chrome.runtime.id = undefined;

    button.click();
    assert.deepEqual(tab.questions, ["reloadAfterUpdate"]);
    assert.deepEqual(tab.reloads, confirms ? ["/matches/42"] : []);
  }
});

test("a cut-off script takes its button off the page when the page goes fullscreen", async () => {
  const tab = page();
  tab.chrome.button = VIEW;
  tab.run();
  await settle();
  tab.tell({ type: "page", action: "toggleSwitcher" });
  const other = tab.document.createElement("p");
  tab.document.body.append(other);
  tab.chrome.runtime.id = undefined;

  tab.setFullscreen(other);
  assert.equal(tab.host(), null);
  // The page that the switcher made inert works again.
  assert.equal(
    tab.document.querySelectorAll("[data-player-switch-inert]").length,
    0,
  );
  // Once retired, a change of fullscreen does nothing more.
  tab.setFullscreen(null);
  assert.equal(tab.host(), null);
});

test("while the venue mode asks for it, the page tells the worker of an input, at most every 15 seconds", async () => {
  const tab = page();
  tab.chrome.button = VIEW;
  tab.run();
  await settle();
  const input = (type: string) =>
    tab.window.dispatchEvent(new tab.window.Event(type));
  const activity = () =>
    tab.chrome.sent.filter(
      (message) => (message as { type: string }).type === "activity",
    ).length;

  // Not asked for: nothing goes to the worker.
  input("pointerdown");
  assert.equal(activity(), 0);

  tab.tell({
    type: "page",
    action: "button",
    view: { ...VIEW, reportActivity: true },
  });
  input("keydown");
  input("wheel");
  assert.equal(activity(), 1);
  tab.clock.now += 15_000;
  input("touchstart");
  assert.equal(activity(), 2);

  // A message the worker missed is sent again with the next input.
  tab.clock.now += 15_000;
  tab.chrome.activityFails = true;
  input("pointerdown");
  await settle();
  input("pointerdown");
  assert.equal(activity(), 4);

  // A script that an update cut off tells nothing more.
  tab.clock.now += 15_000;
  tab.chrome.runtime.id = undefined;
  input("pointerdown");
  assert.equal(activity(), 4);
});
