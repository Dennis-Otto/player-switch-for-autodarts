// Tests that one version of Playwright runs the browser tests, and that the cache of the
// workflow E2E holds the Chromium of that version.
//
// `npx playwright install` is the CLI of @playwright/test, through playwright, and
// downloads the Chromium that its playwright-core asks for. The accessibility test,
// test/harness/a11y.mjs, imports playwright-core itself. When package.json gives
// playwright-core a range, lock file maintenance moves the top-level copy ahead of
// @playwright/test, npm keeps a second copy inside playwright, and the two need
// different builds of Chromium. The workflow then saved the Chromium of one version
// under the key of the other, and the next update of Playwright restored a cache without
// the browser that it starts. So package.json pins playwright-core to the version of
// @playwright/test, which Renovate moves in one group with it, and the workflow keys its
// cache on the version of @playwright/test.
//
// The pictures of scripts/screenshots.sh are taken by the Chromium of the Playwright
// image that the script names, which the playwright of test/harness/requirements.txt
// drives; Playwright supports a driver only with the browser of its own version. The
// group "Playwright" of .github/renovate.json5 moves the image, that playwright and
// @playwright/test together, but an image of mcr.microsoft.com has no release date, so
// it may come a week before the packages, which wait a week after their release: this
// test then holds the pull request of Renovate until they have joined it, and the
// pictures and the end-to-end tests keep seeing one Chromium.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { suite, test } from "node:test";
import { fileURLToPath } from "node:url";
import { readWorkflow } from "./workflow.ts";

const ROOT = new URL("../", import.meta.url);
const json = (path: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, ROOT)), "utf8"));

const manifest: { devDependencies: Record<string, string> } =
  json("package.json");
const locked: Record<string, { version?: string }> =
  json("package-lock.json").packages;

/** The first group of a pattern in a file of the repository, or undefined. */
const find = (path: string, pattern: RegExp): string | undefined =>
  pattern.exec(readFileSync(fileURLToPath(new URL(path, ROOT)), "utf8"))?.[1];

const FIX =
  'Pin "playwright-core" in package.json to the exact version of "@playwright/test" and run npm install.';

/** The versions of a package in the lock file, by the folder of each copy. */
const copies = (name: string): Record<string, string | undefined> =>
  Object.fromEntries(
    Object.entries(locked)
      .filter(([folder]) => folder.endsWith(`node_modules/${name}`))
      .map(([folder, entry]) => [folder, entry.version]),
  );

const playwright = locked["node_modules/@playwright/test"]?.version;

suite("Playwright", () => {
  test("package.json pins @playwright/test to one version", () => {
    assert.match(
      manifest.devDependencies["@playwright/test"] ?? "",
      /^\d+\.\d+\.\d+$/,
    );
    assert.equal(manifest.devDependencies["@playwright/test"], playwright);
  });

  test("package.json pins playwright-core to the version of @playwright/test", () => {
    assert.equal(manifest.devDependencies["playwright-core"], playwright, FIX);
  });

  test("the lock file holds one copy of playwright and of playwright-core, at the version of @playwright/test", () => {
    assert.deepEqual(
      copies("playwright"),
      { "node_modules/playwright": playwright },
      FIX,
    );
    assert.deepEqual(
      copies("playwright-core"),
      { "node_modules/playwright-core": playwright },
      FIX,
    );
  });

  test("the Playwright image of scripts/screenshots.sh, the playwright that drives it and @playwright/test are one version", () => {
    const image = find(
      "scripts/screenshots.sh",
      /^image="mcr\.microsoft\.com\/playwright\/python:v(\d+\.\d+\.\d+)-[a-z]+@sha256:[0-9a-f]{64}"$/m,
    );
    const driver = find("test/harness/requirements.in", /^playwright==(\S+)$/m);
    const locked = find(
      "test/harness/requirements.txt",
      /^playwright==(\S+) \\$/m,
    );
    assert.deepEqual(
      { image, driver, locked },
      { image: playwright, driver: playwright, locked: playwright },
      `Move the image of scripts/screenshots.sh (v${playwright}-noble, with its digest) and playwright== in test/harness/requirements.in to ${playwright}, the version of @playwright/test, then compile requirements.txt again with the command in its header.`,
    );
  });

  test("the workflow E2E keys the cache of the browser on the version of @playwright/test", () => {
    const e2e = readWorkflow("e2e.yml");
    const version = e2e.step("browser", "Find the version of Playwright");
    const path =
      /jq -r '\.packages\["([^"]+)"\]\.version' package-lock\.json/.exec(
        version.run,
      )?.[1];
    assert.equal(path, "node_modules/@playwright/test");
    assert.equal(version.id, "playwright");

    const key = e2e
      .jobLines("browser")
      .find((line) => line.trimStart().startsWith("key: playwright-"))
      ?.trim();
    // The prefix of the time when the key followed the top-level playwright-core
    // comes back never: those caches may hold the Chromium of another version.
    assert.equal(
      key,
      `key: playwright-\${{ runner.os }}-chromium-\${{ steps.playwright.outputs.version }}`,
    );
  });
});
