/**
 * The display of the Firefox tests: a real Firefox with the built extension installed
 * from `extension/` as a temporary add-on, as `about:debugging` installs it, against
 * the fake Autodarts of the end-to-end tests (`test/e2e/fake/`). Puppeteer drives
 * Firefox over WebDriver BiDi, which also installs the add-on; Playwright can't load
 * an add-on into Firefox.
 *
 * Nothing leaves this computer: Firefox sends every request through a proxy of the
 * test, which tunnels play.autodarts.com and api.autodarts.com to the fake server on
 * 127.0.0.1 and refuses every other host. A request that the fake has no answer for
 * fails the test, and so does a refresh token that reaches the fake sign-in service a
 * second time.
 */
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { type AddressInfo, connect, type Socket } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { type Account, FakeAutodarts } from "../e2e/fake/autodarts.ts";
import {
  AUTH_HOST,
  type FakeServer,
  PLAY_HOST,
  startFakeServer,
} from "../e2e/fake/server.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EXTENSION = path.join(ROOT, "extension");
const PLAY = `https://${PLAY_HOST}`;

/** The id of the add-on, which the manifest fixes for Firefox. */
const ADDON_ID = (
  JSON.parse(readFileSync(path.join(EXTENSION, "manifest.json"), "utf8")) as {
    browser_specific_settings: { gecko: { id: string } };
  }
).browser_specific_settings.gecko.id;

/**
 * The address of the extension's pages: Firefox gives every installed add-on a
 * random uuid of its own, unless the profile names one for its id before the install.
 */
const UUID = "3f1c2b7a-5d4e-4a6b-9c8d-7e6f5a4b3c2d";
const POPUP = `moz-extension://${UUID}/popup.html`;
const OPTIONS = `moz-extension://${UUID}/options.html`;

/** How long a step may take before the test fails. */
const TIMEOUT = 15_000;

/**
 * The Firefox to test, from E2E_FIREFOX_PATH or where Firefox installs itself, or
 * undefined when this computer has none.
 */
export function findFirefox(
  environment: NodeJS.ProcessEnv = process.env,
  exists: (file: string) => boolean = existsSync,
): string | undefined {
  const named = environment.E2E_FIREFOX_PATH;
  if (named !== undefined && named !== "") {
    return named;
  }
  return [
    "/usr/bin/firefox",
    "/usr/bin/firefox-esr",
    "/Applications/Firefox.app/Contents/MacOS/firefox",
    "C:/Program Files/Mozilla Firefox/firefox.exe",
  ].find(exists);
}

/**
 * The hosts of Firefox's own services, which it asks without the add-on, such as for
 * its settings and the signatures of its lists.
 */
const FIREFOX_SERVICES = /(?:^|\.)(?:mozilla\.(?:com|net|org)|firefox\.com)$/;

/** The proxy that Firefox sends every request through. */
interface Proxy {
  readonly port: number;
  /** The hosts of the requests that it refused. */
  readonly refused: string[];
  close(): Promise<void>;
}

/**
 * Starts the proxy: a tunnel to the fake server for the two hosts of Autodarts on
 * port 443, a refusal for everything else.
 */
