// Checks that the two language files carry the same keys, that every message the
// extension asks for exists, that every message is asked for somewhere, and that the
// pages show the English message where they carry a text or a name of their own, so
// that a page read before its texts arrive, or a screen reader, says the same. It reads
// every page and script of extension/ (not the built lib/) and the manifest. Run by
// scripts/check-project.sh, or with another folder of the same kind, for its tests, as
// node scripts/check-locales.mjs FOLDER; no dependencies.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const folder = process.argv[2];
const root =
  folder === undefined
    ? new URL("../extension/", import.meta.url)
    : pathToFileURL(`${resolve(folder)}/`);
const text = (path) => readFileSync(new URL(path, root), "utf8");
const en = JSON.parse(text("_locales/en/messages.json"));
const de = JSON.parse(text("_locales/de/messages.json"));

const problems = [];

const enKeys = new Set(Object.keys(en));
const deKeys = new Set(Object.keys(de));
for (const key of enKeys) {
  if (!deKeys.has(key)) {
    problems.push(`de is missing "${key}"`);
  }
}
for (const key of deKeys) {
  if (!enKeys.has(key)) {
    problems.push(`en is missing "${key}"`);
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
      `the message "${key}" is used nowhere; remove it from both languages`,
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
  nbsp: " ",
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
const english = (key) => plain(en[key].message);

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
  for (const problem of problems) {
    console.error(problem);
  }
  process.exit(1);
}
console.log(
  `Both languages define the same ${enKeys.size} messages, the ${files.length} files of the extension use every one, and its pages carry the English texts.`,
);
