// Tests the zip that a release ships and the store gets (decision 0013): how
// scripts/release-assets.sh and scripts/package-extension.sh make it, in a small copy of
// the project with a fake npm, and how the job "package" of
// .github/workflows/publish-store.yml takes it from the release, with a fake gh. The
// scripts run in bash with Python, and the job with jq and unzip, as on the runner; on a
// computer without them those tests skip, other than in the CI.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { readWorkflow } from "./workflow.ts";

const { jobLines, step } = readWorkflow("publish-store.yml");
const TAKE = "Take the zip of the release and check its provenance";
const ZIP = "player-switch-for-autodarts-1.2.0.zip";

const root = (path: string): string =>
  fileURLToPath(new URL(`../${path}`, import.meta.url));

const works = (command: string, ...args: string[]): boolean =>
  spawnSync(command, args, { encoding: "utf8" }).status === 0;

/** The Python of this computer: python3 on the runner, python on Windows. */
const python = ["python3", "python"].find((name) => works(name, "--version"));
const hasBash = works("bash", "-c", "command -v unzip");
const skipScripts =
  (python !== undefined && hasBash) || process.env.CI
    ? false
    : "No bash with Python and unzip here: the runs of the scripts skip; the CI runs them.";
const skipJob =
  skipScripts === false &&
  (works("bash", "-c", "command -v jq") || process.env.CI)
    ? false
    : "No bash with Python, unzip and jq here: the runs of the job skip; the CI runs them.";

/** The files of a zip, by the name that it keeps them under. */
const contents = (zip: string): Record<string, string> => {
  const result = spawnSync(
    python ?? "python3",
    [
      "-c",
      "import json, sys, zipfile\n" +
        "archive = zipfile.ZipFile(sys.argv[1])\n" +
        "print(json.dumps({i.filename: archive.read(i).decode() for i in archive.infolist()}))",
      zip,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as Record<string, string>;
};

const MANIFEST = {
  manifest_version: 3,
  name: "__MSG_name__",
  version: "1.2.0",
};

/** Runs a test in a small copy of the project, whose npm only records its calls. */
const inProject = <T>(
  run: (dir: string, script: (name: string, ...args: string[]) => Script) => T,
  npm = 'echo "$*" >> "$FAKE_NPM"\n',
): T => {
  const dir = mkdtempSync(join(tmpdir(), "release-zip-"));
  try {
    for (const file of [
      "scripts/package-extension.sh",
      "scripts/release-assets.sh",
    ]) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      copyFileSync(root(file), join(dir, file));
    }
    const files = {
      "extension/manifest.json": `${JSON.stringify(MANIFEST, null, 2)}\n`,
      "extension/popup.html": "<!doctype html>\n",
      "extension/biome.jsonc": "{}\n",
      "extension/lib/background.js": "export {};\n",
      "extension/lib/background.js.map": "{}\n",
      "extension/_locales/en/messages.json": "{}\n",
    };
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), text);
    }
    const bin = join(dir, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "npm"), `#!/usr/bin/env bash\n${npm}`);
    chmodSync(join(bin, "npm"), 0o755);
    const record = join(dir, "npm-calls");
    writeFileSync(record, "");
    const script = (name: string, ...args: string[]): Script => {
      const result = spawnSync("bash", [`scripts/${name}.sh`, ...args], {
        cwd: dir,
        encoding: "utf8",
        env: {
          PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
          FAKE_NPM: record,
          SOURCE_DATE_EPOCH: "1800000000",
        },
      });
      return {
        status: result.status,
        stdout: result.stdout.trim(),
        stderr: result.stderr,
        npm: readFileSync(record, "utf8"),
      };
    };
    return run(dir, script);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

interface Script {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly npm: string;
}

