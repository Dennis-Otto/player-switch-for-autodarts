/**
 * The fixtures of the end-to-end tests: a real Chromium with the built extension
 * loaded from `extension/`, as `chrome://extensions` loads it unpacked, against a
 * fake Autodarts. Every test gets a browser profile of its own, so each starts from
 * a fresh install.
 *
 * Nothing leaves this computer: `--host-resolver-rules` maps play.autodarts.com and
 * api.autodarts.com to the fake server of `fake/server.ts`, on 127.0.0.1, and
 * resolves no other host at all. The mapping holds for every request of the
 * browser, the page's, the service worker's and that of a tab which the extension
 * opens. A request that the fake has no answer for fails the test, and so do a
 * refresh token that reaches the fake sign-in service a second time and an error in
 * the console of the service worker.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type BrowserContext,
  test as base,
  chromium,
  expect,
  type Locator,
  type Page,
  type Worker,
} from "@playwright/test";
import { type Account, FakeAutodarts } from "./fake/autodarts.ts";
import {
  AUTH_HOST,
  type FakeServer,
  PLAY_HOST,
  startFakeServer,
} from "./fake/server.ts";

export { ALICE, BOB, CAROL } from "./fake/autodarts.ts";
export { expect };

const EXTENSION = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../extension",
);
const PLAY = `https://${PLAY_HOST}`;

export type Language = "en" | "de";

interface Message {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

/** The texts of the extension in one language, from `extension/_locales/`. */
function messagesOf(language: Language): Record<string, Message> {
  return JSON.parse(
    readFileSync(
      path.join(EXTENSION, "_locales", language, "messages.json"),
      "utf8",
    ),
  );
}

/** A text of the extension, with its placeholders filled in as chrome.i18n does. */
export type Translate = (key: string, ...substitutions: string[]) => string;

function translator(language: Language): Translate {
  const messages = messagesOf(language);
  return (key, ...substitutions) => {
    const entry = messages[key];
    if (entry === undefined) {
      throw new Error(
        `extension/_locales/${language}/messages.json has no message "${key}"`,
      );
    }
    let text = entry.message;
    for (const [name, { content }] of Object.entries(
      entry.placeholders ?? {},
    )) {
      const filled = content.replace(
        /\$(\d)/g,
        (_, index: string) => substitutions[Number(index) - 1] ?? "",
      );
      text = text.replaceAll(new RegExp(`\\$${name}\\$`, "gi"), filled);
    }
    return text;
  };
}

/** The toolbar popup, opened in a tab of its own: popup.html as the toolbar shows it. */
export class Popup {
  readonly page: Page;
  private readonly t: Translate;

  constructor(page: Page, t: Translate) {
    this.page = page;
    this.t = t;
  }

  /** The tile of an account, by the name it shows. */
  tile(account: Account): Locator {
    return this.page.locator("#profiles .profile").filter({
      has: this.page.locator(".name", {
        hasText: new RegExp(`^${account.name}$`),
      }),
    });
  }

  /**
   * Waits until the popup has its answer from the service worker. A request that has
   * to open Autodarts first waits for the page to start, so it may take longer.
   */
  async ready(timeout?: number): Promise<void> {
    await expect(this.page.locator("#profiles")).not.toHaveAttribute(
      "aria-busy",
      "true",
      timeout === undefined ? {} : { timeout },
    );
  }

  /** Taps the tile of an account and waits until the service worker has answered. */
  async tap(account: Account, timeout?: number): Promise<void> {
    await this.tile(account).locator(".tile").click();
    await this.ready(timeout);
  }

  /** Expects the tiles of these accounts, in this order, with the one playing marked. */
  async expectAccounts(
    accounts: readonly Account[],
    playing: Account | null,
  ): Promise<void> {
    await expect(this.page.locator("#profiles .profile .name")).toHaveText(
      accounts.map((account) => account.name),
    );
    const active = this.page.locator("#profiles .profile.active .name");
    if (playing === null) {
      await expect(active).toHaveCount(0);
    } else {
      await expect(active).toHaveText(playing.name);
      await expect(this.tile(playing).locator(".chip")).toHaveText(
        this.t("playing"),
      );
    }
  }

