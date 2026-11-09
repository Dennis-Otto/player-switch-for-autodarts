// The accessibility of the popup, in a real browser: the popup.html of the extension
// with chrome-stub.js in place of Chrome and its made-up accounts, as the pictures of
// scripts/screenshots.sh show it (capture.py). axe-core checks the list, "Manage
// accounts", the form of a remembered password, the question before a removal, an
// error and the join of a lobby, in every language and both color schemes, the switcher in the Autodarts page
// and the welcome page of the install in every language; the page itself checks that
// every control is a target of 44 by 44 pixels, that no text is smaller than 12 pixels
// and that no button text breaks, and that no text of a tile is cut off, in the
// switcher on monitors upright and across at every zoom too. A walk with the
// keyboard alone through every action checks where the focus lands, and the contrast
// themes of the system and reduced motion get a look of their own.
//
// It runs the Chrome or Edge of this computer through playwright-core, which brings no
// browser of its own; CHROME_PATH points it at another one. Without one it skips, other
// than in the CI, where it fails. Every file comes from the repository through a route
// of the browser and every other request fails. Run by scripts/check-project.sh, or
// alone with `npm run test:a11y`, which builds extension/lib/ first.
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, relative, resolve } from "node:path";
import { after, before, suite, test } from "node:test";
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
  lobby = false,
  long = false,
  trouble = false,
  pointer = false,
  zoom = 1,
} = {}) {
  const context = await browser.newContext({
    viewport: { width: page === "popup" ? 340 : 1024, height: 720 },
    // The zoom of the page, or the scale of the screen: so many pixels of the screen
    // for each pixel of CSS.
    deviceScaleFactor: zoom,
    colorScheme: scheme,
    forcedColors,
    reducedMotion: "reduce",
    // A folder such as pt_BR is the tag pt-BR.
    locale: lang === "en" ? "en-US" : lang.replace("_", "-"),
    timezoneId: "Europe/Berlin",
  });
  await context.route("**/*", serve);
  await context.addInitScript({ path: STUB });
  const tab = await context.newPage();
  const errors = [];
  tab.on("pageerror", (error) => errors.push(error));
  await tab.goto(
    `${ORIGIN}/extension/${page}.html?lang=${lang}&accounts=${accounts}${pins ? "&pins=1" : ""}${manager ? "&manager=1" : ""}${lobby ? "&lobby=1" : ""}${long ? "&long=1" : ""}${trouble ? "&trouble=1" : ""}${pointer ? "&by=pointer" : ""}`,
  );
  // The options page draws its accounts also while a manager PIN keeps them hidden,
  // and the welcome page has its texts once its script has run, before the load.
  if (page === "options") {
    await tab.waitForSelector("#player-pins li", { state: "attached" });
  } else if (page !== "welcome") {
    await tab.waitForSelector("#profiles .tile");
  }
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

/**
 * The texts that the page cuts off: each piece of text that shows reaches beyond its
 * own element, or beyond an element around it that clips or scrolls what overflows it,
 * such as the card of an account, the panel of the switcher or the page itself, which
 * then scrolls sideways. One line for each, with the box that cuts it.
 */
function cut(page) {
  return page.evaluate(() => {
    const name = (element) =>
      `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${[...element.classList].map((kind) => `.${kind}`).join("")}`;
    const found = new Set();
    const texts = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    for (let node = texts.nextNode(); node !== null; node = texts.nextNode()) {
      const element = node.parentElement;
      if (node.textContent.trim() === "" || !element.checkVisibility()) {
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      const text = range.getBoundingClientRect();
      const words = node.textContent.trim().slice(0, 40);
      for (let box = element; box !== null; box = box.parentElement) {
        const clips =
          getComputedStyle(box).overflowX !== "visible" ||
          box === element ||
          box === document.documentElement;
        const edges =
          box === document.documentElement
            ? { left: 0, right: box.clientWidth }
            : box.getBoundingClientRect();
        if (
          clips &&
          (text.left < edges.left - 0.5 || text.right > edges.right + 0.5)
        ) {
          found.add(`"${words}" runs out of ${name(box)}`);
          break;
        }
        // A pixel for the rounding of scrollWidth, which counts whole pixels.
        if (clips && box !== element && box.scrollWidth > box.clientWidth + 1) {
          found.add(`"${words}" is in ${name(box)}, which overflows sideways`);
          break;
        }
      }
    }
    return [...found];
  });
}

/** Checks that the page cuts no text off in a view. */
async function whole(page, view) {
  assert.deepEqual(await cut(page), [], `${view} cuts texts off`);
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

// Every language of the extension, so that a long word of a translation that breaks a
// button or a text that a language misses shows here.
const LANGUAGES = readdirSync(
  new URL("../../extension/_locales/", import.meta.url),
).sort();

suite("the popup in axe-core", { skip: browser === null }, () => {
  for (const lang of LANGUAGES) {
    for (const scheme of ["light", "dark"]) {
      test(`every view, in ${lang} and ${scheme}`, async () => {
        const page = await open({ lang, scheme });
        // In its own language, not in the English that Chrome falls back to.
        assert.equal(
          await page.getAttribute("html", "lang"),
          lang.replace("_", "-"),
          `the popup shows ${lang} in English: add it to LANGUAGES in test/harness/chrome-stub.js`,
        );
        await check(page, "the list");

        // An error, read out at once: a switch that Autodarts can't take.
        await page.evaluate(() =>
          window.harness.refuse({ ok: false, reason: "unreachable" }),
        );
        await page.click(tile("jonasberg"));
        await settle(page);
        assert.notEqual(await page.textContent("#problem"), "");
        await check(page, "an error");

        // The question before a switch ends the match that runs in the page.
        await page.evaluate(() =>
          window.harness.refuse({ ok: false, reason: "match" }),
        );
        await page.click(tile("jonasberg"));
        await settle(page);
        assert.equal(await page.locator("dialog[open]").count(), 1);
        await check(page, "the question before ending a match");
        await page.click('dialog[open] button[value="cancel"]');
        await settle(page);
        assert.equal(await page.locator("dialog[open]").count(), 0);

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

suite("a lobby on the Autodarts page", { skip: browser === null }, () => {
  for (const lang of LANGUAGES) {
    test(`Join the lobby and In the lobby, in ${lang} and both color schemes`, async () => {
      for (const scheme of ["light", "dark"]) {
        const page = await open({ lang, scheme, lobby: true });
        // The player on the page offers no join; each parked one does.
        assert.equal(
          await page.isVisible(control("miakeller", ".join")),
          false,
        );
        assert.equal(await page.isVisible(control("jonasberg", ".join")), true);
        await check(page, `a lobby, ${scheme}`);

        await page.click(control("jonasberg", ".join"));
        await settle(page);
        assert.notEqual(await page.textContent("#status"), "");
        // The tile says so, and the quieter "Join again" stays below it.
        assert.equal(
          await page.isVisible(control("jonasberg", ".join.again")),
          true,
        );
        assert.equal(
          await page.isVisible(control("jonasberg", ".chip.lobby")),
          true,
        );
        await check(page, `a seat in the lobby, ${scheme}`);
        assert.deepEqual(page.errors, []);
        await page.context().close();
      }
    });
  }

  test("the switcher offers the join in its large tiles", async () => {
    for (const scheme of ["light", "dark"]) {
      const page = await open({ page: "switcher", scheme, lobby: true });
      await check(page, `the switcher on a lobby, ${scheme}`);
      await page.context().close();
    }
  });

  test("with the keyboard alone, a join keeps the focus on its button, which then offers to join again", async () => {
    const page = await open({ lobby: true });
    await tabTo(page, control("jonasberg", ".join"));
    // A screen reader hears whose seat it is; the words on the button come first.
    assert.equal(
      await page.getAttribute(control("jonasberg", ".join"), "aria-label"),
      "Join the lobby as Jonas Berg",
    );
    await press(page, "Enter");
    assert.equal(await focused(page), "demo-jonasberg .again");
    assert.equal(
      await page.textContent("#status"),
      "Jonas Berg is in the lobby now, and the match counts for their own account.",
    );
    // The same button now says "Join again", and keeps a seat that the player has.
    assert.equal(
      await page.getAttribute(control("jonasberg", ".join"), "aria-label"),
      "Join again as Jonas Berg",
    );
    await press(page, "Enter");
    assert.equal(await focused(page), "demo-jonasberg .again");
    assert.equal(
      await page.textContent("#status"),
      "Jonas Berg is still in the lobby: Autodarts kept the seat, so nothing changed.",
    );
    // In "Manage accounts", the join steps aside with the tiles.
    await tabTo(page, "#manage", true);
    await press(page, "Enter");
    assert.equal(await page.isVisible(control("lenavogt", ".join")), false);
    await page.context().close();
  });
});

/**
 * How the page marks the player who plays: the gaps between the tile of their card and
 * the frame around it, the border of the card, and each element inside the card that
 * draws a frame of its own, with an outline, a shadow or a border in the color of the
 * frame. One line for each.
 */
function frame(page) {
  return page.evaluate(() => {
    const name = (element) =>
      `${element.tagName.toLowerCase()}${[...element.classList].map((kind) => `.${kind}`).join("")}`;
    const card = document.querySelector(".profile.active");
    const tile = card.querySelector(".tile");
    const style = getComputedStyle(card);
    const box = card.getBoundingClientRect();
    const own = tile.getBoundingClientRect();
    const sides = ["Top", "Right", "Bottom", "Left"];
    const inward = { Top: 1, Right: -1, Bottom: -1, Left: 1 };
    const gaps = [];
    for (const side of sides) {
      const edge = side.toLowerCase();
      const inside =
        box[edge] +
        inward[side] * Number.parseFloat(style[`border${side}Width`]);
      if (Math.abs(own[edge] - inside) > 0.5) {
        gaps.push(
          `the tile ends at ${Math.round(own[edge])} px on the ${edge}, its frame at ${Math.round(inside)} px`,
        );
      }
    }
    const color = style.borderTopColor;
    const seconds = [];
    if (
      style.outlineStyle !== "none" &&
      Number.parseFloat(style.outlineWidth) > 0
    ) {
      seconds.push(`${name(card)} draws an outline around its frame`);
    }
    for (const element of card.querySelectorAll("*")) {
      if (!element.checkVisibility()) {
        continue;
      }
      const look = getComputedStyle(element);
      if (
        look.outlineStyle !== "none" &&
        Number.parseFloat(look.outlineWidth) > 0
      ) {
        seconds.push(`${name(element)} draws an outline`);
      }
      if (look.boxShadow !== "none") {
        seconds.push(`${name(element)} draws a shadow`);
      }
      if (
        sides.some(
          (side) =>
            look[`border${side}Style`] !== "none" &&
            Number.parseFloat(look[`border${side}Width`]) > 0 &&
            look[`border${side}Color`] === color,
        )
      ) {
        seconds.push(
          `${name(element)} draws a border in the color of the frame`,
        );
      }
    }
    return [...gaps, ...seconds];
  });
}

/**
 * The ring of the focus on the tile of the player who plays, once a key shows it: it
 * must show, and lie inside their frame with a gap, so that it stays apart from it.
 */
async function ring(page, view) {
  const look = await page.evaluate(() => {
    const tile = document.querySelector(".profile.active .tile");
    const style = getComputedStyle(tile);
    return {
      focused: document.activeElement === tile,
      visible: tile.matches(":focus-visible"),
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
      offset: Number.parseFloat(style.outlineOffset),
    };
  });
  assert.equal(
    look.focused,
    true,
    `the player who plays has the focus, ${view}`,
  );
  assert.equal(look.visible, true, `the focus shows, ${view}`);
  assert.equal(look.style, "solid", `the ring of the focus shows, ${view}`);
  assert.ok(look.width >= 2, `the ring of the focus is 2 px wide, ${view}`);
  assert.ok(
    -look.offset > look.width,
    `the ring of the focus lies inside the frame with a gap, ${view}`,
  );
}

// The tile of the player who plays had two frames in the switcher on the page of a
// lobby: the border of its card, stretched to the height of the card beside it with
// "Join the lobby", and the ring of the focus that the switcher gives the first tile,
// as high as the tile alone. The player who plays has one frame, around the whole tile,
// and the ring of the focus shows only for a keyboard, inside it.
suite("the player who plays has one frame", { skip: browser === null }, () => {
  for (const scheme of ["light", "dark"]) {
    test(`in the switcher opened with a tap on the page of a lobby, in ${scheme}`, async () => {
      const page = await open({
        page: "switcher",
        scheme,
        accounts: 2,
        lobby: true,
        pointer: true,
      });
      // A monitor upright, as at the board of the photo, and a screen across.
      for (const size of [
        { width: 1080, height: 1920 },
        { width: 1024, height: 720 },
      ]) {
        await page.setViewportSize(size);
        await settle(page);
        const view = `at ${size.width}x${size.height}, ${scheme}`;
        // The card beside has "Join the lobby" below its tile and is the taller one,
        // so the row stretches the card of the player who plays.
        assert.equal(await page.isVisible(control("jonasberg", ".join")), true);
        const heights = await page.$$eval("#profiles .profile", (cards) =>
          cards.map((card) => Math.round(card.getBoundingClientRect().height)),
        );
        assert.equal(
          new Set(heights).size,
          1,
          `the cards of the row are as high, ${view}`,
        );
        assert.deepEqual(
          await frame(page),
          [],
          `the player who plays has one frame, ${view}`,
        );
      }
      // The first key shows the ring of the focus, which the switcher gave the tile.
      await press(page, "Shift");
      await ring(page, `after a key, ${scheme}`);
      assert.deepEqual(page.errors, []);
      await page.context().close();
    });

    test(`in the switcher opened with a key, in ${scheme}`, async () => {
      const page = await open({
        page: "switcher",
        scheme,
        accounts: 2,
        lobby: true,
      });
      await ring(page, `at once, ${scheme}`);
      assert.deepEqual(page.errors, []);
      await page.context().close();
    });

    test(`in the popup on the page of a lobby, in ${scheme}`, async () => {
      const page = await open({ scheme, accounts: 2, lobby: true });
      assert.deepEqual(await frame(page), [], `the popup, ${scheme}`);
      await tabTo(page, tile("miakeller"));
      await ring(page, `the popup, ${scheme}`);
      assert.deepEqual(page.errors, []);
      await page.context().close();
    });
  }
});

// A tile cut "Passwort nicht mehr merken" off at "Passwort nicht mehr me" in the
// switcher on a monitor standing upright, at the width of four tiles in a row: every
// text of the tiles is whole on every screen, at every zoom and in every language.
// Physical pixels of a monitor upright and across; a zoom of the page or a scale of the
// screen leaves the page fewer pixels of CSS.
const MONITORS = [
  [1080, 1920],
  [1440, 2560],
  [1920, 1080],
];
const ZOOMS = [1, 1.25, 1.5];
// A window as narrow as a phone, and a tablet upright.
const WINDOWS = [
  [390, 844],
  [768, 1024],
];

suite("the texts of the tiles are whole", { skip: browser === null }, () => {
  /**
   * Shows the tiles of every kind one after the other: the player who plays, one who
   * has to sign in again and has a PIN, one in the lobby whose renewal fails and one
   * with a long name, with an error above them; then "Manage accounts", with the
   * longest texts of the actions, and the form of a remembered password. `look` sees
   * each view.
   */
  async function everyView(page, look) {
    await page.click(control("lenavogt", ".join"));
    await settle(page);
    await page.evaluate(() =>
      window.harness.refuse({ ok: false, reason: "unreachable" }),
    );
    await page.click(tile("samortiz"));
    await settle(page);
    assert.notEqual(await page.textContent("#problem"), "");
    await look("the list");
    await page.click("#manage");
    await settle(page);
    assert.equal(
      await page.isVisible(control("jonasberg", ".toggle-remember")),
      true,
    );
    await look('"Manage accounts"');
    await page.click(control("lenavogt", ".toggle-remember"));
    await settle(page);
    await look("the form of a remembered password");
  }

  for (const lang of LANGUAGES) {
    test(`in the switcher, in ${lang}, on monitors upright and across at every zoom, and in a narrow window`, async () => {
      for (const zoom of ZOOMS) {
        const page = await open({
          page: "switcher",
          lang,
          accounts: 4,
          pins: true,
          lobby: true,
          long: true,
          trouble: true,
          zoom,
        });
        const sizes = MONITORS.map(([width, height]) => ({
          width: Math.round(width / zoom),
          height: Math.round(height / zoom),
        }));
        if (zoom === 1) {
          sizes.push(...WINDOWS.map(([width, height]) => ({ width, height })));
        }
        await everyView(page, async (view) => {
          for (const size of sizes) {
            await page.setViewportSize(size);
            await settle(page);
            await whole(
              page,
              `the switcher, ${view}, at ${size.width}x${size.height} and ${zoom * 100} %`,
            );
          }
        });
        assert.deepEqual(page.errors, []);
        await page.context().close();
      }
    });

    test(`in the popup, in ${lang}`, async () => {
      const page = await open({
        lang,
        accounts: 4,
        pins: true,
        lobby: true,
        long: true,
        trouble: true,
      });
      await everyView(page, (view) => whole(page, `the popup, ${view}`));
      assert.deepEqual(page.errors, []);
      await page.context().close();
    });
  }
});

suite("the welcome page in axe-core", { skip: browser === null }, () => {
  for (const lang of LANGUAGES) {
    test(`every step, in ${lang} and both color schemes`, async () => {
      for (const scheme of ["light", "dark"]) {
        const page = await open({ page: "welcome", lang, scheme });
        assert.equal(
          await page.getAttribute("html", "lang"),
          lang.replace("_", "-"),
          `the welcome page shows ${lang} in English: add it to LANGUAGES in test/harness/chrome-stub.js`,
        );
        // Four steps, the last one shares the board, and its link leads to the entry
        // of the help that says why a player sees no board.
        assert.equal(await page.locator(".step").count(), 4);
        assert.match(
          await page.getAttribute("#share a[data-link=help]", "href"),
          /\/help\.html#board-not-shared$/,
        );
        await check(page, `the welcome page, ${lang}, ${scheme}`);
        assert.deepEqual(page.errors, []);
        await page.context().close();
      }
    });
  }
});

suite("the question for a PIN of the venue mode", {
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
            await tab.locator(`${tile("jonasberg")} .pin-mark`).count(),
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

suite("the options page with the venue mode", {
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

suite("the popup with the keyboard alone", {
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

suite("the popup in the settings of the system", {
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
