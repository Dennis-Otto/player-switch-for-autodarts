// Tests scripts/package-extension.ts: a zip has the same bytes for the same commit on
// every computer, holds only the kinds of file that the extension needs, and carries
// the version of its release (decision 0013). The digests below are of bytes that no
// computer may change, so a test on another system or in another time zone fails when
// they depend on it. scripts/check-project.sh builds the real zip twice as well.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { crc32 } from "node:zlib";

import {
  chooseFiles,
  namedFiles,
  run,
  stampVersion,
  zipBytes,
  zipTime,
} from "../scripts/package-extension.ts";

const SCRIPT = fileURLToPath(
  new URL("../scripts/package-extension.ts", import.meta.url),
);

const sha256 = (data: Uint8Array): string =>
  createHash("sha256").update(data).digest("hex");

/** A line of the directory of a zip, with what its local header says. */
interface Entry {
  readonly name: string;
  readonly madeBy: number;
  readonly flags: number;
  readonly method: number;
  readonly time: number;
  readonly date: number;
  readonly crc: number;
  readonly mode: number;
  readonly extra: number;
  readonly localFlags: number;
  readonly localExtra: number;
  readonly data: Buffer;
}

/** Reads a zip by its directory, as every program does that unpacks one. */
const readZip = (zip: Buffer): Entry[] => {
  const end = zip.length - 22;
  assert.equal(zip.readUInt32LE(end), 0x06054b50, "the end of the directory");
  assert.equal(zip.readUInt16LE(end + 20), 0, "no comment");
  const count = zip.readUInt16LE(end + 10);
  assert.equal(zip.readUInt16LE(end + 8), count);
  const directory = zip.readUInt32LE(end + 16);
  assert.equal(directory + zip.readUInt32LE(end + 12), end);
  const entries: Entry[] = [];
  let at = directory;
  for (let index = 0; index < count; index += 1) {
    assert.equal(zip.readUInt32LE(at), 0x02014b50, "a line of the directory");
    const nameLength = zip.readUInt16LE(at + 28);
    const extra = zip.readUInt16LE(at + 30);
    const comment = zip.readUInt16LE(at + 32);
    assert.equal(comment, 0);
    const local = zip.readUInt32LE(at + 42);
    assert.equal(zip.readUInt32LE(local), 0x04034b50, "the header of a file");
    const name = zip.toString("utf8", at + 46, at + 46 + nameLength);
    const localNameLength = zip.readUInt16LE(local + 26);
    const localExtra = zip.readUInt16LE(local + 28);
    assert.equal(
      zip.toString("utf8", local + 30, local + 30 + localNameLength),
      name,
    );
    const start = local + 30 + localNameLength + localExtra;
    const size = zip.readUInt32LE(at + 24);
    assert.equal(zip.readUInt32LE(at + 20), size, "stored as it is");
    entries.push({
      name,
      madeBy: zip.readUInt16LE(at + 4),
      flags: zip.readUInt16LE(at + 8),
      method: zip.readUInt16LE(at + 10),
      time: zip.readUInt16LE(at + 12),
      date: zip.readUInt16LE(at + 14),
      crc: zip.readUInt32LE(at + 16),
      mode: zip.readUInt32LE(at + 38),
      extra,
      localFlags: zip.readUInt16LE(local + 6),
      localExtra,
      data: zip.subarray(start, start + size),
    });
    at += 46 + nameLength + extra;
  }
  return entries;
};