describe("the zip of a release", { skip: skipScripts }, () => {
  test("holds the build of extension/, with the manifest at its root", () => {
    inProject((dir, script) => {
      const result = script("release-assets", join(dir, "out"), "1.2.0");
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.npm, "run --silent build\n");
      assert.deepEqual(readdirSync(join(dir, "out")), [ZIP]);
      assert.equal(result.stdout.split("/").at(-1), ZIP);
      const files = contents(join(dir, "out", ZIP));
      assert.deepEqual(Object.keys(files), [
        "_locales/en/messages.json",
        "lib/background.js",
        "manifest.json",
        "popup.html",
      ]);
      assert.deepEqual(JSON.parse(files["manifest.json"] ?? ""), MANIFEST);
    });
  });

  test("has a name that GitHub keeps, as build-release.yml asks", () => {
    inProject((dir, script) => {
      script("release-assets", join(dir, "out"), "1.3.0-beta.2");
      const [name] = readdirSync(join(dir, "out"));
      assert.match(name ?? "", /^[A-Za-z0-9]([A-Za-z0-9._+-]*[A-Za-z0-9])?$/);
    });
  });

  test("is the same, byte for byte, for the same commit", () => {
    inProject((dir, script) => {
      const hash = (): string =>
        createHash("sha256")
          .update(readFileSync(join(dir, "out", ZIP)))
          .digest("hex");
      script("release-assets", join(dir, "out"), "1.2.0");
      const first = hash();
      // A checkout gives each file the time of the checkout, which must not count.
      utimesSync(
        join(dir, "extension/popup.html"),
        1_900_000_000,
        1_900_000_000,
      );
      script("release-assets", join(dir, "out"), "1.2.0");
      assert.equal(hash(), first);
    });
  });

  test("of a beta takes the numbers as its version, and the whole as version_name", () => {
    inProject((dir, script) => {
      const result = script("release-assets", join(dir, "out"), "1.3.0-beta.2");
      assert.equal(result.status, 0, result.stderr);
      const files = contents(
        join(dir, "out", "player-switch-for-autodarts-1.3.0-beta.2.zip"),
      );
      assert.deepEqual(JSON.parse(files["manifest.json"] ?? ""), {
        ...MANIFEST,
        version: "1.3.0",
        version_name: "1.3.0-beta.2",
      });
      // The manifest of the checkout stays as it is.
      assert.equal(
        JSON.parse(readFileSync(join(dir, "extension/manifest.json"), "utf8"))
          .version,
        "1.2.0",
      );
    });
  });

  for (const [what, version, message] of [
    [
      "a release whose version the manifest doesn't have",
      "1.2.1",
      "extension/manifest.json has the version 1.2.0, the release 1.2.1",
    ],
    ["something that is no version", "latest", "latest is no version"],
  ] as const) {
    test(`fails for ${what}, and writes no zip`, () => {
      inProject((dir, script) => {
        const result = script("release-assets", join(dir, "out"), version);
        assert.equal(result.status, 1);
        assert.match(result.stderr, new RegExp(message));
        assert.equal(existsSync(join(dir, "out")), false);
      });
    });
  }

  test("fails when the build fails, and writes no zip", () => {
    inProject((dir, script) => {
      const result = script("release-assets", join(dir, "out"), "1.2.0");
      assert.equal(result.status, 3);
      assert.equal(existsSync(join(dir, "out")), false);
    }, "exit 3\n");
  });

  test("takes a folder and a version, as the hook of the release passes them", () => {
    inProject((_dir, script) => {
      const result = script("release-assets");
      assert.equal(result.status, 2);
      assert.match(result.stderr, /^Usage: /);
      assert.equal(result.npm, "");
    });
  });

  test("without either, the script of the zip writes to dist/, by the manifest", () => {
    inProject((dir, script) => {
      const result = script("package-extension");
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, `dist/${ZIP}`);
      assert.equal(existsSync(join(dir, "dist", ZIP)), true);
    });
  });
});

/** What the job "package" leaves behind. */
interface Run {
  readonly status: number | null;
  readonly stdout: string;
  readonly summary: string;
  readonly output: string;
  /** The arguments of each call of gh. */
  readonly calls: string[];
}

/** A gh that records its calls and hands out the zip of FAKE_ZIP, if there is one. */
const FAKE_GH = `#!/usr/bin/env bash
echo "$*" >> "$FAKE_CALLS"
case "$1 $2" in
  "release download")
    if [[ -z "\${FAKE_ZIP:-}" ]]; then
      echo "no assets to download" >&2
      exit 1
    fi
    mkdir -p "$7"
    cp "$FAKE_ZIP" "$7/$5"
    ;;
  "attestation verify") exit "\${FAKE_VERIFY_EXIT:-0}" ;;
  *) exit 64 ;;
esac
`;

const THE_VERIFY =
  "attestation verify dist/player-switch-for-autodarts-1.2.0.zip --repo o/r " +
  "--signer-workflow o/r/.github/workflows/build-release.yml " +
  "--source-ref refs/heads/main --deny-self-hosted-runners";

