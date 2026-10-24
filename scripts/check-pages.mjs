// Checks the pages of the extension against each other and against the manifest:
// every file that the manifest names exists, and the switcher in the Autodarts page,
// switcher.html, carries the same template of a tile as the popup, because both show
// the players through players.js. Run by scripts/check-project.sh; no dependencies.
import { existsSync, readFileSync } from "node:fs";

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
for (const path of named) {
  if (!existsSync(new URL(path, root))) {
    problems.push(
      `extension/manifest.json names ${path}, which extension/ lacks`,
    );
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
  `The manifest names ${named.length} files, all there, and the switcher shows tiles as the popup does.`,
);
