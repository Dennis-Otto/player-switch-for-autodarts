import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// scripts/check-locales.mjs, run against a made-up extension: the language files, a page
// and a script, each of which a test changes in one way.
const SCRIPT = fileURLToPath(
  new URL("../scripts/check-locales.mjs", import.meta.url),
);

type Messages = Record<
  string,
  { message?: string; placeholders?: Record<string, { content: string }> }
>;

const NAME = { name: { content: "$1" } };
const EN: Messages = {
  locale: { message: "en" },
  title: { message: "Who's playing?" },
  remove: { message: "Remove account" },
  accounts: { message: "Accounts" },
  hint: { message: "Kept on this computer & nowhere else." },
  error: { message: "Something went wrong." },
  switching: { message: "Switching to $NAME$…", placeholders: NAME },
};
const DE: Messages = {
  locale: { message: "de" },
  title: { message: "Wer spielt?" },
  remove: { message: "Konto entfernen" },
  accounts: { message: "Konten" },
  hint: { message: "Bleibt auf diesem Computer und sonst nirgends." },
  error: { message: "Etwas ist schiefgelaufen." },
  switching: { message: "Wechsel zu $NAME$…", placeholders: NAME },
};
const NL: Messages = {
  locale: { message: "nl" },
  title: { message: "Wie speelt er?" },
  remove: { message: "Account verwijderen" },
  accounts: { message: "Accounts" },
  hint: { message: "Blijft op deze computer en nergens anders." },
  error: { message: "Er ging iets mis." },
  switching: { message: "Wisselen naar $NAME$…", placeholders: NAME },
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
const SCRIPT_JS = `document.documentElement.lang = t("locale");\nshowStatus(t("error"));\nshowStatus(t("switching", name));\n`;

/** Each language by the name of its folder: its messages, the raw text of its file, or null for a folder without one. */
type Languages = Record<string, Messages | string | null>;

interface Extension {
  languages?: Languages;
  page?: string;
  script?: string;
  /** The code of src/, by its path there, which the check reads as a second folder. */
  code?: Record<string, string>;
}

/** Runs the check against a made-up extension and answers its exit code and its words. */
function check({
  languages = { en: EN, de: DE },
  page = PAGE,
  script = SCRIPT_JS,
  code,
}: Extension = {}) {
  const root = mkdtempSync(join(tmpdir(), "check-locales-"));
  const source = join(root, "src");
  try {
    for (const [code, messages] of Object.entries(languages)) {
      mkdirSync(join(root, "_locales", code), { recursive: true });
      if (messages !== null) {
        writeFileSync(
          join(root, "_locales", code, "messages.json"),
          typeof messages === "string" ? messages : JSON.stringify(messages),
        );
      }
    }
    writeFileSync(join(root, "popup.html"), page);
    writeFileSync(join(root, "popup.js"), script);
    for (const [path, text] of Object.entries(code ?? {})) {
      mkdirSync(join(source, path, ".."), { recursive: true });
      writeFileSync(join(source, path), text);
    }
    const folders = code === undefined ? [root] : [root, source];
    const run = spawnSync(process.execPath, [SCRIPT, ...folders], {
      encoding: "utf8",
    });
    return { status: run.status, output: `${run.stdout}${run.stderr}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** The messages with one of them replaced, or taken out with undefined. */
function changed(
  messages: Messages,
  key: string,
  entry: Messages[string] | undefined,
): Messages {
  const copy: Messages = { ...messages };
  if (entry === undefined) {
    delete copy[key];
  } else {
    copy[key] = entry;
  }
  return copy;
}

test("an extension whose texts all agree passes, with entities and white space as a person reads them", () => {
  const { status, output } = check();
  assert.equal(status, 0, output);
  assert.match(output, /The 2 languages \(de, en\) define the same 7 messages/);
});

test("every folder of _locales is a language that is checked, not only English and German", () => {
  const { status, output } = check({
    languages: {
      en: EN,
      de: DE,
      nl: NL,
      pt_BR: changed(NL, "locale", { message: "pt-BR" }),
    },
  });
  assert.equal(status, 0, output);
  assert.match(output, /The 4 languages \(de, en, nl, pt_BR\)/);
  const missing = check({
    languages: { en: EN, de: DE, nl: changed(NL, "hint", undefined) },
  });
  assert.equal(missing.status, 1);
  assert.match(
    missing.output,
    /nl is missing "hint"; Chrome shows the English text in its place/,
  );
});

test("the messages that the code of src/ asks for count, in every folder of it, and only its TypeScript", () => {
  const { status, output } = check({
    script: "",
    code: {
      "worker.ts": 'log(t("error"));\n',
      // Biome breaks a long call: the key then stands on a line of its own.
      "pages/players.ts": 't(\n  "missing",\n);\n',
      "notes.md": 't("other")',
    },
  });
  assert.equal(status, 1);
  assert.match(
    output,
    /src\/pages\/players\.ts uses "missing", which no message defines/,
  );
  assert.doesNotMatch(output, /"other"/);
  assert.doesNotMatch(output, /"error" is used nowhere/);
});

test("a message that nothing uses fails", () => {
  const { status, output } = check({
    languages: {
      en: { ...EN, done: { message: "Done" } },
      de: { ...DE, done: { message: "Fertig" } },
    },
  });
  assert.equal(status, 1);
  assert.match(
    output,
    /the message "done" is used nowhere; remove it from every language/,
  );
});

test("a message of one language alone fails", () => {
  const extra = check({
    languages: { en: EN, de: { ...DE, extra: { message: "Mehr" } } },
  });
  assert.equal(extra.status, 1);
  assert.match(extra.output, /de has "extra", which English doesn't/);
  const missing = check({
    languages: { en: EN, de: changed(DE, "hint", undefined) },
  });
  assert.equal(missing.status, 1);
  assert.match(missing.output, /de is missing "hint"/);
});

test("a translation that drops or renames a placeholder fails, as the name of the player would go missing", () => {
  const dropped = check({
    languages: {
      en: EN,
      de: DE,
      nl: changed(NL, "switching", {
        message: "Wisselen…",
        placeholders: NAME,
      }),
    },
  });
  assert.equal(dropped.status, 1);
  assert.match(
    dropped.output,
    /nl: the message "switching" shows the placeholders none, but in English \$NAME\$/,
  );
  const renamed = check({
    languages: {
      en: EN,
      de: changed(DE, "switching", {
        message: "Wechsel zu $NAMEN$…",
        placeholders: { namen: { content: "$1" } },
      }),
    },
  });
  assert.equal(renamed.status, 1);
  assert.match(
    renamed.output,
    /de: the message "switching" shows the placeholders \$NAMEN\$, but in English \$NAME\$/,
  );
});

test("a placeholder without a definition, or with another content than in English, fails", () => {
  const bare = check({
    languages: {
      en: EN,
      de: changed(DE, "switching", { message: "Wechsel zu $NAME$…" }),
    },
  });
  assert.equal(bare.status, 1);
  assert.match(
    bare.output,
    /de: the message "switching" shows \$NAME\$, which its placeholders don't define/,
  );
  const other = check({
    languages: {
      en: EN,
      de: changed(DE, "switching", {
        message: "Wechsel zu $NAME$…",
        placeholders: { name: { content: "$2" } },
      }),
    },
  });
  assert.equal(other.status, 1);
  assert.match(
    other.output,
    /de: the placeholder \$NAME\$ of "switching" stands for "\$2", but in English for "\$1"/,
  );
});

test("a placeholder is the same in any case, as Chrome reads it", () => {
  const { status, output } = check({
    languages: {
      en: EN,
      de: changed(DE, "switching", {
        message: "Wechsel zu $name$…",
        placeholders: { NAME: { content: "$1" } },
      }),
    },
  });
  assert.equal(status, 0, output);
});

test("a message without a text fails", () => {
  const { status, output } = check({
    languages: {
      en: EN,
      de: changed(DE, "error", { message: " " }),
      nl: changed(NL, "error", {}),
    },
  });
  assert.equal(status, 1);
  assert.match(output, /de: the message "error" has no text/);
  assert.match(output, /nl: the message "error" has no text/);
});

test('a "locale" that names another language than its folder fails, as a copy of English would keep "en"', () => {
  const { status, output } = check({
    languages: {
      en: EN,
      de: DE,
      nl: changed(NL, "locale", { message: "en" }),
    },
  });
  assert.equal(status, 1);
  assert.match(
    output,
    /nl: the message "locale" is "en"; it names the language of its folder, "nl"/,
  );
});

test("a folder that Chrome reads as no language, or one without its file, fails", () => {
  const { status, output } = check({
    languages: {
      en: EN,
      de: DE,
      "es-ES": changed(NL, "locale", { message: "es-ES" }),
      fr: null,
    },
  });
  assert.equal(status, 1);
  assert.match(
    output,
    /extension\/_locales\/es-ES is no language that Chrome reads/,
  );
  assert.match(output, /extension\/_locales\/fr\/messages\.json is missing/);
});

test("a language file that is no JSON fails, and without English nothing can be compared", () => {
  const broken = check({ languages: { en: EN, de: '{ "title": ' } });
  assert.equal(broken.status, 1);
  assert.match(
    broken.output,
    /extension\/_locales\/de\/messages\.json is no valid JSON/,
  );
  const english = check({ languages: { de: DE } });
  assert.equal(english.status, 1);
  assert.match(
    english.output,
    /extension\/_locales\/en\/messages\.json, the English texts that every language translates, can't be read/,
  );
  const none = check({ languages: {} });
  assert.equal(none.status, 1);
  assert.match(none.output, /the English texts .* can't be read/);
});

test("a key that no message defines fails", () => {
  const { status, output } = check({ script: `${SCRIPT_JS}t("gone");\n` });
  assert.equal(status, 1);
  assert.match(
    output,
    /extension\/popup\.js uses "gone", which no message defines/,
  );
});

test("a text of a page that drifts from its English message fails", () => {
  const { status, output } = check({
    page: PAGE.replace(">Remove account<", ">Remove<"),
  });
  assert.equal(status, 1);
  assert.match(
    output,
    /the text "Remove" of data-i18n="remove" differs from its message "Remove account"/,
  );
});

test("a name for screen readers that drifts from its English message fails", () => {
  const { status, output } = check({
    page: PAGE.replace('aria-label="Accounts"', 'aria-label="Players"'),
  });
  assert.equal(status, 1);
  assert.match(
    output,
    /the aria-label "Players" of data-i18n-label="accounts" differs from its message "Accounts"/,
  );
});

test("markup inside an element with a message fails, as the message would replace it", () => {
  const page = PAGE.replace(
    "Remove account</button>",
    "<span>Remove account</span></button>",
  );
  const { status, output } = check({ page });
  assert.equal(status, 1);
  assert.match(output, /the <button> of data-i18n="remove" holds markup/);
});

test("a key that no message defines is not compared with a text", () => {
  const { status, output } = check({
    page: `${PAGE}<p data-i18n="gone">Gone</p>\n<i data-i18n-label="gone" aria-label="Gone"></i>\n`,
  });
  assert.equal(status, 1);
  assert.match(output, /uses "gone", which no message defines/);
  assert.doesNotMatch(output, /differs/);
});

test("a message asked for over several lines counts as used, as Biome breaks a long call", () => {
  const { status, output } = check({
    languages: {
      en: { ...EN, renewed: { message: "Renewed" } },
      de: { ...DE, renewed: { message: "Erneuert" } },
    },
    script: `${SCRIPT_JS}t(\n  "renewed",\n  ago(profile.renewedAt, Date.now()),\n);\n`,
  });
  assert.equal(status, 0, output);
});

test("a key asked for over several lines that no message defines fails", () => {
  const { status, output } = check({
    script: `${SCRIPT_JS}t(\n  "missing",\n);\n`,
  });
  assert.equal(status, 1);
  assert.match(
    output,
    /extension\/popup\.js uses "missing", which no message defines/,
  );
});

test("the languages of the extension pass", () => {
  const codes = readdirSync(
    new URL("../extension/_locales/", import.meta.url),
  ).sort();
  const run = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  assert.ok(
    run.stdout.includes(`The ${codes.length} languages (${codes.join(", ")})`),
    run.stdout,
  );
});
