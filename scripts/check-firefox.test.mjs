// The self-test of scripts/check-firefox.mjs, with made-up results of addons-linter.
// scripts/check-project.sh runs it with `node --test` before the check itself.
import assert from "node:assert/strict";
import { test } from "node:test";

import { ACCEPTED, judge, shipped } from "./check-firefox.mjs";

/** The warning that the extension accepts, as addons-linter reports it. */
const IGNORED = {
  code: "BACKGROUND_SERVICE_WORKER_IGNORED",
  message: "Unsupported manifest property ignored by Firefox.",
  file: "manifest.json",
};

test("results with no error and only the accepted warnings pass", () => {
  assert.deepEqual(judge({ errors: [], warnings: [IGNORED], notices: [] }), []);
  // A notice is no problem.
  assert.deepEqual(
    judge({ warnings: [IGNORED], notices: [{ code: "SOME_NOTICE" }] }),
    [],
  );
});

test("every error fails, with its file, line, code and text", () => {
  const problems = judge({
    errors: [
      {
        code: "ADDON_ID_REQUIRED",
        message: "The add-on ID is required.",
        description: ["See the docs.", "Really."],
        file: "manifest.json",
      },
      {
        code: "JSON_INVALID",
        message: "Bad JSON.",
        file: "_locales/de/messages.json",
        line: 3,
      },
      { code: "NO_FILE", message: "Somewhere." },
    ],
    warnings: [IGNORED],
  });
  assert.deepEqual(problems, [
    "manifest.json: error ADDON_ID_REQUIRED: The add-on ID is required. See the docs. Really.",
    "_locales/de/messages.json:3: error JSON_INVALID: Bad JSON.",
    "extension/: error NO_FILE: Somewhere.",
  ]);
});

test("a warning that the list doesn't accept fails", () => {
  const problems = judge({
    warnings: [
      IGNORED,
      {
        code: "UNSAFE_VAR_ASSIGNMENT",
        message: "Unsafe assignment to innerHTML",
        description: "Can lead to security issues.",
        file: "popup.js",
        line: 12,
      },
    ],
  });
  assert.deepEqual(problems, [
    "popup.js:12: warning UNSAFE_VAR_ASSIGNMENT: Unsafe assignment to innerHTML Can lead to security issues.",
  ]);
});

test("an accepted warning that addons-linter no longer reports fails, so the list stays true", () => {
  const problems = judge({});
  assert.equal(problems.length, Object.keys(ACCEPTED).length);
  assert.match(
    problems[0],
    /no longer warns BACKGROUND_SERVICE_WORKER_IGNORED/,
  );
  assert.deepEqual(judge({ warnings: [] }, {}), []);
});

test("every accepted warning says why it may stay", () => {
  for (const [code, reason] of Object.entries(ACCEPTED)) {
    assert.match(code, /^[A-Z_]+$/);
    assert.ok(reason.length > 40, code);
  }
});

test("the lint leaves out what the package leaves out", () => {
  assert.ok(shipped("manifest.json"));
  assert.ok(shipped("lib/switch.js"));
  assert.ok(shipped("_locales/en/messages.json"));
  assert.ok(!shipped("lib/switch.js.map"));
  assert.ok(!shipped("biome.jsonc"));
  assert.ok(!shipped("lib\\biome.jsonc"));
  assert.ok(shipped("not-biome.jsonc.txt"));
});