async function startProxy(server: FakeServer): Promise<Proxy> {
  const refused: string[] = [];
  const sockets = new Set<Socket>();
  const proxy = createServer((request, response) => {
    refused.push(URL.parse(request.url ?? "")?.hostname ?? String(request.url));
    response.writeHead(403);
    response.end();
  });
  proxy.on("connection", (socket: Socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  proxy.on("connect", (request, socket: Socket, head: Buffer) => {
    const target = request.url ?? "";
    if (target !== `${PLAY_HOST}:443` && target !== `${AUTH_HOST}:443`) {
      refused.push(target.replace(/:\d+$/, ""));
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    const upstream = connect(server.port, "127.0.0.1", () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    sockets.add(upstream);
    upstream.on("close", () => sockets.delete(upstream));
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  return {
    port: (proxy.address() as AddressInfo).port,
    refused,
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) {
          socket.destroy();
        }
        proxy.close(() => resolve());
      }),
  };
}

/** The size of every page of the tests, which decides where the button of the page sits. */
const VIEWPORT = { width: 1280, height: 800 };

/**
 * The middle of the button of the switcher in the bottom right corner of a page: 16
 * pixels from the edges, 56 wide (src/content.ts).
 */
export const buttonCorner = {
  x: VIEWPORT.width - 16 - 28,
  y: VIEWPORT.height - 16 - 28,
};

/**
 * Whether the button of the switcher shows in the bottom right corner of the page.
 * It sits in a closed shadow root that no selector reaches, so this asks what a
 * finger would tap there.
 */
export function buttonShows(page: Page): Promise<boolean> {
  return page.evaluate(
    (x: number, y: number) =>
      document.elementFromPoint(x, y)?.localName === "player-switch-ui",
    buttonCorner.x,
    buttonCorner.y,
  );
}

/**
 * Waits until `check` holds, asking again every 100 ms. Firefox's WebDriver BiDi
 * reports no events of an extension page (bug 1755014), so Puppeteer neither sees a
 * popup.html load nor finds its realm again after a reload; every question here is
 * asked anew, from this side.
 */
export async function until(
  check: () => Promise<boolean>,
  what: string,
  timeout = TIMEOUT,
): Promise<void> {
  const end = Date.now() + timeout;
  while (!(await check().catch(() => false))) {
    if (Date.now() > end) {
      throw new Error(`Firefox didn't get there within ${timeout} ms: ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Waits until an Autodarts page has started, signed in as this account or nobody. */
export async function expectPlayer(
  page: Page,
  account: Account | null,
  timeout = TIMEOUT,
): Promise<void> {
  const state = account === null ? "signed-out" : "signed-in";
  const name = account?.name ?? "";
  await until(
    () =>
      page.evaluate(
        (state: string, name: string) =>
          document.body?.dataset.state === state &&
          document.querySelector("#who")?.textContent === name,
        state,
        name,
      ),
    `the page plays ${name || "nobody"}`,
    timeout,
  );
}

/** The toolbar popup, opened in a tab of its own: popup.html as the toolbar shows it. */
export class Popup {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Waits until the popup has started and has its answer from the background. */
  async ready(): Promise<void> {
    await until(
      () =>
        this.page.evaluate(
          (address: string) =>
            location.href === address &&
            document.readyState === "complete" &&
            !("stale" in window) &&
            document.querySelector("#profiles")?.getAttribute("aria-busy") !==
              "true",
          POPUP,
        ),
      "the popup has its answer from the background",
    );
  }

  /** Clicks a control of the popup, as a tap does, once it is there. */
  async click(selector: string): Promise<void> {
    await until(
      () =>
        this.page.evaluate((selector: string) => {
          const control = document.querySelector<HTMLElement>(selector);
          control?.click();
          return control !== null;
        }, selector),
      `the popup shows ${selector}`,
    );
  }

  /** Taps the tile of an account and waits until the background has answered. */
  async tap(account: Account): Promise<void> {
    await until(
      () =>
        this.page.evaluate((name: string) => {
          const tile = [...document.querySelectorAll("#profiles .profile")]
            .find(
              (profile) => profile.querySelector(".name")?.textContent === name,
            )
            ?.querySelector<HTMLElement>(".tile");
          tile?.click();
          return tile !== undefined && tile !== null;
        }, account.name),
      `the popup shows the tile of ${account.name}`,
    );
    await this.ready();
  }

  /** Waits until the popup shows these accounts, in this order, with this one playing. */
  async expectAccounts(
    accounts: readonly Account[],
    playing: Account,
  ): Promise<void> {
    const names = accounts.map((account) => account.name);
    await until(
      () =>
        this.page.evaluate(
          (expected: string[], active: string) =>
            JSON.stringify(
              [...document.querySelectorAll("#profiles .profile .name")].map(
                (name) => name.textContent,
              ),
            ) === JSON.stringify(expected) &&
            document.querySelector("#profiles .profile.active .name")
              ?.textContent === active,
          names,
          playing.name,
        ),
      `the popup shows ${names.join(", ")} with ${playing.name} playing`,
    );
  }

  /** Opens the popup anew, as a second click on the toolbar button does. */
  async reopen(): Promise<void> {
    await this.page.evaluate(() => {
      Object.assign(window, { stale: true });
      location.reload();
    });
    await this.ready();
  }
}

/** The display: Firefox with the add-on, its Autodarts tabs and its popup. */
export class Display {
  readonly browser: Browser;

  constructor(browser: Browser) {
    this.browser = browser;
  }

  /** Opens Autodarts Play in a new tab and waits until the page has started. */
  async openAutodarts(): Promise<Page> {
    const page = await this.browser.newPage();
    await page.goto(`${PLAY}/`);
    await page.waitForFunction(
      () => document.body?.dataset.state !== "starting",
      { timeout: TIMEOUT },
    );
    return page;
  }

  /** Signs an account in on an Autodarts page, as the player does there. */
  async signIn(page: Page, account: Account): Promise<void> {
    // The player looks at the page to sign in. Firefox draws no frame of a tab in
    // the background, and Puppeteer waits for one before it types.
    await page.bringToFront();
    await page.waitForSelector("#sign-in [name=username]", {
      visible: true,
      timeout: TIMEOUT,
    });
    await page.locator("#sign-in [name=username]").fill(account.username);
    await page.locator("#sign-in [name=password]").fill(account.password);
    await page.locator("#sign-in button[type=submit]").click();
    await expectPlayer(page, account);
  }

  /** Opens the toolbar popup in a new tab. */
  async popup(): Promise<Popup> {
    const page = await this.browser.newPage();
    // Puppeteer waits in vain for the load of an extension page, as until() says:
    // the popup waits for itself instead.
    page.goto(POPUP).catch(() => undefined);
    const popup = new Popup(page);
    await popup.ready();
    return popup;
  }

  /**
   * Opens the options page in a new tab, the page that about:addons embeds under the
   * Preferences of the add-on, and waits until the background has answered it and it
   * shows its settings, as it does while no manager PIN locks them.
   */
  async options(): Promise<Page> {
    const page = await this.browser.newPage();
    // As for the popup, the page waits for itself instead of its load.
    page.goto(OPTIONS).catch(() => undefined);
    await until(
      () =>
        page.evaluate(
          (address: string) =>
            location.href === address &&
            document.querySelector<HTMLElement>("#settings")?.hidden === false,
          OPTIONS,
        ),
      "the options page shows its settings",
    );
    return page;
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
        await popup.click("#add");
        await popup.ready();
      }
      await this.signIn(page, account);
      await popup.reopen();
      await popup.expectAccounts(accounts.slice(0, index + 1), account);
    }
    return popup;
  }
}

/**
 * Runs a test with a Firefox of its own, with a fresh profile and the add-on just
 * installed, against the fake Autodarts, and checks afterwards that the fake had an
 * answer for every request and saw no refresh token twice, and that no request went
 * to another host than Autodarts and Firefox's own services. Unlike Chrome's service
 * worker in the Chromium tests, the background of the add-on is out of reach of
 * WebDriver BiDi, so its console isn't checked here.
 */
export async function withFirefox(
  firefox: string,
  autodarts: FakeAutodarts,
  test: (display: Display) => Promise<void>,
): Promise<void> {
  const server = await startFakeServer(autodarts);
  const proxy = await startProxy(server);
  const browser = await puppeteer.launch({
    browser: "firefox",
    executablePath: firefox,
    headless: process.env.E2E_HEADED === undefined,
    // The certificate of the fake server has no authority behind it. Firefox
    // reaches no other server, so it may pass every certificate.
    acceptInsecureCerts: true,
    defaultViewport: VIEWPORT,
    // WebDriver BiDi navigates a tab to an extension page, moz-extension://, only
    // with system access, as the popup is opened here. Firefox 159 takes it from this
    // variable alone; older ones, such as ESR 140 and 153, also had a flag for it.
    env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: "1" },
    extraPrefsFirefox: {
      "extensions.webextensions.uuids": JSON.stringify({ [ADDON_ID]: UUID }),
      "intl.locale.requested": "en-US",
      "network.proxy.type": 1,
      "network.proxy.http": "127.0.0.1",
      "network.proxy.http_port": proxy.port,
      "network.proxy.ssl": "127.0.0.1",
      "network.proxy.ssl_port": proxy.port,
      "network.proxy.no_proxies_on": "",
      "network.proxy.allow_hijacking_localhost": true,
    },
  });
  try {
    const installed = await browser.installExtension(EXTENSION);
    if (installed !== ADDON_ID) {
      throw new Error(
        `Firefox installed the add-on as ${installed}, not as ${ADDON_ID}`,
      );
    }
    await test(new Display(browser));
  } finally {
    await browser.close();
    await proxy.close();
    await server.close();
  }
  const elsewhere = proxy.refused.filter(
    (host) => !FIREFOX_SERVICES.test(host),
  );
  if (elsewhere.length > 0) {
    throw new Error(
      `Requests to a host that the tests don't serve: ${[...new Set(elsewhere)].join(", ")}`,
    );
  }
  if (server.stray.length > 0) {
    throw new Error(
      `Requests that the fake Autodarts has no answer for: ${server.stray.join(", ")}`,
    );
  }
  if (autodarts.reused.length > 0) {
    throw new Error(
      `Refresh tokens that reached Autodarts a second time: ${autodarts.reused.join(", ")}`,
    );
  }
}

/** The Firefox of this computer, or undefined when it has none. */
const FIREFOX = findFirefox();

/** Why the tests skip: no Firefox on this computer, other than in the CI, which has one. */
export const skip =
  FIREFOX === undefined && process.env.CI === undefined
    ? "no Firefox on this computer: install one or set E2E_FIREFOX_PATH"
    : false;

/** A test in a Firefox of its own (withFirefox), with a fake Autodarts of its own. */
export function inFirefox(
  run: (display: Display, autodarts: FakeAutodarts) => Promise<void>,
): () => Promise<void> {
  return async () => {
    if (FIREFOX === undefined) {
      throw new Error(
        "The CI has no Firefox: install one, or set E2E_FIREFOX_PATH to it.",
      );
    }
    const autodarts = new FakeAutodarts();
    await withFirefox(FIREFOX, autodarts, (display) => run(display, autodarts));
  };
}
