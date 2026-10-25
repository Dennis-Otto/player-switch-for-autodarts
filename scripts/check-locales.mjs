// Checks the texts of the extension in every language of extension/_locales. Each
// language carries the messages of English, the language that the manifest falls back
// to, and no other; each message has a text, shows the same placeholders as in English,
// such as $NAME$, and defines each one with the same content, so that no translation
// drops the name of a player or shows another value in its place; and the message
// "locale" names the folder of its language, as it sets the language of the pages and
// the format of names and times. Every message that the extension asks for exists,
// every message is asked for somewhere, and the pages show the English message where
// they carry a text or a name of their own, so that a page read before its texts
// arrive, or a screen reader, says the same. It reads every page and script of
// extension/ (not the built lib/) and the manifest. scripts/check-manifest.mjs checks
// the lengths that the store allows for the name and the description in each language.
// Run by scripts/check-project.sh, or with another folder of the same kind, for its
// tests, as node scripts/check-locales.mjs FOLDER; no dependencies.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const folder = process.argv[2];
const root =
  folder === undefined
    ? new URL("../extension/", import.meta.url)
    : pathToFileURL(`${resolve(folder)}/`);
const text = (path) => readFileSync(new URL(path, root), "utf8");

/** The language of the source texts, which every other one translates. */
const SOURCE = "en";
/** The name of a folder of _locales that Chrome reads, such as nl, pt_BR or es_419. */
const LOCALE_CODE = /^[a-z]{2,3}(?:_(?:[A-Z]{2}|\d{3}))?$/;

const problems = [];

/** Prints the problems and fails. */
function fail() {
  for (const problem of problems) {
    console.error(problem);
  }
  process.exit(1);
}

// The messages of each language, by the name of its folder.
const catalogs = new Map();
const locales = new URL("_locales/", root);
const codes = existsSync(locales)
  ? readdirSync(locales, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  : [];
for (const code of codes) {
  const path = `_locales/${code}/messages.json`;
  if (!LOCALE_CODE.test(code)) {
    problems.push(
      `extension/_locales/${code} is no language that Chrome reads; name the folder by a code such as nl, pt_BR or es_419`,
    );
  }
  if (!existsSync(new URL(path, root))) {
    problems.push(`extension/${path} is missing`);
    continue;
  }
  try {
    catalogs.set(code, JSON.parse(text(path)));
  } catch (error) {
    problems.push(`extension/${path} is no valid JSON: ${error.message}`);
  }
}
const en = catalogs.get(SOURCE);
if (en === undefined) {
  problems.push(
    `extension/_locales/${SOURCE}/messages.json, the English texts that every language translates, can't be read`,
  );
  fail();
}
const enKeys = new Set(Object.keys(en));

/** The text of a message, or "" when it has none. */
const textOf = (entry) =>
  typeof entry?.message === "string" ? entry.message : "";

/** The placeholders that a message shows, such as $NAME$, in capitals, as Chrome reads them in any case. */
const shown = (entry) =>
  [
    ...new Set(
      [...textOf(entry).matchAll(/\$([A-Za-z0-9_@]+)\$/g)].map((match) =>
        match[1].toUpperCase(),
      ),
    ),
  ].sort();

/** The placeholders that a message defines, by their names in capitals, with their content. */
const defined = (entry) =>
  new Map(
    Object.entries(entry?.placeholders ?? {}).map(([name, placeholder]) => [
      name.toUpperCase(),
      placeholder?.content,
    ]),
  );

const list = (names) =>
  names.length === 0 ? "none" : names.map((name) => `$${name}$`).join(", ");

for (const [code, messages] of catalogs) {
  for (const [key, entry] of Object.entries(messages)) {
    if (textOf(entry).trim() === "") {
      problems.push(
        `${code}: the message "${key}" has no text; Chrome shows nothing in its place`,
      );
    }
    const definitions = defined(entry);
    for (const name of shown(entry)) {
      if (!definitions.has(name)) {
        problems.push(
          `${code}: the message "${key}" shows $${name}$, which its placeholders don't define; define it as English does`,
        );
      }
    }
  }
  // "locale" sets the language of the pages and of names and times, as BCP 47 writes it.
  const expected = code.replace("_", "-");
  if (enKeys.has("locale") && textOf(messages.locale) !== expected) {
    problems.push(
      `${code}: the message "locale" is "${textOf(messages.locale)}"; it names the language of its folder, "${expected}", which sets the language of the pages and the format of names and times`,
    );
  }
  if (code === SOURCE) {
    continue;
  }
  const keys = new Set(Object.keys(messages));
  for (const key of enKeys) {
    if (!keys.has(key)) {
      problems.push(
        `${code} is missing "${key}"; Chrome shows the English text in its place`,
      );
    }
  }
  for (const key of keys) {
    if (!enKeys.has(key)) {
      problems.push(
        `${code} has "${key}", which English doesn't; add it to English first, or remove it`,
      );
    }
  }
  for (const key of [...enKeys].filter((key) => keys.has(key))) {
    const source = shown(en[key]);
    const translated = shown(messages[key]);
    if (source.join() !== translated.join()) {
      problems.push(
        `${code}: the message "${key}" shows the placeholders ${list(translated)}, but in English ${list(source)}; each one stands for a value, such as the name of a player, so keep those of English`,
      );
    }
    const theirs = defined(messages[key]);
    for (const [name, content] of defined(en[key])) {
      if (theirs.has(name) && theirs.get(name) !== content) {
        problems.push(
          `${code}: the placeholder $${name}$ of "${key}" stands for ${JSON.stringify(theirs.get(name))}, but in English for ${JSON.stringify(content)}; it would show another value`,
        );
      }
    }
  }
}

// Where a key is asked for: t("key") in a script, also with the key on a line of its
// own as Biome breaks a long call, data-i18n="key" for a text and
// data-i18n-label="key" for a name in a page, __MSG_key__ in the manifest.
const patterns = [
  /\bt\(\s*"([A-Za-z]+)"/g,
  /\bdata-i18n(?:-label)?="([A-Za-z]+)"/g,
  /__MSG_([A-Za-z]+)__/g,
];
const files = readdirSync(root).filter(
  (name) => /\.(?:html|js)$/.test(name) || name === "manifest.json",
);
const used = new Map();
for (const file of files) {
  const source = text(file);
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      used.set(match[1], used.get(match[1]) ?? file);
    }
  }
}
for (const [key, file] of used) {
  if (!enKeys.has(key)) {
    problems.push(`extension/${file} uses "${key}", which no message defines`);
  }
}
for (const key of enKeys) {
  if (!used.has(key)) {
    problems.push(
      `the message "${key}" is used nowhere; remove it from every language`,
    );
  }
}

