import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// scripts/check-locales.mjs, run against a made-up extension: the language files, a page
// and a script, each of which a test changes in one way.
const SCRIPT = fileURLToPath(new URL("../scripts/check-locales.mjs", import.meta.url));

type Messages = Record<string, { message: string }>;

const EN: Messages = {
  title: { message: "Who's playing?" },
  remove: { message: "Remove account" },
  accounts: { message: "Accounts" },
  hint: { message: "Kept on this computer & nowhere else." },
  error: { message: "Something went wrong." },
};
const DE: Messages = {
  title: { message: "Wer spielt?" },
  remove: { message: "Konto entfernen" },
  accounts: { message: "Konten" },
  hint: { message: "Bleibt auf diesem Computer und sonst nirgends." },
  error: { message: "Etwas ist schiefgelaufen." },
};
const PAGE = `<!doctype html>
<title data-i18n="title">Who&#39;s playing?</title>
<h1 data-i18n="title">Who's
  playing?</h1>
<ul data-i18n-label="accounts" aria-label="Accounts"></ul>
<button class="remove" data-i18n="remove">Remove account</button>
<p class="hint" data-i18n="hint">Kept on this computer &amp; nowhere else.</p>
<p data-i18n="remove"></p>
`;
const SCRIPT_JS = `showStatus(t("error"));\n`;

interface Extension {
  en?: Messages;
  de?: Messages;
  page?: string;
  script?: string;
}

/** Runs the check against a made-up extension and answers its exit code and its words. */
function check({ en = EN, de = DE, page = PAGE, script = SCRIPT_JS }: Extension = {}) {
  const root = mkdtempSync(join(tmpdir(), "check-locales-"));
  try {
    for (const [language, messages] of [
      ["en", en],
      ["de", de],
    ] as const) {
      mkdirSync(join(root, "_locales", language), { recursive: true });
      writeFileSync(join(root, "_locales", language, "messages.json"), JSON.stringify(messages));
    }
    writeFileSync(join(root, "popup.html"), page);
    writeFileSync(join(root, "popup.js"), script);
    const run = spawnSync(process.execPath, [SCRIPT, root], { encoding: "utf8" });
    return { status: run.status, output: `${run.stdout}${run.stderr}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("an extension whose texts all agree passes, with entities and white space as a person reads them", () => {
  const { status, output } = check();
  assert.equal(status, 0, output);
  assert.match(output, /Both languages define the same 5 messages/);
});

test("a message that nothing uses fails", () => {
  const { status, output } = check({ en: { ...EN, done: { message: "Done" } }, de: { ...DE, done: { message: "Fertig" } } });
  assert.equal(status, 1);
  assert.match(output, /the message "done" is used nowhere; remove it from both languages/);
});

test("a message of one language alone fails", () => {
  const extra = check({ de: { ...DE, extra: { message: "Mehr" } } });
  assert.equal(extra.status, 1);
  assert.match(extra.output, /en is missing "extra"/);
  const missing = check({ de: Object.fromEntries(Object.entries(DE).filter(([key]) => key !== "hint")) });
  assert.equal(missing.status, 1);
  assert.match(missing.output, /de is missing "hint"/);
});

test("a key that no message defines fails", () => {
  const { status, output } = check({ script: `${SCRIPT_JS}t("gone");\n` });
  assert.equal(status, 1);
  assert.match(output, /extension\/popup\.js uses "gone", which no message defines/);
});

test("a text of a page that drifts from its English message fails", () => {
  const { status, output } = check({ page: PAGE.replace(">Remove account<", ">Remove<") });
  assert.equal(status, 1);
  assert.match(output, /the text "Remove" of data-i18n="remove" differs from its message "Remove account"/);
});

test("a name for screen readers that drifts from its English message fails", () => {
  const { status, output } = check({ page: PAGE.replace('aria-label="Accounts"', 'aria-label="Players"') });
  assert.equal(status, 1);
  assert.match(output, /the aria-label "Players" of data-i18n-label="accounts" differs from its message "Accounts"/);
});

test("markup inside an element with a message fails, as the message would replace it", () => {
  const page = PAGE.replace("Remove account</button>", "<span>Remove account</span></button>");
  const { status, output } = check({ page });
  assert.equal(status, 1);
  assert.match(output, /the <button> of data-i18n="remove" holds markup/);
});

test("a key that no message defines is not compared with a text", () => {
  const { status, output } = check({ page: `${PAGE}<p data-i18n="gone">Gone</p>\n<i data-i18n-label="gone" aria-label="Gone"></i>\n` });
  assert.equal(status, 1);
  assert.match(output, /uses "gone", which no message defines/);
  assert.doesNotMatch(output, /differs/);
});
