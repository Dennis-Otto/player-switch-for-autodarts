// Checks that the two language files carry the same keys, that every message the
// extension asks for exists, and that every message is asked for somewhere. It reads
// every page and script of extension/ (not the built lib/) and the manifest. Run by
// scripts/check-project.sh; no dependencies.
import { readdirSync, readFileSync } from "node:fs";

const root = new URL("../extension/", import.meta.url);
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

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(problem);
  }
  process.exit(1);
}
console.log(
  `Both languages define the same ${enKeys.size} messages, and the ${files.length} files of the extension use every one.`,
);
