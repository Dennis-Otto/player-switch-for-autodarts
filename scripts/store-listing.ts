// Checks that the Chrome Web Store shows the descriptions of store/: for each
// listing, store/listing.<code>.md, its short and its detailed description against
// the public page of the item in that language. The texts reach the store only by a
// paste into the Developer Dashboard, whose API can't set them, so this is how a
// forgotten paste shows up before a player reads an old text.
// .github/workflows/upstream.yml runs this file every morning;
// test/store-listing.test.ts tests it. No dependencies and no secret: it reads the
// pages that anybody can open, one request for each language.
//
//   node scripts/store-listing.ts
//
// Both texts are reduced to plain text with the whitespace collapsed, so the line
// breaks of the files don't count. It compares only when the store publishes the
// version of extension/manifest.json, the latest release: while a new release waits
// for its review, the store may show the texts of the one before. A listing whose
// descriptions changed in the last GRACE_DAYS days, by the history of git, may differ
// as well, as a pasted text waits for the review of the store too. It writes its report to the file
// GITHUB_STEP_SUMMARY, or to the output when the variable is missing, an annotation
// for each difference, and exits with 1 when the store shows another text, or when
// the page no longer has its texts where the check looks for them. With
// REPORT_ONLY=true, as in a pull request, which can't change the store, a different
// text is a warning.
import { spawnSync } from "node:child_process";
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The item in the Chrome Web Store, the 32 letters in the address of its page. */
export const ITEM_ID = "gbijblgchbbbkjeibpjaodflfgbgefam";

/** The public page of the item; `hl` picks the language of its listing. */
export const pageUrl = (code: string): string =>
  `https://chromewebstore.google.com/detail/${ITEM_ID}?hl=${code.replace("_", "-")}`;

/**
 * The days that a listing whose descriptions changed may still differ: the paste goes through
 * the review of the store, which store-status.mjs of the publish workflow allows as
 * many days.
 */
export const GRACE_DAYS = 7;

/** How long the check waits for a page of the store. */
export const TIMEOUT_MS = 20_000;

/** The language whose page names the version, under the label "Version". */
export const VERSION_LANGUAGE = "en";

export const DOCS =
  "https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/docs/releases.md#the-texts-of-the-store";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DAY_MS = 24 * 60 * 60 * 1000;

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Keeps a message on the one line of a workflow command of GitHub. */
export const escapeData = (text: string): string =>
  text.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");

/** A text as the store shows it and as it is compared: whitespace collapsed. */
export const plainText = (text: string): string =>
  text.replaceAll(/\s+/g, " ").trim();

const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

/** The text of a piece of HTML: a line break for each <br>, no tags, no entities. */
export const htmlText = (html: string): string =>
  html
    // A < outside a tag goes too: the text of a page has each of its own as &lt;.
    .replaceAll(/<[^>]*>|</g, (tag) => (/^<br\s*\/?>$/i.test(tag) ? "\n" : ""))
    .replaceAll(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
      if (name.startsWith("#")) {
        const hex = /^#x/i.test(name);
        return String.fromCodePoint(
          Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10),
        );
      }
      return ENTITIES[name.toLowerCase()] ?? entity;
    });

/** The two descriptions of a listing, or what keeps the check from reading them. */
export type Texts =
  | { readonly short: string; readonly detailed: string }
  | { readonly problem: string };

const SHORT = "Short description";
const JUSTIFICATIONS = "Permission justifications";

/**
 * The descriptions of a file of store/: the section "Short description", and the one
 * after it, whose heading each language words in its own way.
 */