describe("the bytes of a zip", () => {
  const FILES = [
    { path: "manifest.json", data: Buffer.from('{"version":"1.0.0"}\n') },
    { path: "lib/worker.js", data: Buffer.from("export {};\n") },
    { path: "_locales/en/messages.json", data: Buffer.from("{}\n") },
  ];
  // 2026-11-01 12:34:57 UTC.
  const SECONDS = Date.UTC(2026, 10, 1, 12, 34, 57) / 1000;

  test("are these, whatever the system, the time zone or the version of zlib", () => {
    assert.equal(
      sha256(zipBytes(FILES, SECONDS)),
      "4b30a9d522f809e71d443609358833f93892889ae0059beaaf3e51be5424bacf",
    );
  });

  test("don't depend on the order in which the files come", () => {
    assert.deepEqual(
      zipBytes(FILES, SECONDS),
      zipBytes(FILES.toReversed(), SECONDS),
    );
  });

  test("list the files by their bytes, which no locale changes", () => {
    const names = readZip(
      zipBytes(
        ["b.html", "a.css", "Z.css", "lib/a.js", "lib-a.js"].map((path) => ({
          path,
          data: Buffer.alloc(0),
        })),
        SECONDS,
      ),
    ).map((entry) => entry.name);
    assert.deepEqual(names, [
      "Z.css",
      "a.css",
      "b.html",
      "lib-a.js",
      "lib/a.js",
    ]);
  });

  test("hold each file as it is, with one time and one mode and nothing else", () => {
    const entries = readZip(zipBytes(FILES, SECONDS));
    assert.deepEqual(
      entries.map((entry) => entry.name),
      ["_locales/en/messages.json", "lib/worker.js", "manifest.json"],
    );
    const { date, time } = zipTime(SECONDS);
    for (const entry of entries) {
      const file = FILES.find(({ path }) => path === entry.name);
      assert.deepEqual(entry.data, file?.data);
      assert.equal(entry.crc, crc32(entry.data));
      assert.equal(entry.method, 0, "stored");
      assert.equal(entry.flags, 0);
      assert.equal(entry.localFlags, 0);
      assert.equal(entry.extra, 0, "no extra field, which could hold a time");
      assert.equal(entry.localExtra, 0);
      assert.equal(entry.madeBy >> 8, 3, "made by Unix on every system");
      assert.equal(entry.mode >>> 16, 0o100644, "a plain file");
      assert.equal(entry.date, date);
      assert.equal(entry.time, time);
    }
  });

  test("keep the time in the fields of UTC, in seconds of two", () => {
    const { date, time } = zipTime(SECONDS);
    assert.equal(date >> 9, 2026 - 1980);
    assert.equal((date >> 5) & 0xf, 11);
    assert.equal(date & 0x1f, 1);
    assert.equal(time >> 11, 12);
    assert.equal((time >> 5) & 0x3f, 34);
    assert.equal(time & 0x1f, 28, "57 seconds, in twos");
  });

  test("hold no time before 1980, which a zip can't", () => {
    assert.deepEqual(zipTime(0), { date: (1 << 5) | 1, time: 0 });
  });
});

describe("the files of a package", () => {
  test("are those that Git knows and those of the build", () => {
    assert.deepEqual(
      chooseFiles(
        [
          "manifest.json",
          "popup.html",
          "popup.css",
          "icons/icon-16.png",
          "_locales/pt_BR/messages.json",
          "biome.jsonc",
        ],
        ["lib/worker.js", "lib/pages/popup.js", "lib/worker.js.map"],
      ),
      [
        "manifest.json",
        "popup.html",
        "popup.css",
        "icons/icon-16.png",
        "_locales/pt_BR/messages.json",
        "lib/worker.js",
        "lib/pages/popup.js",
      ],
    );
  });

  test("hold a file once, should Git and the build both name it", () => {
    assert.deepEqual(chooseFiles(["lib/a.js"], ["lib/a.js"]), ["lib/a.js"]);
  });

  for (const path of [
    ".env",
    "notes.txt",
    "manifest.json.bak",
    "icons/icon.svg",
    "lib/worker.ts",
    "lib/.hidden.js",
    "lib/worker.tsbuildinfo",
    "_locales/en/notes.json",
    "pages/popup.html",
    "../outside.js",
  ]) {
    test(`fail on ${path}, of no kind that the package knows`, () => {
      assert.throws(
        () => chooseFiles(["manifest.json", path], []),
        (error: Error) =>
          error.message.includes(`extension/ holds ${path},`) &&
          error.message.includes("scripts/package-extension.ts"),
      );
    });
  }

  test("name every strange file at once", () => {
    assert.throws(
      () => chooseFiles(["a.txt"], ["lib/b.txt"]),
      /extension\/ holds a\.txt, lib\/b\.txt,/,
    );
  });
});

describe("the files that a manifest names", () => {
  test("are each file that the browser takes from the package", () => {
    assert.deepEqual(
      namedFiles({
        version: "1.0.0",
        action: { default_popup: "popup.html" },
        options_ui: { page: "options.html" },
        background: { service_worker: "lib/a.js", scripts: ["lib/b.js"] },
        icons: { "16": "icons/icon-16.png" },
        content_scripts: [{ js: ["lib/c.js"], css: ["c.css"] }],
        web_accessible_resources: [{ resources: ["switcher.html"] }],
      }),
      [
        "popup.html",
        "options.html",
        "lib/a.js",
        "lib/b.js",
        "icons/icon-16.png",
        "lib/c.js",
        "c.css",
        "switcher.html",
      ],
    );
  });

  test("are none in a manifest that names none", () => {
    assert.deepEqual(namedFiles({ version: "1.0.0" }), []);
    assert.deepEqual(
      namedFiles({
        version: "1.0.0",
        action: {},
        options_ui: {},
        background: {},
        content_scripts: [{}],
        web_accessible_resources: [{}],
      }),
      [],
    );
  });
});

