// The accessibility of the popup, in a real browser: the popup.html of the extension
// with chrome-stub.js in place of Chrome and its made-up accounts, as the pictures of
// scripts/screenshots.sh show it (capture.py). axe-core checks the list, "Manage
// accounts", the form of a remembered password, the question before a removal and an
// error, in both languages and both color schemes, and the switcher in the Autodarts
// page; the page itself checks that every control is a target of 44 by 44 pixels, that
// no text is smaller than 12 pixels and that no button text breaks. A walk with the
// keyboard alone through every action checks where the focus lands, and the contrast
// themes of the system and reduced motion get a look of their own.
//
// It runs the Chrome or Edge of this computer through playwright-core, which brings no
// browser of its own; CHROME_PATH points it at another one. Without one it skips, other
// than in the CI, where it fails. Every file comes from the repository through a route
// of the browser and every other request fails. Run by scripts/check-project.sh, or
// alone with `npm run test:a11y`, which builds extension/lib/ first.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, relative, resolve } from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ORIGIN = "http://harness.test";
const STUB = fileURLToPath(new URL("chrome-stub.js", import.meta.url));
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const TYPES = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
// The rules of WCAG 2.2 up to AA, and the best practices of axe-core.
const RULES = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
];

/** Chrome from CHROME_PATH, the one installed, or Edge, which every Windows has. */
async function launch() {
  const choices = process.env.CHROME_PATH
    ? [{ executablePath: process.env.CHROME_PATH }]
    : [{ channel: "chrome" }, { channel: "msedge" }];
  for (const choice of choices) {
    try {
      return await chromium.launch(choice);
    } catch {
      // Not on this computer; the next one, if any.
    }
  }
  if (process.env.CI) {
    throw new Error("No Chrome to test the popup in; set CHROME_PATH to one.");
  }
  return null;
}

// The pages load the code of src/ from extension/lib/, which `npm run build` writes.
if (!existsSync(new URL("../../extension/lib/page.js", import.meta.url))) {
  throw new Error(
    "extension/lib/ is missing: build it first with npm run build.",
  );
}

const browser = await launch();
if (browser === null) {
  console.log(
    "No Chrome or Edge here: the accessibility tests of the popup skip; the CI runs them. CHROME_PATH points them at a Chrome.",
  );
}

/** Answers a request of the browser with a file of the repository, and nothing else. */
async function serve(route) {
  const url = new URL(route.request().url());
  const target = resolve(ROOT, `.${decodeURIComponent(url.pathname)}`);
  const inside = !relative(ROOT, target).startsWith("..");
  if (url.origin !== ORIGIN || !inside) {
    await route.abort();
    return;
  }
  try {
    const body = await readFile(target);
    await route.fulfill({
      status: 200,
      body,
      headers: {
        "Content-Type": TYPES[extname(target)] ?? "application/octet-stream",
      },
    });
  } catch {
    await route.abort();
  }
}

/** A fresh page of the extension, once it shows its players. */
async function open({
  page = "popup",
  lang = "en",
  scheme = "light",
  forcedColors = "none",
  accounts = 3,
  pins = false,
  manager = false,
} = {}) {
  const context = await browser.newContext({
    viewport: { width: page === "popup" ? 340 : 1024, height: 720 },
    colorScheme: scheme,
    forcedColors,
    reducedMotion: "reduce",
    locale: lang === "de" ? "de-DE" : "en-US",
    timezoneId: "Europe/Berlin",
  });
  await context.route("**/*", serve);
  await context.addInitScript({ path: STUB });
  const tab = await context.newPage();
  const errors = [];
  tab.on("pageerror", (error) => errors.push(error));
  await tab.goto(
    `${ORIGIN}/extension/${page}.html?lang=${lang}&accounts=${accounts}${pins ? "&pins=1" : ""}${manager ? "&manager=1" : ""}`,
  );
  // The options page draws its accounts also while a manager PIN keeps them hidden.
  await (page === "options"
    ? tab.waitForSelector("#player-pins li", { state: "attached" })
    : tab.waitForSelector("#profiles .tile"));
  await settle(tab);
  tab.errors = errors;
  return tab;
}

