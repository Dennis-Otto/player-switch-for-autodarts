// Tests that the manifest promises only the browsers that a check runs: the job
// oldest-browsers of the workflow Upstream runs the end-to-end tests in the oldest
// Chrome for Testing and the tests in Firefox in the oldest Firefox ESR that
// extension/manifest.json allows, and the job firefox-beta runs the tests in Firefox in
// the next Firefox, as chrome-beta does in the next Chrome. A change of
// `minimum_chrome_version` or of `strict_min_version` changes the versions of the job
// with it, and the other way round.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { readWorkflow } from "./workflow.ts";

const manifest = JSON.parse(
  readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"),
) as {
  minimum_chrome_version: string;
  browser_specific_settings: { gecko: { strict_min_version: string } };
};

const upstream = readWorkflow("upstream.yml");

/** The value of a variable of a job, from its `env:` of the job. */
const variable = (job: string, name: string): string => {
  const line = upstream
    .jobLines(job)
    .find((line) => line.startsWith(`      ${name}: `));
  assert.ok(line, `the job "${job}" sets ${name}`);
  return line.slice(`      ${name}: `.length).trim();
};

/** The script lines of a job, without its comments. */
const scriptOf = (job: string): string =>
  upstream
    .jobLines(job)
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");

test("the oldest Chrome that a check runs is the one that the manifest allows", () => {
  const version = variable("oldest-browsers", "OLDEST_CHROME");
  // A full version of Chrome for Testing, so that the job needs no list of versions.
  assert.match(version, /^\d+\.\d+\.\d+\.\d+$/);
  assert.equal(version.split(".")[0], manifest.minimum_chrome_version);
});

test("the oldest Firefox that a check runs is the ESR that the manifest allows", () => {
  const version = variable("oldest-browsers", "OLDEST_FIREFOX");
  // An ESR, which a kiosk stays on for a year, as Mozilla's archive names it.
  assert.match(version, /^\d+\.\d+(\.\d+)?esr$/);
  const major = version.split(".")[0];
  assert.equal(
    manifest.browser_specific_settings.gecko.strict_min_version,
    `${major}.0`,
  );
});

test("the job oldest-browsers runs both kinds of tests in those versions", () => {
  const script = scriptOf("oldest-browsers");
  assert.ok(script.includes('install "chrome@$OLDEST_CHROME"'));
  assert.ok(script.includes('install "firefox@esr_$OLDEST_FIREFOX"'));
  assert.ok(script.includes("E2E_CHROME_PATH=$chrome"));
  assert.ok(script.includes("E2E_FIREFOX_PATH=$firefox"));
  assert.ok(script.includes("run: npm run e2e\n"));
  assert.ok(script.includes("run: npm run e2e:firefox\n"));
});

test("the job firefox-beta runs the tests in Firefox in the next Firefox", () => {
  const script = scriptOf("firefox-beta");
  assert.ok(script.includes("install firefox@beta"));
  assert.ok(script.includes("E2E_FIREFOX_PATH=$firefox"));
  assert.ok(script.includes("run: npm run e2e:firefox\n"));
});