describe("the version of the zip", () => {
  const MANIFEST = '{\n  "version": "1.2.0",\n  "name": "x"\n}\n';

  test("is that of the manifest without a release, and leaves its text alone", () => {
    assert.deepEqual(stampVersion(MANIFEST, ""), {
      version: "1.2.0",
      text: MANIFEST,
    });
  });

  test("is that of a release that the manifest carries", () => {
    assert.deepEqual(stampVersion(MANIFEST, "1.2.0"), {
      version: "1.2.0",
      text: MANIFEST,
    });
  });

  test("of a beta names it, with only numbers in the version of the manifest", () => {
    const { version, text } = stampVersion(MANIFEST, "1.3.0-beta.2");
    assert.equal(version, "1.3.0-beta.2");
    assert.equal(
      text,
      '{\n  "version": "1.3.0",\n  "name": "x",\n  "version_name": "1.3.0-beta.2"\n}\n',
    );
  });

  for (const release of ["1.3.0", "v1.2.0", "beta"]) {
    test(`fails for the release ${release}, which the manifest doesn't carry`, () => {
      assert.throws(
        () => stampVersion(MANIFEST, release),
        new RegExp(
          `has the version 1\\.2\\.0, the release ${release}: the release bot`,
        ),
      );
    });
  }
});

