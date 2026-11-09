// The extension in a real Firefox: installed as a temporary add-on, it has its access
// to the Autodarts sites, saves two accounts and switches between them, from the popup
// and from the switcher in the page, against the fake Autodarts of the end-to-end
// tests (display.ts). It skips without a Firefox on this computer, other than in the
// CI.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Page } from "puppeteer-core";
import {
  type Account,
  ALICE,
  BOB,
  FakeAutodarts,
} from "../e2e/fake/autodarts.ts";
import {
  type Display,
  expectPlayer,
  findFirefox,
  withFirefox,
} from "./display.ts";

/** The Autodarts sites that the manifest asks access to: the page and its API. */
const SITES = (
  JSON.parse(
    readFileSync(
      new URL("../../extension/manifest.json", import.meta.url),
      "utf8",
    ),
  ) as { host_permissions: string[] }
).host_permissions;

const firefox = findFirefox();
const skip =
  firefox === undefined && process.env.CI === undefined
    ? "no Firefox on this computer: install one or set E2E_FIREFOX_PATH"
    : false;

function inFirefox(
  run: (display: Display, autodarts: FakeAutodarts) => Promise<void>,
) {
  return async () => {
    if (firefox === undefined) {
      throw new Error(
        "The CI has no Firefox: install one, or set E2E_FIREFOX_PATH to it.",
      );
    }
    const autodarts = new FakeAutodarts();
    await withFirefox(firefox, autodarts, (display) => run(display, autodarts));
  };
}

/**
 * Presses Enter until the page plays this account: the first press may come before
 * the switcher has drawn its tiles and focused the first one.
 */
async function switchWithEnter(page: Page, account: Account): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    await page.keyboard.press("Enter");
    try {
      await expectPlayer(page, account, 2_000);
      return;
    } catch (error) {
      if (attempt === 5) {
        throw error;
      }
    }
  }
}

test(
  "the install grants the access to the Autodarts sites, with nothing to allow",
  { skip },
  inFirefox(async (display) => {
    // Firefox lists this access on the add-on's page in about:addons, under
    // Permissions and data, as switches that a person can turn off; without it, the
    // page gets no button and no sign-in is saved. As about:debugging loads the
    // add-on, Firefox turns them on by itself, as the README says.
    const popup = await display.popup();
    const granted = await popup.page.evaluate(() =>
      chrome.permissions.getAll(),
    );
    assert.deepEqual([...(granted.origins ?? [])].sort(), [...SITES].sort());
  }),
);

test(
  "a tap in the popup switches A to B and back, with the session of each kept fresh",
  { skip },
  inFirefox(async (display, autodarts) => {
    const page = await display.openAutodarts();
    const popup = await display.saveAccounts(page, [ALICE, BOB]);

    const renewals = autodarts.count("refresh", ALICE);
    await popup.tap(ALICE);
    await popup.expectAccounts([ALICE, BOB], ALICE);
    await expectPlayer(page, ALICE);
    // The extension renewed Alice's parked session, and the page renewed it again as
    // it started with it: each token went to Autodarts once.
    assert.equal(autodarts.count("refresh", ALICE), renewals + 2);

    await popup.tap(BOB);
    await popup.expectAccounts([ALICE, BOB], BOB);
    await expectPlayer(page, BOB);
    assert.equal(autodarts.sessionsOf(ALICE), 1);
    assert.equal(autodarts.sessionsOf(BOB), 1);
  }),
);

test(
  "the switcher in the page switches players on a display without a toolbar",
  { skip },
  inFirefox(async (display) => {
    const page = await display.openAutodarts();
    const popup = await display.saveAccounts(page, [ALICE, BOB]);
    await popup.page.close();

    // The button sits in the bottom right corner, in a closed shadow root that no
    // selector reaches, so the test taps where it shows, as a finger does.
    const corner = { x: 1280 - 16 - 28, y: 800 - 16 - 28 };
    await page.waitForFunction(
      (x: number, y: number) =>
        document.elementFromPoint(x, y)?.localName === "player-switch-ui",
      { timeout: 15_000 },
      corner.x,
      corner.y,
    );
    await page.mouse.click(corner.x, corner.y);

    // The switcher is an extension page in a frame, which WebDriver BiDi doesn't
    // reach in Firefox (display.ts). It gives the first tile, Alice's, the focus once
    // the tiles are there, so the test switches with the keyboard, as a keyboard
    // player does: Enter on that tile.
    await page.waitForFunction(
      () => document.activeElement?.localName === "player-switch-ui",
      { timeout: 15_000 },
    );
    await switchWithEnter(page, ALICE);
  }),
);
