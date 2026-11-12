// The options page of the add-on in a real Firefox, which embeds it in about:addons
// under the Preferences of the add-on: a smoke test that it opens with what the
// background answers, and that the button in the Autodarts page follows its settings
// (display.ts). The Chromium tests of test/e2e/options.spec.ts walk the page in
// full. It skips without a Firefox on this computer, other than in the CI.
import { test } from "node:test";
import type { Page } from "puppeteer-core";
import { ALICE } from "../e2e/fake/autodarts.ts";
import { inFirefox, skip, until } from "./display.ts";

/**
 * Whether the button of the switcher shows in the bottom right corner of the page.
 * It sits in a closed shadow root that no selector reaches, so this asks what a
 * finger would tap there.
 */
function buttonShows(page: Page): Promise<boolean> {
  return page.evaluate(
    (x: number, y: number) =>
      document.elementFromPoint(x, y)?.localName === "player-switch-ui",
    1280 - 16 - 28,
    800 - 16 - 28,
  );
}

test(
  "the options page opens with the saved account, and the button of the page follows it",
  { skip },
  inFirefox(async (display) => {
    const page = await display.openAutodarts();
    const popup = await display.saveAccounts(page, [ALICE]);
    await popup.page.close();
    await page.bringToFront();
    await until(() => buttonShows(page), "the page shows its button");
    const options = await display.options();
    // The list of the PINs comes from the background, as the venue mode keeps it.
    await until(
      () =>
        options.evaluate(
          (name: string) =>
            document.querySelector("#player-pins .player .name")
              ?.textContent === name,
          ALICE.name,
        ),
      "the options page lists the saved account",
    );

    // Firefox draws no frame of a tab in the background, so the test looks at the
    // page of Autodarts while it asks it where the button shows.
    await options.evaluate(() =>
      document.querySelector<HTMLInputElement>("#show-button")?.click(),
    );
    await page.bringToFront();
    await until(
      async () => !(await buttonShows(page)),
      "the page hides its button",
    );

    await options.bringToFront();
    await options.evaluate(() =>
      document.querySelector<HTMLInputElement>("#show-button")?.click(),
    );
    await page.bringToFront();
    await until(() => buttonShows(page), "the page shows its button again");
  }),
);