describe("a package of a checkout", () => {
  /** The time of the commit of the repositories below. */
  const COMMIT = "2026-11-01T12:34:56Z";
  const MANIFEST = `${JSON.stringify(
    {
      manifest_version: 3,
      version: "1.2.0",
      action: { default_popup: "popup.html" },
      background: { service_worker: "lib/background.js" },
    },
    null,
    2,
  )}\n`;

  /** The environment of a Git of its own, without what points at another repository. */
  const gitEnv = (): NodeJS.ProcessEnv => {
    const names = execFileSync("git", ["rev-parse", "--local-env-vars"], {
      encoding: "utf8",
    })
      .split("\n")
      .filter((name) => name !== "");
    const env = { ...process.env };
    for (const name of names) {
      delete env[name];
    }
    delete env.SOURCE_DATE_EPOCH;
    return env;
  };

  const write = (root: string, path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };

  /** A repository with one commit of an extension, whose lib/ the build would write. */
  const withCheckout = (check: (root: string) => void): void => {
    const root = mkdtempSync(join(tmpdir(), "package-extension-"));
    try {
      const env = gitEnv();
      const git = (...args: string[]): void => {
        execFileSync("git", args, {
          cwd: root,
          env: {
            ...env,
            GIT_AUTHOR_NAME: "A Test",
            GIT_AUTHOR_EMAIL: "test@example.com",
            GIT_AUTHOR_DATE: COMMIT,
            GIT_COMMITTER_NAME: "A Test",
            GIT_COMMITTER_EMAIL: "test@example.com",
            GIT_COMMITTER_DATE: COMMIT,
          },
          stdio: "ignore",
        });
      };
      git("init", "--quiet");
      git("config", "core.autocrlf", "false");
      write(root, "package.json", '{"name":"a-package"}\n');
      write(root, ".gitignore", "/extension/lib/\n/dist/\n");
      write(root, "extension/manifest.json", MANIFEST);
      write(root, "extension/popup.html", "<!doctype html>\n");
      write(root, "extension/biome.jsonc", "{}\n");
      git("add", ".");
      git("-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "A commit");
      write(root, "extension/lib/background.js", "export {};\n");
      write(root, "extension/lib/background.js.map", "{}\n");
      check(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  const namesOf = (zip: string): string[] =>
    readZip(readFileSync(zip)).map((entry) => entry.name);

  test("holds what Git knows and the build wrote, and goes to dist/ by default", () => {
    withCheckout((root) => {
      const path = run([], gitEnv(), root);
      assert.equal(path, "dist/a-package-1.2.0.zip");
      assert.deepEqual(namesOf(join(root, path)), [
        "lib/background.js",
        "manifest.json",
        "popup.html",
      ]);
    });
  });

  test("leaves out a file that Git doesn't know, such as a note beside the pages", () => {
    withCheckout((root) => {
      write(root, "extension/scratch.html", "not for the store\n");
      write(root, "extension/.env", "not for the store\n");
      const path = run([], gitEnv(), root);
      assert.deepEqual(namesOf(join(root, path)), [
        "lib/background.js",
        "manifest.json",
        "popup.html",
      ]);
    });
  });

  test("has the time of the commit, whenever it is built", () => {
    withCheckout((root) => {
      const [entry] = readZip(
        readFileSync(join(root, run([], gitEnv(), root))),
      );
      assert.deepEqual(
        { date: entry?.date, time: entry?.time },
        zipTime(Date.parse(COMMIT) / 1000),
      );
    });
  });

  test("has the same bytes in another folder and whatever the files' own times", () => {
    withCheckout((root) => {
      const first = readFileSync(join(root, run(["one"], gitEnv(), root)));
      write(root, "extension/lib/background.js", "export {};\n");
      const second = readFileSync(join(root, run(["two"], gitEnv(), root)));
      assert.equal(sha256(second), sha256(first));
    });
  });

  test("takes the time of SOURCE_DATE_EPOCH when it is set", () => {
    withCheckout((root) => {
      const env = { ...gitEnv(), SOURCE_DATE_EPOCH: "1700000000" };
      const [entry] = readZip(readFileSync(join(root, run([], env, root))));
      assert.deepEqual(
        { date: entry?.date, time: entry?.time },
        zipTime(1700000000),
      );
    });
  });

  test("fails on a SOURCE_DATE_EPOCH that is no time", () => {
    withCheckout((root) => {
      assert.throws(
        () => run([], { ...gitEnv(), SOURCE_DATE_EPOCH: "yesterday" }, root),
        /SOURCE_DATE_EPOCH is no time in seconds: yesterday/,
      );
    });
  });

  test("of a beta carries its version in the name and in the manifest", () => {
    withCheckout((root) => {
      const path = run(["out", "1.3.0-beta.1"], gitEnv(), root);
      assert.equal(path, "out/a-package-1.3.0-beta.1.zip");
      const manifest = readZip(readFileSync(join(root, path))).find(
        (entry) => entry.name === "manifest.json",
      );
      assert.deepEqual(JSON.parse(String(manifest?.data)), {
        ...JSON.parse(MANIFEST),
        version: "1.3.0",
        version_name: "1.3.0-beta.1",
      });
    });
  });

  test("fails before it writes when the release isn't in the manifest", () => {
    withCheckout((root) => {
      assert.throws(
        () => run(["out", "1.3.0"], gitEnv(), root),
        /has the version 1\.2\.0, the release 1\.3\.0/,
      );
    });
  });

  test("fails on a file of no known kind, also one from the build", () => {
    withCheckout((root) => {
      write(root, "extension/lib/stray.txt", "\n");
      assert.throws(
        () => run([], gitEnv(), root),
        /extension\/ holds lib\/stray\.txt,/,
      );
    });
  });

  test("fails without the build, which the manifest names", () => {
    withCheckout((root) => {
      rmSync(join(root, "extension/lib"), { recursive: true });
      assert.throws(
        () => run([], gitEnv(), root),
        /names lib\/background\.js, which the package lacks/,
      );
    });
  });

  test("the script writes the zip and prints its path", () => {
    withCheckout((root) => {
      const result = spawnSync(process.execPath, [SCRIPT], {
        cwd: root,
        env: gitEnv(),
        encoding: "utf8",
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, "dist/a-package-1.2.0.zip\n");
      assert.ok(namesOf(join(root, "dist/a-package-1.2.0.zip")).length > 0);
    });
  });

  test("the script says what is wrong and fails", () => {
    withCheckout((root) => {
      const result = spawnSync(process.execPath, [SCRIPT, "out", "9.9.9"], {
        cwd: root,
        env: gitEnv(),
        encoding: "utf8",
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /the release 9\.9\.9: the release bot/);
      assert.equal(result.stdout, "");
    });
  });
});

test("the real extension makes a package, with each file that its manifest names", () => {
  // Without the build, only the part that Git knows: scripts/check-project.sh and the
  // release run it with lib/, and the CI runs this after the build.
  const manifest = JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../extension/manifest.json", import.meta.url)),
      "utf8",
    ),
  );
  const tracked = execFileSync("git", ["ls-files", "--", "extension"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
  })
    .split("\n")
    .filter((path) => path !== "")
    .map((path) => path.slice("extension/".length));
  const files = chooseFiles(
    tracked,
    namedFiles(manifest).filter((path) => path.startsWith("lib/")),
  );
  assert.deepEqual(
    namedFiles(manifest).filter((path) => !files.includes(path)),
    [],
  );
  assert.ok(!files.includes("biome.jsonc"));
});
