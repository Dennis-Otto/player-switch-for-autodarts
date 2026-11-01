// Tests what keeps this repository a Chrome extension of the blueprint (decision 0014):
// the settings under which the release builds the zip and the workflow Chrome Web Store
// runs, the sign-in without a stored secret, and that the package of the blueprint's
// scripts/package-extension.sh holds what scripts/check-firefox.mjs lints. The blueprint
// tests its scripts and its workflow itself. The run of the script needs bash with
// Python, as on the runner; on a computer without them it skips, other than in the CI.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, relative } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const root = (path: string): string =>
  fileURLToPath(new URL(`../${path}`, import.meta.url));

// By its address, as the scripts in JavaScript have no declarations for tsc.
const { shipped } = (await import(
  new URL("../scripts/check-firefox.mjs", import.meta.url).href
)) as { shipped: (path: string) => boolean };

const read = (path: string): string => readFileSync(root(path), "utf8");

const works = (command: string, ...args: string[]): boolean =>
  spawnSync(command, args, { encoding: "utf8" }).status === 0;

/** The Python of this computer: python3 on the runner, python on Windows. */
const python = ["python3", "python"].find((name) => works(name, "--version"));
const skipScript =
  (python !== undefined && works("bash", "-c", "true")) || process.env.CI
    ? false
    : "No bash with Python here: the run of the script skips; the CI runs it.";

describe("the kind of this repository", () => {
  test("is the Chrome extension of the blueprint", () => {
    assert.match(
      read(".copier-answers.yml"),
      /^project_type: chrome-extension$/m,
    );
  });

  // The release builds the zip and publish-store.yml runs only with this value.
  test("delivers to the Chrome Web Store, and no setting of the project says otherwise", () => {
    assert.match(
      read(".github/repository.toml"),
      /^PUBLISH_TO = "chrome-web-store"$/m,
    );
    assert.doesNotMatch(
      read(".github/repository.project.toml"),
      /^PUBLISH_TO/m,
    );
  });

  // build-release.yml keeps every *.zip for itself under this value, and refuses a zip
  // of the hook of the project, so the release would fail.
  test("has no hook of the project that builds a zip as well", () => {
    assert.equal(existsSync(root("scripts/release-assets.sh")), false);
  });

  // The workflow signs in with the OIDC token of GitHub (decision 0010), so that no
  // secret of the store is stored anywhere; the environment only keeps it to main.
  test("signs in to the store without a stored secret", () => {
    assert.match(
      read(".github/repository.toml"),
      /^\[environments\.chrome-web-store\]\nsecrets = \[\]$/m,
    );
    assert.doesNotMatch(
      read(".github/repository.project.toml"),
      /^\[environments\.chrome-web-store/m,
    );
    const workflow = read(".github/workflows/publish-store.yml");
    assert.match(workflow, /vars\.CWS_WORKLOAD_IDENTITY_PROVIDER/);
    assert.match(workflow, /vars\.CWS_SERVICE_ACCOUNT/);
    assert.match(workflow, /name: chrome-web-store/);
  });
});

/** The names of a zip, by the Python that the script of the zip runs in as well. */
const namesIn = (zip: string): string[] => {
  const result = spawnSync(
    python ?? "python3",
    [
      "-c",
      "import json, sys, zipfile\nprint(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))",
      zip,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as string[];
};

/** Every file below a folder, with forward slashes, relative to it. */
const filesIn = (folder: string): string[] =>
  readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      relative(folder, join(entry.parentPath, entry.name)).replaceAll(
        "\\",
        "/",
      ),
    )
    .sort();

describe("the package of the store", { skip: skipScript }, () => {
  test("holds the files of extension/ that the lint for Firefox reads, with the manifest at its root", () => {
    const dir = mkdtempSync(join(tmpdir(), "store-kind-"));
    try {
      const script = "scripts/package-extension.sh";
      mkdirSync(dirname(join(dir, script)), { recursive: true });
      copyFileSync(root(script), join(dir, script));
      copyFileSync(root("package.json"), join(dir, "package.json"));
      // The real extension, with what a build and a computer may leave beside it.
      cpSync(root("extension"), join(dir, "extension"), {
        recursive: true,
        filter: (source) => !source.endsWith(join("extension", "lib")),
      });
      // The npm of the script only pretends to build.
      const bin = join(dir, "bin");
      mkdirSync(bin);
      writeFileSync(
        join(bin, "npm"),
        `#!/usr/bin/env bash
mkdir -p extension/lib extension/.cache
touch extension/lib/background.js extension/lib/background.js.map \\
  extension/lib/background.d.ts extension/lib/tsconfig.build.json extension/.cache/old.js
`,
      );
      chmodSync(join(bin, "npm"), 0o755);
      const result = spawnSync("bash", [script, "out"], {
        cwd: dir,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
          SOURCE_DATE_EPOCH: "1800000000",
        },
      });
      assert.equal(result.status, 0, result.stderr);

      const manifest = JSON.parse(read("extension/manifest.json")) as {
        version: string;
      };
      const zip = `player-switch-for-autodarts-${manifest.version}.zip`;
      assert.deepEqual(readdirSync(join(dir, "out")), [zip]);
      const names = namesIn(join(dir, "out", zip));
      assert.ok(names.includes("manifest.json"));
      assert.ok(names.includes("lib/background.js"));
      assert.deepEqual(
        names.toSorted(),
        filesIn(join(dir, "extension")).filter((file) => shipped(file)),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
