import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../scripts/check-locales.mjs", import.meta.url),
);

/**
 * Runs the check of the languages on an extension with the given messages, in both
 * languages, and the given files. The check reads the extension beside its own
 * folder, so a copy of it runs next to an extension of the test's own.
 */
function checkLocales(messages: string[], files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "check-locales-"));
  try {
    mkdirSync(join(root, "scripts"));
    copyFileSync(script, join(root, "scripts", "check-locales.mjs"));
    const catalog = JSON.stringify(
      Object.fromEntries(messages.map((key) => [key, { message: key }])),
    );
    for (const language of ["en", "de"]) {
      const folder = join(root, "extension", "_locales", language);
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, "messages.json"), catalog);
    }
    for (const [name, source] of Object.entries(files)) {
      writeFileSync(join(root, "extension", name), source);
    }
    return spawnSync(
      process.execPath,
      [join(root, "scripts", "check-locales.mjs")],
      { encoding: "utf8" },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("the check of the languages finds a message asked for over several lines, as Biome breaks a long call", () => {
  const result = checkLocales(["renewed"], {
    "players.js":
      't(\n  "renewed",\n  renewedAgo(profile.renewedAt, Date.now(), language),\n);\n',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /define the same 1 messages/);
});

test("the check of the languages reports a message that no file asks for", () => {
  const result = checkLocales(["renewed", "unused"], {
    "players.js": 't("renewed");\n',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /the message "unused" is used nowhere/);
});

test("the check of the languages reports a message asked for over several lines that no language defines", () => {
  const result = checkLocales([], { "players.js": 't(\n  "missing",\n);\n' });
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /extension\/players\.js uses "missing", which no message defines/,
  );
});
