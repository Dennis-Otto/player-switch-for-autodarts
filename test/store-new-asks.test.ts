import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  type Asks,
  describeAsks,
  type Fetch,
  newAsks,
  readAsks,
  run,
} from "../scripts/store-new-asks.ts";

// What the store's version and the release asked for when the store refused 1.0.0.
const MANIFEST_0_2_0 = {
  manifest_version: 3,
  permissions: ["storage", "alarms"],
  host_permissions: ["https://play.autodarts.com/*"],
};
const MANIFEST_1_0_0 = {
  manifest_version: 3,
  permissions: ["storage", "alarms", "scripting", "unlimitedStorage"],
  host_permissions: [
    "https://play.autodarts.com/*",
    "https://api.autodarts.com/*",
  ],
  web_accessible_resources: [
    { resources: ["switcher.html"], matches: ["https://play.autodarts.com/*"] },
  ],
};
const folder = (...names: readonly string[]) =>
  names.map((name) => ({ name, type: "dir" }));
const LOCALES_0_2_0 = folder("de", "en");
const LOCALES_1_0_0 = folder("de", "en", "es", "fr", "nl");

const SENTENCE =
  "What v1.0.0 asks for beyond the store's version 0.2.0: the permissions scripting and unlimitedStorage; the host https://api.autodarts.com/*; the web-accessible page switcher.html; the languages es, fr, and nl.";

const STATUS = {
  publishedItemRevisionStatus: {
    state: "PUBLISHED",
    distributionChannels: [{ crxVersion: "0.2.0" }],
  },
};

const NO_ASKS: Asks = { permissions: [], hosts: [], pages: [], languages: [] };

test("readAsks reads the permissions, the hosts, the pages and the languages", () => {
  assert.deepEqual(readAsks(MANIFEST_1_0_0, LOCALES_1_0_0), {
    permissions: ["storage", "alarms", "scripting", "unlimitedStorage"],
    hosts: ["https://play.autodarts.com/*", "https://api.autodarts.com/*"],
    pages: ["switcher.html"],
    languages: ["de", "en", "es", "fr", "nl"],
  });
});

test("readAsks counts a missing or malformed part as none", () => {
  assert.deepEqual(readAsks(null, null), NO_ASKS);
  assert.deepEqual(readAsks({}, {}), NO_ASKS);
  assert.deepEqual(
    readAsks(
      {
        permissions: "storage",
        host_permissions: [3],
        web_accessible_resources: ["switcher.html", { resources: "a.html" }],
      },
      ["de", { name: 3 }],
    ),
    NO_ASKS,
  );
});

test("newAsks keeps only what the version of the store didn't ask for", () => {
  assert.deepEqual(
    newAsks(
      readAsks(MANIFEST_0_2_0, LOCALES_0_2_0),
      readAsks(MANIFEST_1_0_0, LOCALES_1_0_0),
    ),
    {
      permissions: ["scripting", "unlimitedStorage"],
      hosts: ["https://api.autodarts.com/*"],
      pages: ["switcher.html"],
      languages: ["es", "fr", "nl"],
    },
  );
});

test("newAsks ignores what the release no longer asks for", () => {
  assert.deepEqual(
    newAsks(
      readAsks(MANIFEST_1_0_0, LOCALES_1_0_0),
      readAsks(MANIFEST_0_2_0, LOCALES_0_2_0),
    ),
    NO_ASKS,
  );
});

test("describeAsks names one or many of each kind, and leaves out the kinds without any", () => {
  assert.equal(
    describeAsks("v1.1.0", "1.0.0", {
      ...NO_ASKS,
      permissions: ["scripting"],
      languages: ["nl"],
    }),
    "What v1.1.0 asks for beyond the store's version 1.0.0: the permission scripting; the language nl.",
  );
});

test("describeAsks says when the release asks for nothing new", () => {
  assert.equal(
    describeAsks("v1.1.0", "1.0.0", NO_ASKS),
    "v1.1.0 asks for nothing beyond the store's version 1.0.0, so the dashboard lacks something else.",
  );
});

test("describeAsks says when the store has published no version to compare with", () => {
  assert.equal(
    describeAsks("v1.0.0", undefined, { ...NO_ASKS, pages: ["a.html"] }),
    "What v1.0.0 asks for with no version published in the store yet: the web-accessible page a.html.",
  );
});

/** A GitHub that holds the two tags, and the addresses that it was asked for. */
const github = (requests: string[], inits: RequestInit[] = []): Fetch => {
  const files = new Map<string, unknown>([
    ["extension/manifest.json?ref=v0.2.0", MANIFEST_0_2_0],
    ["extension/_locales?ref=v0.2.0", LOCALES_0_2_0],
    ["extension/manifest.json?ref=v1.0.0", MANIFEST_1_0_0],
    ["extension/_locales?ref=v1.0.0", LOCALES_1_0_0],
  ]);
  return async (url, init) => {
    requests.push(url);
    inits.push(init);
    const path = url.replace(
      "https://api.github.com/repos/owner/name/contents/",
      "",
    );
    const file = files.get(path);
    return file === undefined
      ? new Response("{}", { status: 404 })
      : Response.json(file);
  };
};

