import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type AccessLevel,
  fromExtension,
  fromExtensionPage,
  keepFromContentScripts,
} from "../src/trust.ts";

const ID = "abcdefghijklmnopabcdefghijklmnop";
const OTHER = "ponmlkjihgfedcbaponmlkjihgfedcba";
/** Where Chrome serves the pages of the extension, as `chrome.runtime.getURL("")` says. */
const PAGES = `chrome-extension://${ID}/`;
const GECKO_ID = "player-switch-for-autodarts@dennis-otto.github.io";
const UUID = "0b5f3a52-58e4-4c1a-9a2e-6d1f0f4c2b11";
const OTHER_UUID = "9d3c8e10-7a4b-4f21-8c5e-2b7a1e0d4f66";

test("fromExtension takes a message of this extension alone", () => {
  assert.ok(fromExtension({ id: ID, url: "https://play.autodarts.com/" }, ID));
  assert.ok(
    !fromExtension(
      { id: OTHER, url: `chrome-extension://${OTHER}/popup.html` },
      ID,
    ),
  );
  assert.ok(!fromExtension({ url: `chrome-extension://${ID}/popup.html` }, ID));
  // A worker whose id is unknown takes nothing, not even a sender without an id.
  assert.ok(!fromExtension({}, ""));
});

test("fromExtensionPage takes the popup and the switcher in its frame", () => {
  assert.ok(
    fromExtensionPage(
      { id: ID, url: `chrome-extension://${ID}/popup.html` },
      ID,
      PAGES,
    ),
  );
  assert.ok(
    fromExtensionPage(
      { id: ID, url: `chrome-extension://${ID}/switcher.html?x=1#y` },
      ID,
      PAGES,
    ),
  );
});

test("fromExtensionPage takes the pages of the extension in Firefox, whose address isn't its id", () => {
  // Firefox serves the pages from moz-extension://, under a random host of this
  // installation, while the id of the extension is the one of its manifest.
  const firefox = `moz-extension://${UUID}/`;
  assert.ok(
    fromExtensionPage(
      { id: GECKO_ID, url: `moz-extension://${UUID}/popup.html` },
      GECKO_ID,
      firefox,
    ),
  );
  assert.ok(
    fromExtensionPage(
      { id: GECKO_ID, url: `moz-extension://${UUID}/switcher.html?x=1` },
      GECKO_ID,
      firefox,
    ),
  );
  // The page of another add-on has another host, and the id alone is no page.
  assert.ok(
    !fromExtensionPage(
      { id: GECKO_ID, url: `moz-extension://${OTHER_UUID}/popup.html` },
      GECKO_ID,
      firefox,
    ),
  );
  assert.ok(
    !fromExtensionPage(
      { id: GECKO_ID, url: `moz-extension://${GECKO_ID}/popup.html` },
      GECKO_ID,
      firefox,
    ),
  );
  assert.ok(
    !fromExtensionPage(
      { id: GECKO_ID, url: `chrome-extension://${UUID}/popup.html` },
      GECKO_ID,
      firefox,
    ),
  );
});

test("fromExtensionPage turns away the content script in the Autodarts page", () => {
  // The content script sends with the id of the extension, but from the address of the page.
  assert.ok(
    !fromExtensionPage(
      { id: ID, url: "https://play.autodarts.com/" },
      ID,
      PAGES,
    ),
  );
  assert.ok(
    !fromExtensionPage(
      { id: ID, url: `https://play.autodarts.com/chrome-extension://${ID}/` },
      ID,
      PAGES,
    ),
  );
  // Not even where the address of the pages is wrongly that of a web page.
  assert.ok(
    !fromExtensionPage(
      { id: ID, url: "https://play.autodarts.com/" },
      ID,
      "https://play.autodarts.com/",
    ),
  );
});

test("fromExtensionPage turns away a page of another extension, or one that names no page", () => {
  assert.ok(
    !fromExtensionPage(
      { id: OTHER, url: `chrome-extension://${OTHER}/popup.html` },
      ID,
      PAGES,
    ),
  );
  // A page of another extension can't take the id of this one in its address either.
  assert.ok(
    !fromExtensionPage(
      { id: ID, url: `chrome-extension://${OTHER}/popup.html` },
      ID,
      PAGES,
    ),
  );
  assert.ok(
    !fromExtensionPage(
      { id: ID, url: `chrome-extension://${ID}.example.org/popup.html` },
      ID,
      PAGES,
    ),
  );
  assert.ok(!fromExtensionPage({ id: ID }, ID, PAGES));
  assert.ok(!fromExtensionPage({ id: ID, url: "not an address" }, ID, PAGES));
  assert.ok(
    !fromExtensionPage(
      { url: `chrome-extension://${ID}/popup.html` },
      ID,
      PAGES,
    ),
  );
  // Without the address of its own pages, or with one that names no host, no page is
  // one of the extension.
  assert.ok(
    !fromExtensionPage(
      { id: ID, url: "chrome-extension:///popup.html" },
      ID,
      "chrome-extension:///",
    ),
  );
  assert.ok(
    !fromExtensionPage(
      { id: ID, url: `chrome-extension://${ID}/popup.html` },
      ID,
      "",
    ),
  );
});

/**
 * A storage area as Chrome keeps it: the service worker and the pages of the
 * extension read it always, a content script only while the access level lets it.
 */
function fakeLocalArea() {
  let level: AccessLevel = "TRUSTED_AND_UNTRUSTED_CONTEXTS";
  const data: Record<string, unknown> = {
    accounts: { version: 1, profiles: [{ refreshToken: "secret" }] },
  };
  return {
    area: {
      setAccessLevel: async (options: { accessLevel: AccessLevel }) => {
        level = options.accessLevel;
      },
    },
    get level() {
      return level;
    },
    async read(context: "trusted" | "content script") {
      if (context === "content script" && level === "TRUSTED_CONTEXTS") {
        throw new Error("Access to storage is not allowed from this context.");
      }
      return data;
    },
  };
}

test("keepFromContentScripts takes the saved accounts out of the reach of the content script", async () => {
  const local = fakeLocalArea();
  // Chrome's default, which the worker changes.
  assert.deepEqual(Object.keys(await local.read("content script")), [
    "accounts",
  ]);

  await keepFromContentScripts(local.area);

  assert.equal(local.level, "TRUSTED_CONTEXTS");
  await assert.rejects(local.read("content script"), /not allowed/);
  assert.deepEqual(Object.keys(await local.read("trusted")), ["accounts"]);
});

test("keepFromContentScripts fails where the browser can't limit the storage", async () => {
  await assert.rejects(
    keepFromContentScripts({}),
    /can't keep the storage from the content scripts/,
  );
  await assert.rejects(
    keepFromContentScripts({
      setAccessLevel: () =>
        Promise.reject(new Error("This StorageArea doesn't support it.")),
    }),
    /doesn't support it/,
  );
});
