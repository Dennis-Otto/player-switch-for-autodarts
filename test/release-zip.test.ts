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

/** What the fake npm does: it records its call and builds extension/lib/. */
const BUILD = `echo "$*" >> "$FAKE_NPM"
mkdir -p extension/lib
echo 'export {};' > extension/lib/background.js
echo '{}' > extension/lib/background.js.map
`;

/** The times of the entries of a zip. */
const stamps = (zip: string): number[][] => {
  const result = spawnSync(
    python ?? "python3",
    [
      "-c",
      "import json, sys, zipfile\n" +
        "print(json.dumps([i.date_time for i in zipfile.ZipFile(sys.argv[1]).infolist()]))",
      zip,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as number[][];
};

/** Runs a test in a small copy of the project, whose npm only pretends to build. */
const inProject = <T>(
  run: (dir: string, script: (name: string, ...args: string[]) => Script) => T,
  npm = BUILD,
  env: Readonly<Record<string, string>> = { SOURCE_DATE_EPOCH: "1800000000" },
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
          ...env,
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

  test("doesn't depend on zlib: a fixed tree makes these very bytes", () => {
    inProject((dir, script) => {
      const result = script("release-assets", join(dir, "out"), "1.2.0");
      assert.equal(result.status, 0, result.stderr);
      const zip = readFileSync(join(dir, "out", ZIP));
      // Stored, so the sum of a Python on Windows and of one on Linux is the same.
      assert.equal(
        createHash("sha256").update(zip).digest("hex"),
        "3b5f98fd985bf9522be99b1925c5d5000fdb5a8ce9ef9dec67ce715052446e2d",
      );
    });
  });

  test("takes the time of the commit, when nothing else names a time", () => {
    inProject(
      (dir, script) => {
        const git = (...args: string[]): void => {
          const done = spawnSync(
            "git",
            [
              "-c",
              "user.name=test",
              "-c",
              "user.email=test@example.org",
              "-c",
              "commit.gpgsign=false",
              ...args,
            ],
            {
              cwd: dir,
              encoding: "utf8",
              env: {
                ...process.env,
                GIT_AUTHOR_DATE: "2026-02-03T04:05:06Z",
                GIT_COMMITTER_DATE: "2026-02-03T04:05:06Z",
              },
            },
          );
          assert.equal(done.status, 0, done.stderr);
        };
        git("init", "-q");
        git("commit", "-q", "--allow-empty", "-m", "the commit");
        const result = script("release-assets", join(dir, "out"), "1.2.0");
        assert.equal(result.status, 0, result.stderr);
        const times = stamps(join(dir, "out", ZIP));
        assert.ok(times.length > 0);
        for (const time of times) {
          assert.deepEqual(time, [2026, 2, 3, 4, 5, 6]);
        }
      },
      BUILD,
      {},
    );
  });

  test("leaves out what an earlier build left in extension/lib/", () => {
    inProject((dir, script) => {
      mkdirSync(join(dir, "extension/lib"), { recursive: true });
      writeFileSync(join(dir, "extension/lib/removed.js"), "export {};\n");
      const result = script("release-assets", join(dir, "out"), "1.2.0");
      assert.equal(result.status, 0, result.stderr);
      assert.ok(!("lib/removed.js" in contents(join(dir, "out", ZIP))));
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

  test("fails for a file of no kind that the package knows, and writes no zip", () => {
    inProject((dir, script) => {
      writeFileSync(join(dir, "extension/notes.txt"), "a note\n");
      const result = script("release-assets", join(dir, "out"), "1.2.0");
      assert.equal(result.status, 1);
      assert.match(result.stderr, /extension\/ holds notes\.txt, of no kind/);
      assert.equal(existsSync(join(dir, "out")), false);
    });
  });

  test("fails for a file that the manifest names and the package lacks", () => {
    inProject((dir, script) => {
      writeFileSync(
        join(dir, "extension/manifest.json"),
        JSON.stringify({
          ...MANIFEST,
          action: { default_popup: "popup.html" },
          options_ui: { page: "options.html" },
          background: {
            service_worker: "lib/background.js",
            scripts: ["lib/background.js"],
          },
          icons: { 16: "icons/icon-16.png" },
          content_scripts: [{ js: ["lib/content.js"], css: ["page.css"] }],
          web_accessible_resources: [{ resources: ["switcher.html"] }],
        }),
      );
      const result = script("release-assets", join(dir, "out"), "1.2.0");
      assert.equal(result.status, 1);
      assert.match(
        result.stderr,
        /names icons\/icon-16\.png, lib\/content\.js, options\.html, page\.css, switcher\.html, which the package lacks/,
      );
      assert.equal(existsSync(join(dir, "out")), false);
    });
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
  /** The sum of the zip of the release. */
  readonly sha256: string;
}

/**
 * A gh that records its calls, lists the zip of FAKE_ZIP beside the notices, if there
 * is one, and hands it out.
 */
const FAKE_GH = `#!/usr/bin/env bash
echo "$*" >> "$FAKE_CALLS"
case "$1 $2" in
  "release view")
    [[ -z "\${FAKE_VIEW_FAILS:-}" ]] || exit 1
    echo THIRD_PARTY_NOTICES.md
    # A longer name that holds the name of the zip is another file.
    echo "player-switch-for-autodarts-1.2.0.zip.sig"
    [[ -z "\${FAKE_ZIP:-}" ]] || echo "player-switch-for-autodarts-1.2.0.zip"
    ;;
  "release download")
    [[ -z "\${FAKE_DOWNLOAD_FAILS:-}" ]] || exit 1
    mkdir -p "$7"
    cp "$FAKE_ZIP" "$7/$5"
    ;;
  "attestation verify") exit "\${FAKE_VERIFY_EXIT:-0}" ;;
  *) exit 64 ;;
esac
`;

const THE_VIEW = "release view v1.2.0 --json assets --jq .assets[].name";
const THE_DOWNLOAD = `release download v1.2.0 --pattern ${ZIP} --dir dist`;
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
      sha256:
        files === undefined
          ? ""
          : createHash("sha256")
              .update(readFileSync(join(dir, "fake.zip")))
              .digest("hex"),
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
    assert.deepEqual(result.calls, [THE_VIEW, THE_DOWNLOAD, THE_VERIFY]);
    assert.equal(result.output, `zip=${ZIP}\nsha256=${result.sha256}\n`);
    assert.match(
      result.summary,
      /carries the version 1\.2\.0 and the provenance/,
    );
    assert.ok(result.summary.includes(`\`${result.sha256}\``));
  });

  test("sends nothing to the store from a release without the zip", {
    skip: skipJob,
  }, () => {
    const result = take(undefined);
    assert.equal(result.status, 1);
    assert.deepEqual(result.calls, [THE_VIEW]);
    assert.equal(result.output, "");
    assert.match(
      result.stdout,
      /^::error title=Chrome Web Store::The release v1\.2\.0 has no /m,
    );
    assert.match(result.summary, /release a new version/);
  });

  for (const [what, env, calls] of [
    [
      "doesn't list the files of the release",
      { FAKE_VIEW_FAILS: "1" },
      [THE_VIEW],
    ],
    [
      "doesn't hand out a zip that the release has",
      { FAKE_DOWNLOAD_FAILS: "1" },
      [THE_VIEW, THE_DOWNLOAD],
    ],
  ] as const) {
    test(`asks for no new release when GitHub ${what}`, {
      skip: skipJob,
    }, () => {
      const result = take(manifest("1.2.0"), env);
      assert.equal(result.status, 1);
      assert.deepEqual(result.calls, calls);
      assert.equal(result.output, "");
      assert.match(result.summary, /the next daily run tries again/i);
      assert.doesNotMatch(result.summary, /release a new version/);
    });
  }

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

describe("the job that uploads", () => {
  const SAME = "Check that it is the zip of the release, byte for byte";
  const compare = (
    sum: string,
  ): {
    readonly status: number | null;
    readonly stdout: string;
    readonly summary: string;
  } => {
    const dir = mkdtempSync(join(tmpdir(), "release-zip-same-"));
    try {
      mkdirSync(join(dir, "dist"));
      writeFileSync(join(dir, "dist", ZIP), "the zip");
      const summary = join(dir, "summary.md");
      writeFileSync(summary, "");
      writeFileSync(join(dir, "step.sh"), step("store", SAME).run);
      const result = spawnSync(
        "bash",
        ["--noprofile", "--norc", "-e", join(dir, "step.sh")],
        {
          cwd: dir,
          encoding: "utf8",
          env: {
            PATH: process.env.PATH ?? "",
            TAG: "v1.2.0",
            ZIP: `dist/${ZIP}`,
            SHA256: sum,
            GITHUB_STEP_SUMMARY: summary,
          },
        },
      );
      return {
        status: result.status,
        stdout: result.stdout,
        summary: readFileSync(summary, "utf8"),
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  test("goes on with the bytes that the job before it checked", {
    skip: skipScripts,
  }, () => {
    const sum = createHash("sha256").update("the zip").digest("hex");
    assert.equal(compare(sum).status, 0);
  });

  for (const [what, sum, named] of [
    ["other bytes", "0".repeat(64), "0".repeat(64)],
    ["no sum from the job before it", "", "unknown"],
  ] as const) {
    test(`keeps a zip off the store with ${what}`, {
      skip: skipScripts,
    }, () => {
      const result = compare(sum);
      assert.equal(result.status, 1);
      assert.match(result.stdout, /^::error title=Chrome Web Store::/m);
      assert.ok(result.summary.includes(`whose sha256 is ${named}`));
    });
  }

  test("compares the bytes before it signs in", () => {
    const lines = jobLines("store");
    const at = (name: string): number => lines.indexOf(`      - name: ${name}`);
    assert.notEqual(at(SAME), -1);
    assert.ok(
      at(SAME) <
        at("Sign in to the Chrome Web Store API with the refresh token"),
    );
    assert.ok(
      lines.some((line) =>
        /^ {6}SHA256: \$\{\{ needs\.package\.outputs\.sha256 \}\}$/.test(line),
      ),
    );
    assert.ok(
      jobLines("package").some((line) =>
        /^ {6}sha256: \$\{\{ steps\.zip\.outputs\.sha256 \}\}$/.test(line),
      ),
    );
  });
});

describe("the jobs of the store workflow", () => {
  // A job that ends while Harden-Runner removes Docker can hang until its time limit.
  for (const job of ["status", "package", "store"]) {
    test(`"${job}" ends with waiting for Harden-Runner`, () => {
      const lines = jobLines(job);
      const names = lines.filter((line) => line.startsWith("      - name: "));
      assert.equal(
        names.at(-1),
        "      - name: Wait until Harden-Runner has removed Docker",
      );
      assert.equal(
        step(job, "Wait until Harden-Runner has removed Docker").if,
        "always()",
      );
    });
  }
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
