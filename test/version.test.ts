// The foot of the switcher in the Autodarts page and of the popup shows which version
// of Player Switch runs, from the manifest of the copy that runs (src/pages/dom.ts):
// the real pages of extension/, in happy-dom, with a fake `chrome` that fills in the
// texts of extension/_locales/ as Chrome does. The end-to-end tests show the same in a
// real Chrome and Firefox.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { afterEach, test } from "node:test";

import { showVersion } from "../src/pages/dom.ts";

/** A window of happy-dom: the DOM of a browser, which closes again after a test. */
type PageWindow = Window &
  typeof globalThis & { happyDOM: { close(): Promise<void> } };

// As in content.test.ts: the types of happy-dom need a newer @types/node than the
// Node 24 of this project has, so a specifier that isn't a literal keeps the module
// out of the type check, and the test takes its window as the DOM of the TypeScript lib.
const HAPPY_DOM: string = "happy-dom";
const { Window: HappyWindow } = (await import(HAPPY_DOM)) as {
  Window: new () => PageWindow;
};

const EXTENSION = new URL("../extension/", import.meta.url);
const read = (path: string): string =>
  readFileSync(new URL(path, EXTENSION), "utf8");

/** The version in the manifest of the extension, as a release writes it. */
const VERSION = (JSON.parse(read("manifest.json")) as { version: string })
  .version;

/** The languages of the extension, by the names of their folders. */
const LANGUAGES = readdirSync(new URL("_locales/", EXTENSION));

interface Message {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

/** chrome.i18n.getMessage of one language, with its placeholders filled in as Chrome does. */
function messagesOf(language: string) {
  const messages = JSON.parse(
    read(`_locales/${language}/messages.json`),
  ) as Record<string, Message>;
  return (key: string, substitution?: string): string => {
    const entry = messages[key];
    assert.ok(entry, `${language} has no message "${key}"`);
    let text = entry.message;
    for (const [name, { content }] of Object.entries(
      entry.placeholders ?? {},
    )) {
      const filled = content.replace("$1", substitution ?? "");
      text = text.replaceAll(new RegExp(`\\$${name}\\$`, "gi"), filled);
    }
    return text;
  };
}

/** Puts a fake `chrome` in place: the texts of a language and a manifest of a version. */
function runAs(language: string, version: string, versionName?: string): void {
  (globalThis as { chrome?: unknown }).chrome = {
    i18n: { getMessage: messagesOf(language) },
    runtime: {
      getManifest: () => ({
        ...JSON.parse(read("manifest.json")),
        version,
        ...(versionName === undefined ? {} : { version_name: versionName }),
      }),
    },
  };
}

const opened: PageWindow[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((window) => window.happyDOM.close()));
});

/** A page of the extension, its HTML as it ships, parsed without running its scripts. */
function open(page: string): Document {
  const window = new HappyWindow();
  opened.push(window);
  return new window.DOMParser().parseFromString(read(page), "text/html");
}

for (const page of ["switcher.html", "popup.html"]) {
  test(`${page} shows the version of the manifest, in every language`, () => {
    for (const language of LANGUAGES) {
      runAs(language, VERSION);
      const document = open(page);
      showVersion(document);
      const shown = document.querySelector("#version");
      assert.ok(shown, `${page} has no #version`);
      assert.equal(shown.textContent, `Player Switch ${VERSION}`, language);
    }
  });

  test(`${page} takes the version from the manifest of the copy that runs`, () => {
    runAs("en", "9.8.7");
    const document = open(page);
    showVersion(document);
    assert.equal(
      document.querySelector("#version")?.textContent,
      "Player Switch 9.8.7",
    );
  });
}

test("a beta shows its full number from version_name, as chrome://extensions does", () => {
  // scripts/package-extension.sh packages 1.6.0-beta.2 as version 1.6.0 with the
  // full number in version_name; the board has to tell one beta from the next.
  for (const page of ["switcher.html", "popup.html"]) {
    runAs("en", "1.6.0", "1.6.0-beta.2");
    const document = open(page);
    showVersion(document);
    assert.equal(
      document.querySelector("#version")?.textContent,
      "Player Switch 1.6.0-beta.2",
      page,
    );
  }
});

test("the switcher shows the version beside the hint of the keys, not inside it", () => {
  // A touch screen hides the hint of the keys (switcher.css), and the board of a
  // display is mostly one, so the version has to stand on its own.
  runAs("en", VERSION);
  const document = open("switcher.html");
  showVersion(document);
  const version = document.querySelector("#version");
  assert.ok(version);
  assert.equal(version.closest("#keys"), null);
  assert.equal(
    version.parentElement,
    document.querySelector("#keys")?.parentElement,
  );
});