  /**
   * Expects the popup to say this: an error in its alert, which a screen reader
   * reads out at once, anything else in its status line; the other one stays empty.
   */
  async expectStatus(text: string, error = false): Promise<void> {
    const [shown, empty] = error
      ? (["alert", "status"] as const)
      : (["status", "alert"] as const);
    await expect(this.page.getByRole(shown)).toHaveText(text);
    await expect(this.page.getByRole(empty)).toHaveText("");
  }

  /** Opens the popup anew, as a second click on the toolbar button does. */
  async reopen(): Promise<void> {
    await this.page.reload();
    await this.ready();
  }

  /** Turns "Manage accounts" on or off. */
  async manage(): Promise<void> {
    await this.page.locator("#manage").click();
  }
}

/** The display: the browser with the extension, its Autodarts tabs and its popup. */
export class Display {
  readonly context: BrowserContext;
  readonly worker: Worker;
  readonly extensionId: string;
  /** The texts of the extension in the language of the browser. */
  readonly t: Translate;

  constructor(
    context: BrowserContext,
    worker: Worker,
    extensionId: string,
    t: Translate,
  ) {
    this.context = context;
    this.worker = worker;
    this.extensionId = extensionId;
    this.t = t;
  }

  /** Opens Autodarts Play in a new tab and waits until the page has started. */
  async openAutodarts(address = "/"): Promise<Page> {
    const page = await this.context.newPage();
    await page.goto(new URL(address, PLAY).href);
    await expect(page.locator("body")).not.toHaveAttribute(
      "data-state",
      "starting",
    );
    return page;
  }

  /**
   * The Autodarts tab that the extension opened, such as for a tap with no Autodarts
   * tab, once its page has started.
   */
  async openedAutodarts(): Promise<Page> {
    let opened: Page | undefined;
    await expect
      .poll(
        () => {
          opened = this.context
            .pages()
            .find((page) => page.url().startsWith(`${PLAY}/`));
          return opened !== undefined;
        },
        { message: "an Autodarts tab that the extension opened" },
      )
      .toBe(true);
    const page = opened as Page;
    await expect(page.locator("body")).not.toHaveAttribute(
      "data-state",
      "starting",
    );
    return page;
  }

  /** Signs an account in on an Autodarts page, as the player does there. */
  async signIn(page: Page, account: Account): Promise<void> {
    await expect(page.locator("#sign-in")).toBeVisible();
    await page.locator("#sign-in [name=username]").fill(account.username);
    await page.locator("#sign-in [name=password]").fill(account.password);
    await page.locator("#sign-in button[type=submit]").click();
    await expectPlayer(page, account);
  }

  /** Opens the toolbar popup in a new tab. */
  async popup(): Promise<Popup> {
    const page = await this.context.newPage();
    await page.goto(`chrome-extension://${this.extensionId}/popup.html`);
    const popup = new Popup(page, this.t);
    await popup.ready();
    return popup;
  }

  /**
   * Saves the accounts on the display, one after another, the way a new display
   * does it: the first one by itself after the install, every other one with
   * "Add account" and a sign-in. The last one plays.
   */
  async saveAccounts(page: Page, accounts: readonly Account[]): Promise<Popup> {
    const popup = await this.popup();
    for (const [index, account] of accounts.entries()) {
      if (index > 0) {
        await popup.page.locator("#add").click();
        await popup.ready();
        await expect(page.locator("#sign-in")).toBeVisible();
      }
      await this.signIn(page, account);
      await popup.reopen();
      await popup.expectAccounts(accounts.slice(0, index + 1), account);
    }
    return popup;
  }

  /** What the extension keeps in chrome.storage.local, as the service worker reads it. */
  stored(): Promise<Record<string, unknown>> {
    return this.worker.evaluate(() => chrome.storage.local.get(null));
  }
}

/** Expects an Autodarts page to have started, signed in as this account or as nobody. */
export async function expectPlayer(
  page: Page,
  account: Account | null,
): Promise<void> {
  await expect(page.locator("body")).toHaveAttribute(
    "data-state",
    account === null ? "signed-out" : "signed-in",
  );
  await expect(page.locator("#who")).toHaveText(account?.name ?? "");
}

interface Options {
  /** The language of the browser, which chrome.i18n gives the extension. */
  language: Language;
}

