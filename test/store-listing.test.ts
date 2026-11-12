import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  describedSince,
  difference,
  escapeData,
  type Fetch,
  type Git,
  GRACE_DAYS,
  gitIn,
  htmlText,
  ITEM_ID,
  listingsOf,
  pageUrl,
  plainText,
  readListing,
  readPage,
  run,
  sinceInGit,
} from "../scripts/store-listing.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-12T05:17:00Z");

/** A listing of store/ as the files have it: hard-wrapped, with sections around. */
const listing = (
  short: string,
  detailed: string,
  heading = "Detailed",
): string =>
  [
    "<!-- A note for the spelling check. -->",
    "",
    "# Chrome Web Store listing",
    "",
    "## Name",
    "",
    "Player Switch for Autodarts",
    "",
    "## Short description",
    "",
    short,
    "",
    `## ${heading} description`,
    "",
    detailed,
    "",
    "## Permission justifications",
    "",
    "• storage — to keep the accounts.",
    "",
  ].join("\n");

const SHORT = "Switch between Autodarts accounts with one tap.";
const DETAILED =
  "Share one display.\n\nHow it works:\n\n• Save each account once: a tap on a tile\n  puts that account on the board.\n• Accounts that sign in with Google or Apple can't use this.";

const escapeHtml = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/** A page of the store, in the form of the real one of November 2026. */
const page = ({
  short = SHORT,
  detailed = DETAILED.replaceAll(/\n {2}/g, " "),
  version = "1.6.0" as string | null,
  label = "Version",
} = {}): string =>
  [
    "<!doctype html><html><head>",
    `<meta name="description" content="${escapeHtml(short)}">`,
    `<meta property="og:description" content="${escapeHtml(short)}">`,
    "</head><body><p>Sign in</p>",
    '<section class="MHH2Z"><div class="SmeJW"><h2 class="p9xg1"><div>Overview</div></h2></div>',
    '<div class="p5TRec"><div jsname="ij8cu" class="mN52G oB8Rd">',
    `<p>${escapeHtml(short)}</p><p>${escapeHtml(detailed)}</p>`,
    "</div></div></section>",
    '<section class="MHH2Z"><h2 class="p9xg1">Details</h2><ul class="TKAMQe">',
    version === null
      ? ""
      : `<li class="MqICNe"><div class="QDHp8e">${label}</div><div class="nBZElf">${version}</div></li>`,
    '<li class="MqICNe"><div class="QDHp8e">Updated</div><div>November 10, 2026</div></li>',
    "</ul></section></body></html>",
  ].join("");