/** Waits until no request is with the stand-in of the worker and the page is drawn. */
async function settle(page) {
  await page.evaluate(() => window.harness.idle());
}

/** What axe-core finds, one line for each rule with the elements that break it. */
async function violations(page) {
  if (!(await page.evaluate(() => "axe" in window))) {
    await page.addScriptTag({ path: AXE });
  }
  const found = await page.evaluate(
    (tags) =>
      window.axe.run(document, { runOnly: { type: "tag", values: tags } }),
    RULES,
  );
  return found.violations.map(
    (rule) =>
      `${rule.id}: ${rule.help} (${rule.nodes.map((node) => node.target.join(" ")).join(", ")})`,
  );
}

/**
 * What the page finds itself on what shows: controls smaller than 44 by 44 pixels,
 * text smaller than 12 pixels and button texts that break onto a second line.
 */
function measure(page) {
  return page.evaluate(() => {
    const name = (element) =>
      `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}.${[...element.classList].join(".")} "${element.textContent.trim().slice(0, 30)}"`;
    const shown = (element) =>
      element.checkVisibility() && element.closest("[inert]") === null;
    const found = [];
    for (const control of document.querySelectorAll("button, a[href], input")) {
      const box = control.getBoundingClientRect();
      if (shown(control) && (box.width < 44 || box.height < 44)) {
        found.push(
          `${name(control)} is ${Math.round(box.width)}x${Math.round(box.height)} px, less than 44x44`,
        );
      }
    }
    const texts = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    for (let node = texts.nextNode(); node !== null; node = texts.nextNode()) {
      const element = node.parentElement;
      if (node.textContent.trim() === "" || !shown(element)) {
        continue;
      }
      const size = Number.parseFloat(getComputedStyle(element).fontSize);
      if (size < 12) {
        found.push(`${name(element)} has text of ${size} px, less than 12`);
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      const lines = new Set(
        [...range.getClientRects()].map((rect) => Math.round(rect.top)),
      );
      if (element.closest("button") !== null && lines.size > 1) {
        found.push(`${name(element)} breaks onto ${lines.size} lines`);
      }
    }
    return found;
  });
}

/** Checks a view with axe-core and with the measures of the page. */
async function check(page, view) {
  assert.deepEqual(
    await violations(page),
    [],
    `axe-core finds problems in ${view}`,
  );
  assert.deepEqual(
    await measure(page),
    [],
    `the targets or the texts of ${view} are too small`,
  );
}

/** Presses a key and waits for the answer of any request that it sends. */
async function press(page, key) {
  await page.keyboard.press(key);
  await settle(page);
}

/** Presses Tab, or Shift+Tab backwards, until the focus is on `selector`. */
async function tabTo(page, selector, backwards = false) {
  for (let step = 0; step < 40; step += 1) {
    if (
      await page.evaluate(
        (wanted) => document.activeElement?.matches(wanted) === true,
        selector,
      )
    ) {
      return;
    }
    await page.keyboard.press(backwards ? "Shift+Tab" : "Tab");
  }
  assert.fail(`Tab never reaches ${selector}`);
}

/** The control that has the focus, as a selector of its account and its kind. */
function focused(page) {
  return page.evaluate(() => {
    const element = document.activeElement;
    const account = element.closest(".profile")?.dataset.id;
    const kind = element.id
      ? `#${element.id}`
      : `.${element.classList[element.classList.length - 1]}`;
    return account === undefined ? kind : `${account} ${kind}`;
  });
}

after(() => browser?.close());

const tile = (id) => `[data-id="demo-${id}"] .tile`;
const control = (id, kind) => `[data-id="demo-${id}"] ${kind}`;

describe("the popup in axe-core", { skip: browser === null }, () => {
  for (const lang of ["en", "de"]) {
    for (const scheme of ["light", "dark"]) {
      test(`every view, in ${lang} and ${scheme}`, async () => {
        const page = await open({ lang, scheme });
        await check(page, "the list");

        // An error, read out at once: a switch that Autodarts can't take.
        await page.evaluate(() =>
          window.harness.refuse({ ok: false, reason: "unreachable" }),
        );
        await page.click(tile("jonasberg"));
        await settle(page);
        assert.notEqual(await page.textContent("#problem"), "");
        await check(page, "an error");

        await page.click("#manage");
        await settle(page);
        await check(page, '"Manage accounts"');

        await page.click(control("miakeller", ".toggle-remember"));
        await settle(page);
        await check(page, "the form of a remembered password");

        await page.click(control("lenavogt", ".remove"));
        await settle(page);
        assert.equal(await page.locator("dialog[open]").count(), 1);
        await check(page, "the question before a removal");
        assert.deepEqual(page.errors, []);
        await page.context().close();
      });
    }
  }

  test("the switcher in the Autodarts page", async () => {
    for (const scheme of ["light", "dark"]) {
      const page = await open({ page: "switcher", scheme });
      assert.deepEqual(
        await violations(page),
        [],
        `axe-core finds problems in the switcher, ${scheme}`,
      );
      await page.context().close();
    }
  });

  test("the texts and names in German", async () => {
    const page = await open({ lang: "de" });
    assert.equal(await page.getAttribute("#profiles", "aria-label"), "Konten");
    assert.equal(await page.getAttribute("html", "lang"), "de");
    assert.equal(await page.textContent("#manage"), "Konten verwalten");
    await page.context().close();
  });
});

describe("the question for a PIN of the venue mode", {
  skip: browser === null,
}, () => {
  /** Taps the tile of Jonas, whose account asks for a PIN, as the worker refuses it first. */
  async function askForPin(
    page,
    reply = { ok: false, reason: "pin", pin: "player" },
  ) {
    await page.evaluate((refusal) => window.harness.refuse(refusal), reply);
    await page.click(tile("jonasberg"));
    await settle(page);
    assert.equal(await page.locator("dialog.pin[open]").count(), 1);
  }

  test("in the popup and the switcher, in both languages and color schemes", async () => {
    for (const page of ["popup", "switcher"]) {
      for (const lang of ["en", "de"]) {
        for (const scheme of ["light", "dark"]) {
          const tab = await open({ page, lang, scheme, pins: true });
          const view = `the question for a PIN in the ${page}, ${lang}, ${scheme}`;
          assert.equal(
            await tab.locator(`${tile("jonasberg")} .chip.pin`).count(),
            1,
            "the tile of an account with a PIN shows a lock",
          );
          await askForPin(tab, {
            ok: false,
            reason: "pin",
            pin: "player",
            wrong: true,
          });
          assert.notEqual(await tab.textContent(".pin-problem"), "");
          await check(tab, view);
          assert.deepEqual(tab.errors, []);
          await tab.context().close();
        }
      }
    }
  });

  test("the number pad types the PIN, and OK switches", async () => {
    const page = await open({ pins: true });
    await askForPin(page);
    // The field has the focus, so a keyboard types at once.
    assert.equal(await focused(page), ".pin-input");
    for (const digit of ["4", "7", "1", "9"]) {
      await page.click(`.pad-key:text-is("${digit}")`);
    }
    await page.click(".pad-key.delete");
    await page.click('.pad-key:text-is("1")');
    assert.equal(await page.inputValue(".pin-input"), "4711");
    await page.click(".pad-ok");
    await settle(page);
    assert.equal(await page.locator("dialog").count(), 0);
    assert.equal(
      await page.getAttribute(tile("jonasberg"), "aria-current"),
      "true",
    );
    await page.context().close();
  });

  test("too few digits keep the question open and say why", async () => {
    const page = await open({ pins: true });
    await askForPin(page);
    await page.keyboard.type("12");
    await press(page, "Enter");
    assert.equal(await page.locator("dialog.pin[open]").count(), 1);
    assert.equal(
      await page.textContent(".pin-problem"),
      "A PIN has 4 to 8 digits.",
    );
    assert.equal(await focused(page), ".pin-input");
    await page.context().close();
  });

  test("Esc cancels, changes nothing and gives the focus back to the tile", async () => {
    const page = await open({ pins: true });
    await page.focus(tile("jonasberg"));
    await askForPin(page);
    await press(page, "Escape");
    assert.equal(await page.locator("dialog").count(), 0);
    assert.equal(await focused(page), "demo-jonasberg .tile");
    assert.equal(
      await page.getAttribute(tile("miakeller"), "aria-current"),
      "true",
    );
    await page.context().close();
  });

  test("Manage accounts asks for the manager PIN before it opens", async () => {
    const page = await open({ manager: true });
    await page.evaluate(() =>
      window.harness.refuse({ ok: false, reason: "pin", pin: "manager" }),
    );
    await page.click("#manage");
    await settle(page);
    assert.equal(await page.locator("dialog.pin[open]").count(), 1);
    assert.equal(await page.textContent("dialog.pin h2"), "Manager PIN");
    await page.keyboard.type("2468");
    await press(page, "Enter");
    assert.equal(await page.locator("dialog").count(), 0);
    assert.equal(await page.getAttribute("#manage", "aria-pressed"), "true");
    await page.context().close();
  });
});

describe("the options page with the venue mode", {
  skip: browser === null,
}, () => {
  test("every part, in both languages and color schemes", async () => {
    for (const lang of ["en", "de"]) {
      for (const scheme of ["light", "dark"]) {
        const page = await open({ page: "options", lang, scheme, pins: true });
        // Chrome shows the page, whose own background is transparent, in a box of
        // the colors of its scheme; the stand-in paints that box.
        await page.addStyleTag({ content: "html { background: Canvas; }" });
        assert.equal(await page.isVisible("#venue"), true);
        assert.equal(await page.isVisible("#locked"), false);
        // The checkbox and the radio buttons are smaller than 44 pixels, but their
        // labels are the targets: only axe-core checks this page.
        assert.deepEqual(
          await violations(page),
          [],
          `axe-core finds problems in the options page, ${lang}, ${scheme}`,
        );
        assert.deepEqual(page.errors, []);
        await page.context().close();
      }
    }
  });

  test("a manager PIN locks the page until it is entered", async () => {
    const page = await open({ page: "options", manager: true });
    assert.equal(await page.isVisible("#locked"), true);
    assert.equal(await page.isVisible("#settings"), false);
    assert.deepEqual(await violations(page), [], "axe-core, the locked page");
    await page.click("#unlock");
    await settle(page);
    assert.equal(await page.isVisible("#settings"), true);
    assert.equal(await focused(page), "#show-button");
    await page.context().close();
  });

  test("a new PIN is asked for twice, and the account then says so", async () => {
    const page = await open({ page: "options" });
    await page.click('[data-focus="set:demo-lenavogt"]');
    await page.keyboard.type("1357");
    await press(page, "Enter");
    await page.keyboard.type("1357");
    await press(page, "Enter");
    assert.equal(await page.locator("dialog").count(), 0);
    assert.match(await page.textContent("#player-pins"), /Lena Vogt.*PIN set/);
    // The focus stays on the control of the account, which now changes the PIN.
    assert.equal(await focused(page), ".link");
    assert.equal(
      await page.getAttribute('[data-focus="set:demo-lenavogt"]', "aria-label"),
      "Change PIN: Lena Vogt",
    );
    assert.equal(await page.textContent("#saved"), "Saved.");
    await page.context().close();
  });

  test("two PINs that differ ask again", async () => {
    const page = await open({ page: "options" });
    await page.click('[data-focus="set:demo-lenavogt"]');
    await page.keyboard.type("1357");
    await press(page, "Enter");
    await page.keyboard.type("1358");
    await press(page, "Enter");
    assert.equal(await page.locator("dialog.pin[open]").count(), 1);
    assert.equal(
      await page.textContent(".pin-problem"),
      "The two PINs differ. Choose the PIN again.",
    );
    await page.context().close();
  });

  test("the return after a break offers the house accounts once it is on", async () => {
    const page = await open({ page: "options" });
    assert.equal(await page.isDisabled("#idle-house"), true);
    await page.selectOption("#idle-minutes", "10");
    await settle(page);
    assert.equal(await page.isDisabled("#idle-house"), false);
    assert.deepEqual(
      await page.$$eval("#idle-house option", (options) =>
        options.map((option) => option.textContent),
      ),
      ["Nobody: sign out", "Mia Keller", "Jonas Berg", "Lena Vogt"],
    );
    await page.context().close();
  });
});

describe("the popup with the keyboard alone", {
  skip: browser === null,
}, () => {
  let page;
  before(async () => {
    page = await open();
  });

  test("Tab starts at Manage accounts, and the key numbers show", async () => {
    assert.equal(await page.locator(".key").first().isVisible(), false);
    await press(page, "Tab");
    assert.equal(await focused(page), "#manage");
    assert.equal(await page.locator(".key").first().isVisible(), true);
    assert.equal(
      await page.getAttribute(tile("miakeller"), "aria-current"),
      "true",
    );
    assert.equal(
      await page.getAttribute(tile("jonasberg"), "aria-keyshortcuts"),
      "2",
    );
  });

  test("a key from 1 to 9 switches, and the focus stays on the new player", async () => {
    await press(page, "2");
    assert.equal(await focused(page), "demo-jonasberg .tile");
    assert.equal(
      await page.getAttribute(tile("jonasberg"), "aria-current"),
      "true",
    );
    assert.equal(
      await page.getAttribute(tile("miakeller"), "aria-current"),
      null,
    );
    // The switch is over, so the popup no longer says it is under way.
    assert.equal(await page.textContent("#status"), "");
  });

  test("Enter on a tile switches, and the focus stays on it", async () => {
    await tabTo(page, tile("lenavogt"));
    await press(page, "Enter");
    assert.equal(await focused(page), "demo-lenavogt .tile");
    assert.equal(
      await page.getAttribute(tile("lenavogt"), "aria-current"),
      "true",
    );
  });

  test("an error is read out at once, and the focus stays where it was", async () => {
    await tabTo(page, tile("miakeller"), true);
    await page.evaluate(() =>
      window.harness.refuse({ ok: false, reason: "unreachable" }),
    );
    await press(page, "Enter");
    assert.equal(await focused(page), "demo-miakeller .tile");
    assert.equal(
      await page.textContent("#problem"),
      "Autodarts can't be reached right now. Try again in a moment.",
    );
    assert.equal(await page.getAttribute("#problem", "role"), "alert");
    assert.equal(await page.textContent("#status"), "");
  });

  test("Manage accounts is a toggle, and the tiles step aside", async () => {
    await tabTo(page, "#manage", true);
    await press(page, "Enter");
    assert.equal(await focused(page), "#manage");
    assert.equal(await page.getAttribute("#manage", "aria-pressed"), "true");
    assert.equal(await page.textContent("#manage"), "Manage accounts");
    await press(page, "Tab");
    // The next stop is the first action of the first account, not its tile.
    assert.equal(await focused(page), "demo-miakeller .toggle-remember");
    assert.equal(
      await page.getAttribute('[data-id="demo-miakeller"] .menu', "aria-label"),
      "Mia Keller",
    );
    // The keys pick no player while the accounts are managed.
    await press(page, "2");
    assert.equal(
      await page.getAttribute(tile("lenavogt"), "aria-current"),
      "true",
    );
    assert.equal(await focused(page), "demo-miakeller .toggle-remember");
  });

  test("Remember password opens its form, and Cancel leads back", async () => {
    await press(page, "Enter");
    assert.equal(await focused(page), "demo-miakeller .cred-username");
    await tabTo(page, control("miakeller", ".cancel-remember"));
    await press(page, "Enter");
    assert.equal(await focused(page), "demo-miakeller .toggle-remember");
    assert.equal(
      await page.locator(control("miakeller", ".remember")).isVisible(),
      false,
    );
  });

  test("a saved password leads back to its toggle, which now forgets it", async () => {
    await press(page, "Enter");
    await page.keyboard.type("mia@example.com");
    await press(page, "Tab");
    await page.keyboard.type("not-a-real-password");
    await tabTo(page, control("miakeller", ".save-remember"));
    await press(page, "Enter");
    assert.equal(await focused(page), "demo-miakeller .toggle-remember");
    assert.equal(
      await page.textContent(control("miakeller", ".toggle-remember")),
      "Forget password",
    );
  });

  test("Forget password keeps the focus on its toggle", async () => {
    await press(page, "Enter");
    assert.equal(await focused(page), "demo-miakeller .toggle-remember");
    assert.equal(
      await page.textContent(control("miakeller", ".toggle-remember")),
      "Remember password",
    );
  });

  test("Esc in the question before a removal keeps the account and the focus", async () => {
    await tabTo(page, control("jonasberg", ".remove"));
    await press(page, "Enter");
    assert.equal(await page.locator("dialog[open]").count(), 1);
    // The safe answer has the focus.
    assert.equal(await focused(page), ".link");
    await press(page, "Escape");
    assert.equal(await page.locator("dialog").count(), 0);
    assert.equal(await focused(page), "demo-jonasberg .remove");
  });

  test("a removal leads to the account in its place, and the last one to the one before", async () => {
    await press(page, "Enter");
    await press(page, "Tab");
    await press(page, "Enter");
    assert.equal(await page.locator(tile("jonasberg")).count(), 0);
    assert.equal(await focused(page), "demo-lenavogt .remove");
    await press(page, "Enter");
    await press(page, "Tab");
    await press(page, "Enter");
    assert.equal(await focused(page), "demo-miakeller .remove");
  });

  test("Manage accounts pressed again brings the tiles back", async () => {
    await tabTo(page, "#manage", true);
    await press(page, "Enter");
    assert.equal(await page.getAttribute("#manage", "aria-pressed"), "false");
    await press(page, "Tab");
    assert.equal(await focused(page), "demo-miakeller .tile");
  });

  test("Add account keeps the focus, and Cancel of the notice leads back to it", async () => {
    await tabTo(page, "#add");
    await press(page, "Enter");
    assert.equal(await focused(page), "#add");
    assert.equal(await page.locator("#adding").isVisible(), true);
    await tabTo(page, "#stop-adding", true);
    await press(page, "Enter");
    assert.equal(await page.locator("#adding").isVisible(), false);
    assert.equal(await focused(page), "#add");
    assert.deepEqual(page.errors, []);
  });
});

describe("the popup in the settings of the system", {
  skip: browser === null,
}, () => {
  test("a contrast theme keeps the player who plays and the chips apart", async () => {
    const page = await open({ forcedColors: "active" });
    const looks = await page.evaluate(() =>
      [".profile.active", ".profile:not(.active)", ".chip.playing"].map(
        (selector) => {
          const style = getComputedStyle(document.querySelector(selector));
          return {
            color: style.borderTopColor,
            width: style.borderTopWidth,
            background: style.backgroundColor,
          };
        },
      ),
    );
    const [active, other, chip] = looks;
    assert.notEqual(active.color, other.color);
    assert.equal(active.width, "3px");
    assert.notEqual(chip.background, "rgba(0, 0, 0, 0)");
    const inside = await page.evaluate(
      () =>
        getComputedStyle(document.querySelector(".profile.active .name"))
          .forcedColorAdjust,
    );
    assert.equal(
      inside,
      "auto",
      "the text of the active tile keeps the colors of the contrast theme",
    );
    await page.context().close();
  });

  test("reduced motion leaves no transition", async () => {
    const page = await open();
    const durations = await page.evaluate(() =>
      [...document.querySelectorAll("*")]
        .map((element) => getComputedStyle(element).transitionDuration)
        .filter((value) => value !== "0s"),
    );
    assert.deepEqual(durations, []);
    await page.context().close();
  });
});