interface Fixtures {
  autodarts: FakeAutodarts;
  /** The fake Autodarts on the network. */
  server: FakeServer;
  /** The requests of the browser that failed for a host that the tests don't serve. */
  strayRequests: string[];
  /** The errors in the console of the service worker. */
  workerErrors: string[];
  context: BrowserContext;
  display: Display;
}

export const test = base.extend<Options & Fixtures>({
  language: ["en", { option: true }],

  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures that a fixture needs from its first argument.
  autodarts: async ({}, use) => {
    const autodarts = new FakeAutodarts();
    await use(autodarts);
    expect(
      autodarts.reused,
      "refresh tokens that reached Autodarts a second time",
    ).toEqual([]);
  },

  server: async ({ autodarts }, use) => {
    const server = await startFakeServer(autodarts);
    await use(server);
    await server.close();
    expect(
      server.stray,
      "requests that the fake Autodarts has no answer for",
    ).toEqual([]);
  },

  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures that a fixture needs from its first argument.
  strayRequests: async ({}, use) => {
    const stray: string[] = [];
    await use(stray);
    expect(stray, "requests to a host that the tests don't serve").toEqual([]);
  },

  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures that a fixture needs from its first argument.
  workerErrors: async ({}, use) => {
    const errors: string[] = [];
    await use(errors);
    expect(errors, "errors in the console of the service worker").toEqual([]);
  },

  context: async (
    { server, strayRequests, headless, language, colorScheme },
    use,
  ) => {
    const context = await chromium.launchPersistentContext("", {
      // Playwright's own Chromium: Google Chrome no longer loads an unpacked
      // extension from the command line since version 137.
      channel: "chromium",
      headless,
      colorScheme,
      locale: language,
      viewport: { width: 1280, height: 800 },
      // chrome.i18n follows the language of the browser: --lang on Windows and
      // macOS, LANGUAGE on Linux.
      env: { ...process.env, LANGUAGE: language },
      args: [
        `--disable-extensions-except=${EXTENSION}`,
        `--load-extension=${EXTENSION}`,
        `--lang=${language}`,
        // The two hosts of Autodarts go to the fake server, and no other host
        // resolves, so nothing can reach the real Autodarts or anywhere else.
        `--host-resolver-rules=MAP ${PLAY_HOST} 127.0.0.1:${server.port}, MAP ${AUTH_HOST} 127.0.0.1:${server.port}, MAP * ~NOTFOUND`,
        // The certificate of the fake server, and no other, passes without a CA.
        `--ignore-certificate-errors-spki-list=${server.spki}`,
      ],
    });
    context.on("requestfailed", (request) => {
      const url = new URL(request.url());
      if (
        url.protocol !== "chrome-extension:" &&
        url.hostname !== PLAY_HOST &&
        url.hostname !== AUTH_HOST
      ) {
        strayRequests.push(request.url());
      }
    });
    await use(context);
    await context.close();
  },

  display: async ({ context, language, workerErrors }, use) => {
    const worker = await startedWorker(context);
    worker.on("console", (message) => {
      if (message.type() === "error") {
        workerErrors.push(message.text());
      }
    });
    const extensionId = new URL(worker.url()).host;
    await use(new Display(context, worker, extensionId, translator(language)));
  },
});

/**
 * The service worker of the extension, once its script has run: it has loaded every
 * module of lib/ and set its listeners. Chrome starts no worker for a manifest that
 * it refuses, and stops one whose script throws, such as for a wrong import path or
 * a permission that the manifest lacks.
 */
async function startedWorker(context: BrowserContext): Promise<Worker> {
  const isBackground = (candidate: Worker) =>
    candidate.url().endsWith("/background.js");
  const worker =
    context.serviceWorkers().find(isBackground) ??
    (await context
      .waitForEvent("serviceworker", {
        predicate: isBackground,
        timeout: 10_000,
      })
      .catch(() => null));
  const listening =
    worker !== null &&
    (await expect
      .poll(
        () =>
          worker
            .evaluate(() => chrome.runtime.onMessage.hasListeners())
            .catch(() => false),
        {
          timeout: 10_000,
        },
      )
      .toBe(true)
      .then(
        () => true,
        () => false,
      ));
  if (worker === null || !listening) {
    throw new Error(
      "The service worker of the extension didn't start: Chrome refused the manifest, or background.js " +
        "or a module it imports failed. Load extension/ in chrome://extensions to see the error.",
    );
  }
  return worker;
}
