// The popup and the welcome page in the language, and the popup in the color scheme,
// of the browser.
import { ALICE, expect, test } from "./fixtures.ts";

/** The relative luminance of a CSS color such as "rgb(20, 22, 29)", from 0 to 1. */
function luminance(color: string): number {
  const [red = 0, green = 0, blue = 0] = (color.match(/\d+(\.\d+)?/g) ?? [])
    .map(Number)
    .map((channel) => {
      const value = channel / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

for (const language of ["en", "de"] as const) {
  test.describe(`in ${language === "en" ? "English" : "German"}`, () => {
    test.use({ language });

    test("the popup shows every text in the language of the browser", async ({
      display,
    }) => {
      const page = await display.openAutodarts();
      const popup = await display.saveAccounts(page, [ALICE]);

      await expect(popup.page.locator("html")).toHaveAttribute(
        "lang",
        language,
      );
      await expect(popup.page.locator("h1")).toHaveText(display.t("title"));
      await expect(popup.page.locator("#add")).toContainText(
        display.t("addAccount"),
      );
      await expect(popup.page.locator("#manage")).toHaveText(
        display.t("manage"),
      );
      await popup.manage();
      await expect(popup.tile(ALICE).locator(".toggle-remember")).toHaveText(
        display.t("rememberPassword"),
      );
      await expect(popup.page.locator("#manage")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    test("the welcome page of the install shows its four steps, the last one shares the board", async ({
      display,
    }) => {
      const welcome = await display.welcome();

      await expect(welcome.locator("html")).toHaveAttribute("lang", language);
      await expect(welcome.locator(".lead")).toHaveText(
        display.t("welcomeLead"),
      );
      await expect(welcome.locator(".step h2")).toHaveText([
        display.t("welcomePinTitle"),
        display.t("welcomeFirstTitle"),
        display.t("welcomeNextTitle"),
        display.t("welcomeShareTitle"),
      ]);
      const share = welcome.locator("#share");
      await expect(share).toContainText(display.t("welcomeShareText"));
      // The link leads to the entry of the help that says why a player sees no board,
      // in the help of the language of the extension.
      const help = share.locator("a[data-link=help]");
      await expect(help).toHaveText(display.t("welcomeShareHelp"));
      await expect(help).toHaveAttribute(
        "href",
        `${display.t("helpUrl")}#board-not-shared`,
      );
    });
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`with a ${colorScheme} color scheme`, () => {
    test.use({ colorScheme });

    test(`the popup is ${colorScheme}`, async ({ display }) => {
      const popup = await display.popup();
      const background = await popup.page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      );
      if (colorScheme === "dark") {
        expect(luminance(background)).toBeLessThan(0.1);
      } else {
        expect(luminance(background)).toBeGreaterThan(0.8);
      }
    });
  });
}