/** A checkout with listings in English and German and the manifest of a release. */
const withRoot = async (
  action: (root: string, summaryFile: string) => Promise<void>,
  files: Record<string, string> = {
    en: listing(SHORT, DETAILED),
    de: listing("Wechsle mit einem Tipp.", "Ein Display für alle — „Konto“."),
  },
  release = "1.6.0",
): Promise<void> => {
  const root = mkdtempSync(join(tmpdir(), "store-listing-"));
  try {
    mkdirSync(join(root, "store"));
    mkdirSync(join(root, "extension"));
    writeFileSync(
      join(root, "extension", "manifest.json"),
      JSON.stringify({ manifest_version: 3, version: release }),
    );
    for (const [code, text] of Object.entries(files)) {
      writeFileSync(join(root, "store", `listing.${code}.md`), text);
    }
    writeFileSync(join(root, "store", "permissions.json"), "{}");
    await action(root, join(root, "summary.md"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

type Answer = string | Response | Error | { readonly throws: unknown };

/** A store that answers each language with its page, and records what was asked. */
const store = (pages: Record<string, Answer>) => {
  const asked: string[] = [];
  const fetcher: Fetch = async (url) => {
    asked.push(url);
    const answer = pages[new URL(url).searchParams.get("hl") ?? ""];
    if (answer instanceof Error) {
      throw answer;
    }
    if (typeof answer === "object" && "throws" in answer) {
      throw answer.throws;
    }
    if (answer instanceof Response) {
      return answer;
    }
    return new Response(answer ?? "", { status: answer ? 200 : 404 });
  };
  return { fetcher, asked };
};

const SAME = {
  en: page(),
  de: page({
    short: "Wechsle mit einem Tipp.",
    detailed: "Ein Display für alle — „Konto“.",
    label: "Version",
  }),
};

const never = (): Date | undefined => undefined;

const runIn = async (
  root: string,
  pages: Record<string, Answer>,
  env: NodeJS.ProcessEnv = {},
  since: (root: string, file: string) => Date | undefined = never,
) => {
  const lines: string[] = [];
  const { fetcher, asked } = store(pages);
  const code = await run(
    env,
    fetcher,
    (line) => lines.push(line),
    root,
    since,
    NOW,
  );
  return { code, lines, asked };
};

test("the item is the one that the README links", () => {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  assert.ok(
    readme.includes(
      `chromewebstore.google.com/detail/player-switch-for-autodar/${ITEM_ID}`,
    ),
  );
  assert.equal(
    pageUrl("pt_BR"),
    `https://chromewebstore.google.com/detail/${ITEM_ID}?hl=pt-BR`,
  );
});

test("a text is compared with its whitespace collapsed, as the store shows it", () => {
  assert.equal(plainText("  a\n  b \tc\r\n\nd "), "a b c d");
});

test("the text of a piece of HTML has its line breaks, no tags and no entities", () => {
  assert.equal(
    htmlText(
      "<b>a</b><br>b<br/>c &amp; &quot;d&quot; &#39;e&#39; &#x2022; &lt;f&gt; &apos;g&nbsp;h &unknown;",
    ),
    "a\nb\nc & \"d\" 'e' • <f> 'g h &unknown;",
  );
  // A tag in a tag leaves no < behind; only an entity makes one.
  assert.equal(htmlText("x <<b>script>y &lt;z"), "x script>y <z");
});

test("a file of store/ has its short description and the detailed one after it, in any language", () => {
  assert.deepEqual(
    readListing(
      listing(SHORT, DETAILED, "Ausführliche").replaceAll("\n", "\r\n"),
    ),
    { short: SHORT, detailed: plainText(DETAILED) },
  );
  // Each of this repository, in its own language.
  for (const code of listingsOf(ROOT)) {
    const texts = readListing(
      readFileSync(join(ROOT, "store", `listing.${code}.md`), "utf8"),
    );
    assert.ok(
      "detailed" in texts,
      `store/listing.${code}.md has its descriptions`,
    );
    assert.match(texts.detailed, /Autodarts/);
    assert.doesNotMatch(texts.detailed, /\n|## /);
  }
});

test("a file without its descriptions where the check looks is a problem of the check", () => {
  const problem = {
    problem:
      'has no section "## Short description" followed by the section of the detailed description',
  };
  assert.deepEqual(readListing("# Listing\n\n## Name\n\nX\n"), problem);
  assert.deepEqual(readListing("# Listing\n\n## Short description"), problem);
  assert.deepEqual(
    readListing(
      "## Short description\n\nShort.\n\n## Permission justifications\n\n• storage\n",
    ),
    problem,
  );
});

test("a page of the store has the short description in its metadata, the detailed one after it, and the version", () => {
  assert.deepEqual(readPage(page()), {
    short: SHORT,
    detailed: plainText(DETAILED),
    version: "1.6.0",
  });
  // A paragraph before the short description is no pair of its own.
  assert.deepEqual(
    readPage(
      page({ short: "A", detailed: "B" }).replace(
        "<p>A</p>",
        "<p>Z</p><p>A</p>",
      ),
    ),
    { short: "A", detailed: "B", version: "1.6.0" },
  );
  // Only the label in English names the version.
  assert.deepEqual(readPage(page({ label: "Versie" })), {
    short: SHORT,
    detailed: plainText(DETAILED),
  });
});

test("a page without its texts where the check looks is a problem of the check", () => {
  assert.deepEqual(readPage("<html><p>a</p><p>b</p></html>"), {
    problem: "has no description in its metadata",
  });
  assert.deepEqual(
    readPage(
      page().replace(/<div jsname[\s\S]*<\/section><section/, "<section"),
    ),
    {
      problem:
        "has no paragraph with the short description followed by the detailed one",
      version: "1.6.0",
    },
  );
  assert.deepEqual(
    readPage(
      page({ version: null }).replace(
        /<p>Switch[\s\S]*?<\/p>/,
        "<p>Another short text</p>",
      ),
    ),
    {
      problem:
        "has no paragraph with the short description followed by the detailed one",
    },
  );
});

test("a difference names the words where the two texts part", () => {
  assert.equal(difference("a b c", "a b c"), undefined);
  assert.equal(
    difference(
      "Save each account once: after",
      "Save each account once. A tap",
    ),
    'the store has "once. A tap" where the file has "once: after"',
  );
  assert.equal(
    difference("Short text and more", "Short text"),
    'the store has "text" where the file has "text and more"',
  );
  assert.equal(
    difference("Text", ""),
    'the store has nothing more where the file has "Text"',
  );
  assert.equal(
    difference("x", `y ${"z".repeat(70)}`),
    `the store has "y ${"z".repeat(58)}…" where the file has "x"`,
  );
});

test("git tells since when a file has its descriptions, not counting a change of another section", () => {
  const now = listing(SHORT, DETAILED);
  const justified = now.replace("to keep the accounts", "to keep them");
  const before = listing(SHORT, "The text of the first release.");
  const files: Record<string, string> = {
    "HEAD:store/listing.en.md": now,
    "c3:store/listing.en.md": now,
    "c2:store/listing.en.md": justified,
    "c1:store/listing.en.md": before,
  };
  const git: Git = (args) =>
    args[0] === "log"
      ? "c3 2026-11-10T08:00:00+01:00\nc2 2026-11-01T08:00:00+01:00\nc1 2026-10-15T08:00:00+02:00\n"
      : files[args[1] ?? ""];
  assert.deepEqual(
    describedSince(git, "store/listing.en.md"),
    new Date("2026-11-01T08:00:00+01:00"),
  );
  // A commit whose file git can't show ends the history, as does a missing log.
  delete files["c2:store/listing.en.md"];
  assert.deepEqual(
    describedSince(git, "store/listing.en.md"),
    new Date("2026-11-10T08:00:00+01:00"),
  );
  assert.equal(
    describedSince(
      (args) => (args[0] === "log" ? undefined : now),
      "store/listing.en.md",
    ),
    undefined,
  );
  // Outside a checkout, git knows no file.
  assert.equal(
    describedSince(() => undefined, "store/listing.en.md"),
    undefined,
  );
});

test("git runs in the checkout, and fails outside of one", () => {
  const since = sinceInGit(ROOT, "store/listing.en.md");
  assert.ok(since instanceof Date && since.getTime() <= Date.now());
  const outside = mkdtempSync(join(tmpdir(), "no-git-"));
  try {
    assert.equal(
      gitIn(outside)(["--git-dir", join(outside, "none"), "log"]),
      undefined,
    );
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

test("a store that shows every text of store/ passes, one request for each language", async () => {
  await withRoot(async (root, file) => {
    const { code, lines, asked } = await runIn(root, SAME, {
      GITHUB_STEP_SUMMARY: file,
    });
    assert.equal(code, 0);
    assert.deepEqual(asked, [pageUrl("en"), pageUrl("de")]);
    assert.deepEqual(lines, [
      "store/listing.en.md: the same.",
      "store/listing.de.md: the same.",
    ]);
    const report = readFileSync(file, "utf8");
    assert.match(report, /### The descriptions on the Chrome Web Store/);
    assert.match(report, /\| \[de\]\(.*\?hl=de\) \| the same \| the same \|/);
    assert.match(
      report,
      /The store shows the descriptions of every file of `store\/`\./,
    );
  });
});

test("a store that shows another text fails, and names the file and the words", async () => {
  await withRoot(async (root, file) => {
    const { code, lines } = await runIn(
      root,
      {
        ...SAME,
        de: page({
          short: "Wechsle mit einem Tipp.",
          detailed: "Ein Display, alt.",
        }),
      },
      { GITHUB_STEP_SUMMARY: file },
    );
    assert.equal(code, 1);
    assert.equal(lines[0], "store/listing.en.md: the same.");
    assert.equal(
      lines[1],
      `::error file=store/listing.de.md,title=The store shows another description::${escapeData('The Chrome Web Store shows another text than store/listing.de.md: the store has "Display, alt." where the file has "Display für alle — „Konto“.". Paste the descriptions of the file into the Developer Dashboard.')}`,
    );
    const report = readFileSync(file, "utf8");
    assert.match(report, /\| \[de\]\(.*\) \| the same \| \*\*differs\*\* \|/);
    assert.match(
      report,
      /- \*\*store\/listing\.de\.md, the detailed description:\*\* the store has/,
    );
    assert.match(report, /What to do: paste the descriptions/);
    assert.doesNotMatch(
      report,
      /The store shows the descriptions of every file/,
    );
  });
});

test("in a pull request, which can't change the store, another text is a warning", async () => {
  await withRoot(async (root) => {
    const { code, lines } = await runIn(
      root,
      { ...SAME, en: page({ short: "An old short text." }) },
      { REPORT_ONLY: "true" },
    );
    assert.equal(code, 0);
    assert.match(
      lines[0] ?? "",
      /^::warning file=store\/listing\.en\.md,title=The store shows another description::.*the store has "An old short text\." where the file has "Switch between/,
    );
    // Without a file for the summary, the report goes to the output.
    assert.match(lines.at(-1) ?? "", /\| \*\*differs\*\* \| the same \|/);
  });
});

test("a text that changed in the last days may wait for the review of the store", async () => {
  await withRoot(async (root, file) => {
    const changed = new Date(NOW.getTime() - (GRACE_DAYS - 1) * DAY_MS);
    const old = new Date(NOW.getTime() - (GRACE_DAYS + 1) * DAY_MS);
    const { code, lines } = await runIn(
      root,
      {
        en: page({ short: "An old short text." }),
        de: page({ short: "Wechsle mit einem Tipp.", detailed: "Alt." }),
      },
      { GITHUB_STEP_SUMMARY: file },
      (_root, path) => (path.endsWith(".en.md") ? changed : old),
    );
    assert.equal(code, 1, "the German text is older than the grace");
    assert.equal(
      lines[0],
      "store/listing.en.md: differs, in review until 2026-11-13.",
    );
    assert.match(lines[1] ?? "", /^::error file=store\/listing\.de\.md,/);
    const report = readFileSync(file, "utf8");
    assert.match(
      report,
      /\| \[en\]\(.*\) \| differs, in review until 2026-11-13 \| the same \|/,
    );
    assert.match(
      report,
      /- store\/listing\.en\.md, the short description: .*so the paste may wait for the review of the store until 2026-11-13\./,
    );
  });
  await withRoot(async (root, file) => {
    const { code } = await runIn(
      root,
      { ...SAME, en: page({ short: "An old short text." }) },
      { GITHUB_STEP_SUMMARY: file },
      () => NOW,
    );
    assert.equal(code, 0);
    const report = readFileSync(file, "utf8");
    assert.doesNotMatch(report, /What to do/);
    assert.doesNotMatch(
      report,
      /The store shows the descriptions of every file/,
    );
  });
});

test("while the store publishes another version than the latest release, nothing is compared", async () => {
  await withRoot(
    async (root, file) => {
      const { code, lines } = await runIn(
        root,
        { en: page({ short: "Old." }), de: page({ short: "Alt." }) },
        { GITHUB_STEP_SUMMARY: file },
      );
      assert.equal(code, 0);
      assert.deepEqual(lines, [
        "store/listing.en.md: not compared.",
        "store/listing.de.md: not compared.",
      ]);
      const report = readFileSync(file, "utf8");
      assert.match(
        report,
        /The store publishes 1\.6\.0, the latest release is 1\.7\.0\. Until the store publishes it/,
      );
      assert.doesNotMatch(report, /The store shows the descriptions/);
    },
    undefined,
    "1.7.0",
  );
});

test("a page that names no version fails, as the check can't tell what the store publishes", async () => {
  await withRoot(async (root, file) => {
    const { code, lines } = await runIn(
      root,
      { ...SAME, en: page({ version: null }) },
      { GITHUB_STEP_SUMMARY: file },
    );
    assert.equal(code, 1);
    assert.match(
      lines[0] ?? "",
      /^::error title=The check can't read the store::The page of the store in the language en names no version/,
    );
    const report = readFileSync(file, "utf8");
    assert.match(report, /\| not compared \| not compared \|/);
    assert.match(report, /teach `readPage` of `scripts\/store-listing\.ts`/);
  });
});

test("a page that doesn't come, or has no texts, and a broken file fail, whether or not in a pull request", async () => {
  await withRoot(
    async (root, file) => {
      const { code, lines, asked } = await runIn(
        root,
        {
          en: new Error("getaddrinfo ENOTFOUND"),
          de: new Response("", { status: 503 }),
          fr: "<html></html>",
          // A failure that is no Error.
          nl: { throws: 42 },
        },
        { GITHUB_STEP_SUMMARY: file, REPORT_ONLY: "true" },
      );
      assert.equal(code, 1);
      // The page in English first, for its version, then the others in their order.
      assert.deepEqual(asked, [
        pageUrl("en"),
        pageUrl("de"),
        pageUrl("es"),
        pageUrl("fr"),
        pageUrl("nl"),
      ]);
      const errors = lines.filter((line) => line.startsWith("::error"));
      assert.equal(errors.length, 6);
      const report = readFileSync(file, "utf8");
      assert.match(
        report,
        /store\/listing\.en\.md: The page didn't answer \(getaddrinfo ENOTFOUND\), maybe an outage of the store/,
      );
      assert.match(report, /store\/listing\.de\.md: The page answered 503\./);
      assert.match(
        report,
        /store\/listing\.es\.md: The file has no section "## Short description"/,
      );
      assert.match(
        report,
        /store\/listing\.fr\.md: The page has no description in its metadata\./,
      );
      assert.match(
        report,
        /store\/listing\.nl\.md: The page didn't answer \(42\)/,
      );
      assert.match(report, /\| can't tell \| can't tell \|/);
    },
    {
      en: listing(SHORT, DETAILED),
      de: listing("Kurz.", "Lang."),
      es: "# Listing\n",
      fr: listing("Court.", "Long."),
      nl: listing("Kort.", "Lang."),
    },
  );
});

test("the workflow runs the file itself, which writes the report", async () => {
  await withRoot(async (_root, file) => {
    const script = fileURLToPath(
      new URL("../scripts/store-listing.ts", import.meta.url),
    );
    // No request leaves the test: the fetch of the child process fails at once.
    const offline =
      "data:text/javascript,globalThis.fetch=()=>Promise.reject(new Error('offline'))";
    const result = spawnSync(process.execPath, ["--import", offline, script], {
      env: { ...process.env, GITHUB_STEP_SUMMARY: file },
      encoding: "utf8",
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(
      result.stdout,
      /::error file=store\/listing\.en\.md,title=The check can't read the store::The page didn't answer \(offline\)/,
    );
    assert.match(readFileSync(file, "utf8"), /\| can't tell \| can't tell \|/);
  });
});
