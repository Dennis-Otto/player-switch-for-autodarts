// Checks that the two language files carry the same keys and that every message the
// popup and the service worker ask for exists. Run by scripts/check-project.sh; no
// dependencies.
import { readFileSync } from "node:fs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const en = read("extension/_locales/en/messages.json");
const de = read("extension/_locales/de/messages.json");

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

const sources = ["extension/popup.js", "extension/popup.html", "extension/background.js"].map((path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8"),
);
const used = new Set();
for (const source of sources) {
  for (const match of source.matchAll(/\bt\("([A-Za-z]+)"/g)) {
    used.add(match[1]);
  }
  for (const match of source.matchAll(/data-i18n="([A-Za-z]+)"/g)) {
    used.add(match[1]);
  }
}
for (const key of used) {
  if (!enKeys.has(key)) {
    problems.push(`the extension uses "${key}", which no message defines`);
  }
}

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(problem);
  }
  process.exit(1);
}
console.log(`Both languages define the same ${enKeys.size} messages.`);