const withFiles = async (
  body: (dir: string, env: Record<string, string>) => Promise<void> | void,
  status: unknown = STATUS,
): Promise<void> => {
  const dir = mkdtempSync(join(tmpdir(), "store-new-asks-"));
  try {
    writeFileSync(join(dir, "status.json"), JSON.stringify(status));
    writeFileSync(join(dir, "output"), "");
    await body(dir, {
      STATUS: join(dir, "status.json"),
      GITHUB_OUTPUT: join(dir, "output"),
      GITHUB_REPOSITORY: "owner/name",
      GH_TOKEN: "a-token",
      TAG: "v1.0.0",
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("run compares the tag of the release with the tag of the store's version", async () => {
  await withFiles(async (dir, env) => {
    const requests: string[] = [];
    const inits: RequestInit[] = [];
    const lines: string[] = [];
    await run(env, github(requests, inits), (line) => lines.push(line));
    assert.equal(
      readFileSync(join(dir, "output"), "utf8"),
      `new-asks=${SENTENCE}\n`,
    );
    assert.deepEqual(lines, [SENTENCE]);
    assert.deepEqual(requests, [
      "https://api.github.com/repos/owner/name/contents/extension/manifest.json?ref=v0.2.0",
      "https://api.github.com/repos/owner/name/contents/extension/_locales?ref=v0.2.0",
      "https://api.github.com/repos/owner/name/contents/extension/manifest.json?ref=v1.0.0",
      "https://api.github.com/repos/owner/name/contents/extension/_locales?ref=v1.0.0",
    ]);
    assert.deepEqual(inits[0]?.headers, {
      Accept: "application/vnd.github.raw+json",
      Authorization: "Bearer a-token",
    });
    assert.ok(inits[0]?.signal instanceof AbortSignal);
  });
});

test("run asks only for the release when the store has published no version", async () => {
  await withFiles(async (dir, env) => {
    const requests: string[] = [];
    await run(env, github(requests), () => {});
    assert.deepEqual(
      requests.map((url) => url.split("?ref=")[1]),
      ["v1.0.0", "v1.0.0"],
    );
    assert.match(
      readFileSync(join(dir, "output"), "utf8"),
      /^new-asks=What v1\.0\.0 asks for with no version published in the store yet: the permissions storage, alarms, scripting, and unlimitedStorage;/,
    );
  }, {});
});

for (const [what, change, reason] of [
  [
    "a version of the store without a tag",
    { TAG: "v1.0.0" },
    "GitHub answered 404 for extension/manifest.json at v0.1.9",
  ],
  [
    "a token that the workflow didn't set",
    { GH_TOKEN: "" },
    "The variable GH_TOKEN is missing.",
  ],
  ["a status that it can't read", { STATUS: "no-such-file" }, "no-such-file"],
] as const) {
  test(`run says so, and doesn't fail, with ${what}`, async () => {
    await withFiles(
      async (dir, env) => {
        const lines: string[] = [];
        await run({ ...env, ...change }, github([]), (line) =>
          lines.push(line),
        );
        const output = readFileSync(join(dir, "output"), "utf8");
        assert.match(
          output,
          /^new-asks=This run couldn't find out what v1\.0\.0 asks for beyond the version of the store \(/,
        );
        assert.ok(output.includes(reason), output);
        assert.equal(output.split("\n").length, 2);
        assert.equal(lines.length, 1);
      },
      {
        publishedItemRevisionStatus: {
          distributionChannels: [{ crxVersion: "0.1.9" }],
        },
      },
    );
  });
}

test("run says so, and doesn't fail, when GitHub can't be reached or answers no JSON", async () => {
  await withFiles(async (dir, env) => {
    await run(
      env,
      async () => {
        throw new TypeError("fetch failed");
      },
      () => {},
    );
    assert.match(
      readFileSync(join(dir, "output"), "utf8"),
      /\(TypeError: fetch failed\)\.\n$/,
    );
  });
  await withFiles(async (dir, env) => {
    await run(
      env,
      async () => new Response("<html>"),
      () => {},
    );
    assert.match(readFileSync(join(dir, "output"), "utf8"), /\(SyntaxError: /);
  });
});

test("run keeps whatever a manifest holds on the one line of an output", async () => {
  await withFiles(async (dir, env) => {
    await run(
      env,
      async (url) =>
        Response.json(
          url.includes("manifest.json")
            ? { permissions: ["storage\nnext=line"] }
            : [],
        ),
      () => {},
    );
    assert.equal(
      readFileSync(join(dir, "output"), "utf8"),
      "new-asks=What v1.0.0 asks for with no version published in the store yet: the permission storage next=line.\n",
    );
  }, {});
});

test("run names a variable that it needs for the output", async () => {
  await withFiles(async (_dir, env) => {
    await assert.rejects(
      run({ ...env, TAG: "" }, github([]), () => {}),
      /The variable TAG is missing\./,
    );
    await assert.rejects(
      run({ ...env, GITHUB_OUTPUT: "" }, github([]), () => {}),
      /The variable GITHUB_OUTPUT is missing\./,
    );
  });
});

test("the workflow runs the file itself, which writes the output", async () => {
  await withFiles(async (dir, env) => {
    const script = fileURLToPath(
      new URL("../scripts/store-new-asks.ts", import.meta.url),
    );
    // Without a token, so that the test asks nobody on the network.
    const result = spawnSync(process.execPath, [script], {
      env: { ...process.env, ...env, GH_TOKEN: "" },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^This run couldn't find out/);
    assert.match(readFileSync(join(dir, "output"), "utf8"), /^new-asks=This/);
  });
});