export const readListing = (markdown: string): Texts => {
  const sections = markdown
    .replaceAll("\r\n", "\n")
    .split(/^## /m)
    .slice(1)
    .map((section) => {
      const end = section.indexOf("\n");
      return end === -1
        ? { heading: section.trim(), body: "" }
        : { heading: section.slice(0, end).trim(), body: section.slice(end) };
    });
  const at = sections.findIndex(({ heading }) => heading === SHORT);
  const short = sections[at];
  const detailed = sections[at + 1];
  if (!short || !detailed || detailed.heading === JUSTIFICATIONS) {
    return {
      problem: `has no section "## ${SHORT}" followed by the section of the detailed description`,
    };
  }
  return {
    short: plainText(short.body),
    detailed: plainText(detailed.body),
  };
};

/** The descriptions on a page of the store, and the version it names, if any. */
export type Page = Texts & { readonly version?: string };

/**
 * Reads a page of the store. The short description is the description of the page
 * in its metadata; the Overview shows it as a paragraph, and the detailed description
 * as the paragraph right after it.
 */
export const readPage = (html: string): Page => {
  const meta = /<meta name="description" content="([^"]*)"/.exec(html);
  const version = />Version<\/div>\s*<div[^>]*>\s*([\d.]+)\s*</.exec(html)?.[1];
  const withVersion = version === undefined ? {} : { version };
  if (!meta) {
    return { problem: "has no description in its metadata", ...withVersion };
  }
  const short = plainText(htmlText(String(meta[1])));
  for (const paragraph of html.matchAll(
    // The paragraph after it is looked at without taking it, so that it can be the
    // first of the next pair.
    /<p(?:\s[^>]*)?>((?:(?!<\/p>)[\s\S])*)<\/p>(?=\s*<p(?:\s[^>]*)?>((?:(?!<\/p>)[\s\S])*)<\/p>)/g,
  )) {
    const [, first, next] = paragraph;
    if (plainText(htmlText(String(first))) === short) {
      return {
        short,
        detailed: plainText(htmlText(String(next))),
        ...withVersion,
      };
    }
  }
  return {
    problem:
      "has no paragraph with the short description followed by the detailed one",
    ...withVersion,
  };
};

/** Where two texts first differ, from the start of that word, or undefined. */
export const difference = (
  expected: string,
  found: string,
): string | undefined => {
  if (expected === found) {
    return undefined;
  }
  let at = 0;
  while (at < expected.length && expected[at] === found[at]) {
    at++;
  }
  const start = expected.lastIndexOf(" ", at - 1) + 1;
  const words = (text: string): string => {
    const part = text.slice(start, start + 60);
    return part === ""
      ? "nothing more"
      : `"${part}${text.length > start + 60 ? "…" : ""}"`;
  };
  return `the store has ${words(found)} where the file has ${words(expected)}`;
};

/** What the check found for one language. */
export interface Row {
  readonly code: string;
  readonly file: string;
  /** The page or the file can't be read: the check can't compare. */
  readonly problem?: string;
  readonly short?: string;
  readonly detailed?: string;
  /** The day until which a difference waits for the review of a pasted text. */
  readonly waitsUntil?: Date;
}

export interface Report {
  /** The version that the store publishes, if its page names it. */
  readonly store: string | undefined;
  /** The version of extension/manifest.json, the latest release. */
  readonly release: string;
  /** False while the store publishes another version: nothing is compared. */
  readonly compared: boolean;
  readonly rows: readonly Row[];
  /** The page names no version: the check can't tell what the store publishes. */
  readonly problem?: string;
}

/** The listings of store/, by their language. */
export const listingsOf = (root: string): string[] =>
  readdirSync(join(root, "store"))
    .map((name) => /^listing\.([\w-]+)\.md$/.exec(name)?.[1])
    .filter((code) => code !== undefined)
    .sort();

/** Runs git in a folder: its output, or undefined when it fails. */
export type Git = (args: readonly string[]) => string | undefined;

export const gitIn =
  (root: string): Git =>
  (args) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    return result.status === 0 ? result.stdout : undefined;
  };

const sameTexts = (a: Texts, b: Texts): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Since when a file of store/ has its descriptions as they are now: the date of the
 * oldest commit of the history without a change of them since. A change of another
 * section, such as the justifications, doesn't count. Undefined outside a checkout,
 * or for a file that git doesn't know.
 */
