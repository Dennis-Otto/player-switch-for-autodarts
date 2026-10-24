import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const manifest = fileURLToPath(
  new URL("../extension/manifest.json", import.meta.url),
);

// release-please rewrites the manifest with JSON.stringify(…, null, 2) on every
// release pull request. When the file is in that format already, the rewrite only
// changes the version and Biome's check stays green (extension/biome.jsonc).
test("the manifest is in the format that release-please writes", () => {
  const text = readFileSync(manifest, "utf8").replace(/\r\n/g, "\n");
  assert.equal(text, `${JSON.stringify(JSON.parse(text), null, 2)}\n`);
});
