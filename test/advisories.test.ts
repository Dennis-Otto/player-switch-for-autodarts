import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

// The advisories of the tools that only the checks run. Two of them reach
// scripts/check-firefox.mjs through addons-linter, which pins its dependencies exactly:
//
// - minimatch: package.json moves it to a fixed version with an override, so these tests
//   show that the override holds and that the rules of addons-linter still run with it.
// - deepmerge: no fixed version exists, so osv-scanner.toml accepts the advisory. These
//   tests keep its reason true, and fail on the update that ends it.
const require = createRequire(import.meta.url);
const ROOT = new URL("../", import.meta.url);
const text = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, ROOT)), "utf8");

type Locked = {
  version: string;
  dev?: boolean;
  dependencies?: Record<string, string>;
};
const locked: Record<string, Locked> = JSON.parse(
  text("package-lock.json"),
).packages;

const DEEPMERGE_ADVISORY = "GHSA-gcqx-w48m-w2h4";

test("no version of minimatch below the fix of its advisory is installed", () => {
  const versions = Object.entries(locked)
    .filter(([path]) => path.endsWith("node_modules/minimatch"))
    .map(([, entry]) => entry.version);
  assert.notEqual(versions.length, 0);
  for (const version of versions) {
    const [major = 0, minor = 0, patch = 0] = version.split(".").map(Number);
    assert.ok(
      major > 11 || (major === 11 && (minor > 0 || patch >= 1)),
      `minimatch ${version} has GHSA-g3hv-75wg-m249, which 11.0.1 fixes: see overrides in package.json.`,
    );
  }
});

test("the acceptance of deepmerge ends with the update that moves it", () => {
  const entry = locked["node_modules/deepmerge"];
  assert.equal(
    entry?.version,
    "4.3.1",
    `deepmerge moved: remove ${DEEPMERGE_ADVISORY} from osv-scanner.toml and .github/dependency-review.yml, and this test.`,
  );
  assert.equal(entry.dev, true, "deepmerge must stay a tool of the checks");
  assert.deepEqual(
    Object.entries(locked)
      .filter(([, other]) => other.dependencies?.deepmerge)
      .map(([path]) => path),
    ["node_modules/addons-linter"],
    "the reason in osv-scanner.toml names addons-linter alone",
  );
  assert.equal(
    locked[""]?.dependencies,
    undefined,
    "the package ships no dependency",
  );
});

test("osv-scanner.toml and the dependency review accept the same advisories", () => {
  const scanner = text("osv-scanner.toml").replace(/\r\n/g, "\n");
  const review = text(".github/dependency-review.yml").replace(/\r\n/g, "\n");
  const accepted = [...scanner.matchAll(/^id = "(.+)"$/gm)].map((m) => m[1]);
  assert.deepEqual(accepted, [DEEPMERGE_ADVISORY]);
  assert.deepEqual(
    [...review.matchAll(/^ {2}- (GHSA-\S+)$/gm)].map((m) => m[1]),
    accepted,
  );
  for (const block of scanner.split("[[IgnoredVulns]]").slice(1)) {
    assert.match(block, /^ignoreUntil = \d{4}-\d{2}-\d{2}$/m);
    assert.match(block, /^reason = """deepmerge 4\.3\.1: /m);
  }
});

describe("addons-linter on a hostile manifest", () => {
  // A manifest from somebody who wants to reach the merge, and a script for one of the
  // rules that ESLint runs in addons-linter.
  const MARKER = "reached-the-merge";
  const manifest = `{
    "manifest_version": 3,
    "name": "${MARKER}",
    "version": "1.0",
    "__proto__": { "${MARKER}": true },
    "background": { "scripts": ["background.js"], "__proto__": { "${MARKER}": true } }
  }`;
  const merged: unknown[][] = [];
  let folder = "";
  let codes: string[] = [];

  before(async () => {
    // addons-linter takes deepmerge by require, and so from this cache.
    const path = require.resolve("deepmerge");
    const real = require(path);
    const cached = require.cache[path];
    assert.ok(cached);
    cached.exports = Object.assign((...args: unknown[]) => {
      merged.push(args);
      return real(...args);
    }, real);

    folder = mkdtempSync(join(tmpdir(), "advisories-"));
    writeFileSync(join(folder, "manifest.json"), manifest);
    writeFileSync(join(folder, "background.js"), 'eval("1");\n');
    const linter = require("addons-linter") as {
      createInstance(options: object): {
        run(): Promise<{
          errors: { code: string }[];
          warnings: { code: string }[];
        }>;
      };
    };
    const results = await linter
      .createInstance({
        config: {
          _: [`${folder}/`],
          logLevel: "fatal",
          stack: false,
          pretty: false,
          warningsAsErrors: false,
          metadata: false,
          output: "none",
          boring: true,
          selfHosted: false,
          minManifestVersion: 3,
          maxManifestVersion: 3,
        },
        runAsBinary: false,
      })
      .run();
    codes = [...results.errors, ...results.warnings].map(({ code }) => code);
  });

  after(() => rmSync(folder, { recursive: true, force: true }));

  test("the rules of addons-linter still run with the minimatch of the override", () => {
    assert.ok(codes.includes("DANGEROUS_EVAL"), `found ${codes.join(", ")}`);
  });

  test("addons-linter merges its own schemas with deepmerge, never a manifest", () => {
    assert.notEqual(merged.length, 0, "the linter no longer calls deepmerge");
    assert.ok(
      !merged.some((args) => JSON.stringify(args).includes(MARKER)),
      "a manifest reaches deepmerge: the reason in osv-scanner.toml is no longer true",
    );
  });
});