export const describedSince = (git: Git, file: string): Date | undefined => {
  const current = git(["show", `HEAD:${file}`]);
  if (current === undefined) {
    return undefined;
  }
  const texts = readListing(current);
  let since: Date | undefined;
  const history = git(["log", "--format=%H %cI", "--", file]) ?? "";
  for (const [, hash, date] of history.matchAll(/^(\w+) (\S+)$/gm)) {
    const then = git(["show", `${hash}:${file}`]);
    if (then === undefined || !sameTexts(readListing(then), texts)) {
      break;
    }
    since = new Date(String(date));
  }
  return since;
};

/** Since when a file of a checkout has its descriptions, by the history of its git. */
export const sinceInGit = (root: string, file: string): Date | undefined =>
  describedSince(gitIn(root), file);

/** Asks the store for one page; a page that doesn't come is a problem of the check. */
const fetchPage = async (
  fetcher: Fetch,
  code: string,
): Promise<{ html: string } | { problem: string }> => {
  try {
    const response = await fetcher(pageUrl(code), {
      headers: { "accept-language": code.replace("_", "-") },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      return { problem: `answered ${response.status}` };
    }
    return { html: await response.text() };
  } catch (error) {
    return {
      problem: `didn't answer (${error instanceof Error ? error.message : String(error)}), maybe an outage of the store, which the next run shows`,
    };
  }
};

export interface Inputs {
  readonly fetcher: Fetch;
  readonly root: string;
  /** Since when a file of a checkout has its descriptions as they are now, if known. */
  readonly since: (root: string, file: string) => Date | undefined;
  readonly now: Date;
}

/** Compares every listing of store/ with its page, one page after another. */
export const check = async ({
  fetcher,
  root,
  since,
  now,
}: Inputs): Promise<Report> => {
  const manifest: unknown = JSON.parse(
    readFileSync(join(root, "extension", "manifest.json"), "utf8"),
  );
  const release = String((manifest as { version?: unknown }).version);
  const codes = listingsOf(root);
  // The page that names the version first, whether or not it has a file.
  const pages = new Map<string, Page>();
  for (const code of new Set([VERSION_LANGUAGE, ...codes])) {
    const page = await fetchPage(fetcher, code);
    pages.set(code, "html" in page ? readPage(page.html) : page);
  }
  const store = pages.get(VERSION_LANGUAGE)?.version;
  const compared = store === release;
  const rows = [...pages]
    .filter(([code]) => codes.includes(code))
    .map(([code, page]): Row => {
      const file = `store/listing.${code}.md`;
      const listing = readListing(readFileSync(join(root, file), "utf8"));
      if ("problem" in listing) {
        return { code, file, problem: `The file ${listing.problem}.` };
      }
      if ("problem" in page) {
        return { code, file, problem: `The page ${page.problem}.` };
      }
      if (!compared) {
        return { code, file };
      }
      const short = difference(listing.short, page.short);
      const detailed = difference(listing.detailed, page.detailed);
      const at = since(root, file);
      const until =
        at === undefined
          ? undefined
          : new Date(at.getTime() + GRACE_DAYS * DAY_MS);
      const waits =
        (short ?? detailed) !== undefined && until !== undefined && now < until;
      return {
        code,
        file,
        ...(short === undefined ? {} : { short }),
        ...(detailed === undefined ? {} : { detailed }),
        ...(waits ? { waitsUntil: until } : {}),
      };
    });
  return {
    store,
    release,
    compared,
    rows,
    ...(store === undefined
      ? {
          problem: `The page of the store in the language ${VERSION_LANGUAGE} names no version under "Version", so the check can't tell whether it publishes the latest release.`,
        }
      : {}),
  };
};

const day = (date: Date): string => date.toISOString().slice(0, 10);

/** Whether a row shows a text that differs, and isn't waiting for a review. */
export const differs = (row: Row): boolean =>
  (row.short ?? row.detailed) !== undefined && row.waitsUntil === undefined;

/** What keeps the check from comparing, with the file that each is about. */
const problemsOf = (report: Report): { file?: string; problem: string }[] => [
  ...(report.problem ? [{ problem: report.problem }] : []),
  ...report.rows.flatMap(({ file, problem }) =>
    problem ? [{ file, problem }] : [],
  ),
];

const state = (report: Report, row: Row, part: string | undefined): string => {
  if (row.problem) {
    return "can't tell";
  }
  if (!report.compared) {
    return "not compared";
  }
  if (part === undefined) {
    return "the same";
  }
  return row.waitsUntil
    ? `differs, in review until ${day(row.waitsUntil)}`
    : "**differs**";
};

/** The report for the job summary: a table of every language and what to do. */
export const summary = (report: Report): string => {
  const lines = [
    "### The descriptions on the Chrome Web Store",
    "",
    "| Language | Short description | Detailed description |",
    "| --- | --- | --- |",
    ...report.rows.map(
      (row) =>
        `| [${row.code}](${pageUrl(row.code)}) | ${state(report, row, row.short)} | ${state(report, row, row.detailed)} |`,
    ),
    "",
  ];
  if (report.store !== undefined && !report.compared) {
    lines.push(
      `The store publishes ${report.store}, the latest release is ${report.release}. Until the store publishes it, the store may show the texts of the version before, so nothing is compared.`,
      "",
    );
  }
  const problems = problemsOf(report);
  for (const { file, problem } of problems) {
    lines.push(`- **${file ? `${file}: ` : ""}${problem}**`);
  }
  for (const row of report.rows) {
    for (const [what, part] of [
      ["short", row.short],
      ["detailed", row.detailed],
    ] as const) {
      if (part === undefined) {
        continue;
      }
      lines.push(
        row.waitsUntil
          ? `- ${row.file}, the ${what} description: ${part}. The file has had this text for less than ${GRACE_DAYS} days, so the paste may wait for the review of the store until ${day(row.waitsUntil)}.`
          : `- **${row.file}, the ${what} description:** ${part}.`,
      );
    }
  }
  if (report.rows.some(differs)) {
    lines.push(
      "",
      `What to do: paste the descriptions of each file that differs into **Store listing** of the Developer Dashboard, in its language, and submit them for review: ${DOCS}`,
    );
  }
  if (problems.length > 0) {
    lines.push(
      "",
      `What to do: a page that didn't answer comes back with the next run. When the page answered and the check found no texts or no version in it, the store changed its page: open it, and teach \`readPage\` of \`scripts/store-listing.ts\` the new form: ${DOCS}`,
    );
  } else if (
    report.compared &&
    report.rows.every((row) => (row.short ?? row.detailed) === undefined)
  ) {
    lines.push("The store shows the descriptions of every file of `store/`.");
  }
  return `${lines.join("\n")}\n`;
};

/** Runs the check with the variables of the workflow; returns the exit code. */
export const run = async (
  env: NodeJS.ProcessEnv,
  fetcher: Fetch = fetch,
  log: (line: string) => void = console.log,
  root: string = ROOT,
  since: (root: string, file: string) => Date | undefined = sinceInGit,
  now: Date = new Date(),
): Promise<number> => {
  const report = await check({ fetcher, root, since, now });
  const reportOnly = env.REPORT_ONLY === "true";
  const problems = problemsOf(report);
  for (const { file, problem } of problems) {
    log(
      `::error ${file ? `file=${file},` : ""}title=The check can't read the store::${escapeData(problem)}`,
    );
  }
  for (const row of report.rows.filter((row) => !row.problem)) {
    if (differs(row)) {
      const parts = [row.short, row.detailed].filter(
        (part) => part !== undefined,
      );
      log(
        `::${reportOnly ? "warning" : "error"} file=${row.file},title=The store shows another description::${escapeData(`The Chrome Web Store shows another text than ${row.file}: ${parts.join("; ")}. Paste the descriptions of the file into the Developer Dashboard.`)}`,
      );
    } else {
      log(`${row.file}: ${state(report, row, row.short ?? row.detailed)}.`);
    }
  }
  const text = summary(report);
  const file = env.GITHUB_STEP_SUMMARY;
  if (file) {
    appendFileSync(file, text);
  } else {
    log(text);
  }
  const failed =
    problems.length > 0 || (!reportOnly && report.rows.some(differs));
  return failed ? 1 : 0;
};

if (import.meta.main) {
  process.exitCode = await run(process.env);
}
