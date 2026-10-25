// Checks the pages of the extension against each other and against the manifest:
// every file that the manifest names exists, and every script that a page loads, also
// those in lib/, which `npm run build` writes from src/ (scripts/check.sh builds it
// first), and the switcher in the Autodarts page, switcher.html, carries the same
// template of a tile as the popup, because both show the players through
// src/pages/players.ts. Run by scripts/check-project.sh; no dependencies.
import { existsSync, readdirSync, readFileSync } from "node:fs";

const root = new URL("../extension/", import.meta.url);
const text = (path) => readFileSync(new URL(path, root), "utf8");
const manifest = JSON.parse(text("manifest.json"));

const problems = [];

const named = [
  manifest.action.default_popup,
  manifest.options_ui.page,
  manifest.background.service_worker,
  ...Object.values(manifest.icons),
  ...manifest.content_scripts.flatMap((script) => script.js),
  ...manifest.web_accessible_resources.flatMap((entry) => entry.resources),
];
// The files of lib/ come from the build, so a missing one there asks for it.
const lacks = (path) =>
  path.startsWith("lib/")
    ? `${path}, which extension/ lacks; build it with npm run build`
    : `${path}, which extension/ lacks`;
for (const path of named) {
  if (!existsSync(new URL(path, root))) {
    problems.push(`extension/manifest.json names ${lacks(path)}`);
  }
}

const pages = readdirSync(root).filter((name) => name.endsWith(".html"));
let scripts = 0;
for (const page of pages) {
  for (const [, path] of text(page).matchAll(
    /<script\b[^>]*\bsrc="([^"]+)"/g,
  )) {
    scripts += 1;
    if (!existsSync(new URL(path, root))) {
      problems.push(`extension/${page} loads ${lacks(path)}`);
    }
  }
}

const template = (page) =>
  text(page).match(/<template id="profile-template">[\s\S]*?<\/template>/)?.[0];
const popup = template("popup.html");
if (popup === undefined) {
  problems.push(
    'extension/popup.html lacks the template of a tile, <template id="profile-template">',
  );
} else if (template("switcher.html") !== popup) {
  problems.push(
    "the template of a tile in extension/switcher.html differs from the one in popup.html; copy it over",
  );
}

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(problem);
  }
  process.exit(1);
}
console.log(
  `The manifest names ${named.length} files and the pages load ${scripts} scripts, all there, and the switcher shows tiles as the popup does.`,
);