/** Runs the step in a folder of its own, with a zip that holds these files. */
const take = (
  files: Readonly<Record<string, string>> | undefined,
  env: Readonly<Record<string, string>> = {},
): Run => {
  const dir = mkdtempSync(join(tmpdir(), "release-zip-job-"));
  try {
    const bin = join(dir, "bin");
    const work = join(dir, "work");
    const made = join(dir, "made");
    mkdirSync(bin);
    mkdirSync(work);
    mkdirSync(made);
    writeFileSync(join(bin, "gh"), FAKE_GH);
    chmodSync(join(bin, "gh"), 0o755);
    const paths = {
      FAKE_CALLS: join(dir, "calls"),
      GITHUB_STEP_SUMMARY: join(dir, "summary.md"),
      GITHUB_OUTPUT: join(dir, "output"),
    };
    for (const path of Object.values(paths)) {
      writeFileSync(path, "");
    }
    if (files !== undefined) {
      for (const [name, text] of Object.entries(files)) {
        writeFileSync(join(made, name), text);
      }
      const zipped = spawnSync(
        python ?? "python3",
        ["-m", "zipfile", "-c", join(dir, "fake.zip"), ...Object.keys(files)],
        { cwd: made, encoding: "utf8" },
      );
      assert.equal(zipped.status, 0, zipped.stderr);
    }
    writeFileSync(join(dir, "step.sh"), step("package", TAKE).run);
    const result = spawnSync(
      "bash",
      ["--noprofile", "--norc", "-e", join(dir, "step.sh")],
      {
        cwd: work,
        encoding: "utf8",
        env: {
          PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
          TAG: "v1.2.0",
          GH_REPO: "o/r",
          ...paths,
          ...(files === undefined ? {} : { FAKE_ZIP: join(dir, "fake.zip") }),
          ...env,
        },
      },
    );
    return {
      status: result.status,
      stdout: result.stdout,
      summary: readFileSync(paths.GITHUB_STEP_SUMMARY, "utf8"),
      output: readFileSync(paths.GITHUB_OUTPUT, "utf8"),
      calls: readFileSync(paths.FAKE_CALLS, "utf8").trim().split("\n"),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const manifest = (version: string): Record<string, string> => ({
  "manifest.json": JSON.stringify({ version }),
});

describe("the job that takes the zip of the release", () => {
  test("hands on the zip of the release, once its provenance and version hold", {
    skip: skipJob,
  }, () => {
    const result = take(manifest("1.2.0"));
    assert.equal(result.status, 0, result.stdout);
    assert.deepEqual(result.calls, [
      `release download v1.2.0 --pattern ${ZIP} --dir dist`,
      THE_VERIFY,
    ]);
    assert.equal(result.output, `zip=${ZIP}\n`);
    assert.match(
      result.summary,
      /carries the version 1\.2\.0 and the provenance/,
    );
  });

  test("sends nothing to the store from a release without the zip", {
    skip: skipJob,
  }, () => {
    const result = take(undefined);
    assert.equal(result.status, 1);
    assert.deepEqual(result.calls, [
      `release download v1.2.0 --pattern ${ZIP} --dir dist`,
    ]);
    assert.equal(result.output, "");
    assert.match(
      result.stdout,
      /^::error title=Chrome Web Store::The release v1\.2\.0 has no /m,
    );
    assert.match(result.summary, /release a new version/);
  });

  test("keeps a zip off the store whose provenance doesn't hold", {
    skip: skipJob,
  }, () => {
    const result = take(manifest("1.2.0"), { FAKE_VERIFY_EXIT: "1" });
    assert.equal(result.status, 1);
    assert.equal(result.calls.at(-1), THE_VERIFY);
    assert.equal(result.output, "");
    assert.match(result.summary, /no valid provenance of the isolated build/);
  });

  for (const [what, files, found] of [
    ["another version", manifest("1.1.0"), "1.1.0"],
    ["no manifest", { "popup.html": "<!doctype html>" }, "none"],
    ["a manifest that is no JSON", { "manifest.json": "{" }, "none"],
  ] as const) {
    test(`keeps a zip off the store with ${what}`, { skip: skipJob }, () => {
      const result = take(files);
      assert.equal(result.status, 1);
      assert.equal(result.output, "");
      assert.match(
        result.summary,
        new RegExp(`has the version ${found}; the release is 1\\.2\\.0`),
      );
    });
  }

  test("runs no code of the repository, and builds nothing", () => {
    const lines = jobLines("package").join("\n");
    for (const banned of [
      "actions/checkout",
      "actions/setup-node",
      "npm ",
      "scripts/",
      "registry.npmjs.org",
    ]) {
      const code = lines
        .split("\n")
        .filter((line) => !line.trim().startsWith("#"))
        .join("\n");
      assert.ok(!code.includes(banned), `the job has ${banned}`);
    }
  });

  test("may only read the release and its attestations", () => {
    const lines = jobLines("package");
    const at = lines.indexOf("    permissions:");
    const grants = lines
      .slice(at + 1, lines.indexOf("    env:"))
      .filter((line) => !line.trim().startsWith("#"))
      .map((line) => line.trim());
    assert.deepEqual(grants, ["contents: read", "attestations: read"]);
  });

  test("hands the job that uploads the same file that it checked", () => {
    const has = (job: string, line: RegExp): boolean =>
      jobLines(job).some((text) => line.test(text));
    const artifact =
      /^ {10}name: chrome-web-store-\$\{\{ needs\.status\.outputs\.tag \}\}$/;
    assert.ok(has("package", artifact));
    assert.ok(has("store", artifact));
    assert.ok(
      has("package", /^ {10}path: dist\/\$\{\{ steps\.zip\.outputs\.zip \}\}$/),
    );
    assert.ok(
      has("store", /^ {6}ZIP: dist\/\$\{\{ needs\.package\.outputs\.zip \}\}$/),
    );
  });
});

describe("the settings of the release", () => {
  // build-release.yml keeps every *.zip for itself where PUBLISH_TO is chrome-web-store,
  // and refuses the zip of the hook there, so the release would fail.
  test("let the hook build the zip, with PUBLISH_TO at none", () => {
    assert.match(
      readFileSync(root(".github/repository.project.toml"), "utf8"),
      /^PUBLISH_TO = "none"$/m,
    );
    assert.equal(existsSync(root("scripts/release-assets.sh")), true);
  });
});