// The text of a page as a person reads it: its entities decoded, its white space as one.
const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
const plain = (html) =>
  html
    .replace(
      /&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi,
      (whole, decimal, hex, name) => {
        if (decimal !== undefined) {
          return String.fromCodePoint(Number(decimal));
        }
        if (hex !== undefined) {
          return String.fromCodePoint(Number.parseInt(hex, 16));
        }
        return ENTITIES[name.toLowerCase()] ?? whole;
      },
    )
    .replace(/\s+/g, " ")
    .trim();
const english = (key) => plain(textOf(en[key]));

// The texts that the pages carry themselves: translate() of players.js puts the message
// in their place as the page starts, so each must read as the English message, and an
// element with a data-i18n key holds text only, which translate() would replace.
const opening = /<([a-z][\w-]*)\b([^>]*)>/gi;
for (const file of files.filter((name) => name.endsWith(".html"))) {
  const source = text(file);
  for (const match of source.matchAll(opening)) {
    const [tagText, tag, attributes] = match;
    const name = attributes.match(/\bdata-i18n-label="([A-Za-z]+)"/)?.[1];
    const label = attributes.match(/\baria-label="([^"]*)"/)?.[1];
    if (
      enKeys.has(name) &&
      label !== undefined &&
      plain(label) !== english(name)
    ) {
      problems.push(
        `extension/${file}: the aria-label "${plain(label)}" of data-i18n-label="${name}" differs from its message "${english(name)}"`,
      );
    }
    const key = attributes.match(/\bdata-i18n="([A-Za-z]+)"/)?.[1];
    if (!enKeys.has(key)) {
      continue;
    }
    const rest = source.slice(match.index + tagText.length);
    const content = rest.match(/^[^<]*/)[0];
    if (
      !rest
        .slice(content.length)
        .toLowerCase()
        .startsWith(`</${tag.toLowerCase()}>`)
    ) {
      problems.push(
        `extension/${file}: the <${tag}> of data-i18n="${key}" holds markup, which its message replaces; give the text an element of its own`,
      );
    } else if (plain(content) !== "" && plain(content) !== english(key)) {
      problems.push(
        `extension/${file}: the text "${plain(content)}" of data-i18n="${key}" differs from its message "${english(key)}"`,
      );
    }
  }
}

if (problems.length > 0) {
  fail();
}
console.log(
  `The ${catalogs.size} languages (${[...catalogs.keys()].join(", ")}) define the same ${enKeys.size} messages with the same placeholders, the ${files.length} files of the extension use every one, and its pages carry the English texts.`,
);
