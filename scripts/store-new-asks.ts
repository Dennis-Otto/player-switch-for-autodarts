// Finds what a release asks for beyond the version in the Chrome Web Store: the
// permissions, the hosts, the web-accessible pages and the languages. The Developer
// Dashboard wants a justification or a listing for each before the store takes a
// submission, and the API of the store can set none of them, so the store refuses the
// submission with INVALID_ITEM_METADATA. The job "store" of
// .github/workflows/publish-store.yml then names them; it reaches only Google, so the
// job "status" runs this file and hands the sentence on as an output.
// test/store-new-asks.test.ts tests it. No dependencies.
//
//   STATUS=status.json TAG=v1.2.3 GH_TOKEN=... GITHUB_REPOSITORY=owner/name \
//     GITHUB_OUTPUT=output node scripts/store-new-asks.ts
//
// It takes the version of the store from the answer of fetchStatus in the file STATUS,
// reads the manifest and the languages of that version and of the release from their
// tags, and writes new-asks=<sentence> to GITHUB_OUTPUT. A delivery doesn't depend on
// the sentence, so when it can't compare them, the sentence says so and the run goes on.
import { appendFileSync, readFileSync } from "node:fs";

import { isObject, parseStatus, required } from "./store-status.ts";

/** What a version of the extension asks for, each of which the dashboard wants to know. */
export interface Asks {
  readonly permissions: readonly string[];
  readonly hosts: readonly string[];
  readonly pages: readonly string[];
  readonly languages: readonly string[];
}

/** The way to GitHub of this file, which the tests replace. */
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const NOTHING: Asks = { permissions: [], hosts: [], pages: [], languages: [] };

/** A request that hangs must not hold up the delivery for long. */
const TIMEOUT_MS = 30_000;

const LIST = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

const array = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];

const strings = (value: unknown): string[] =>
  array(value).filter((entry): entry is string => typeof entry === "string");

/** Reads a manifest and the listing of its folder _locales; a part that is missing counts as none. */
export const readAsks = (manifest: unknown, locales: unknown): Asks => {
  const root = isObject(manifest) ? manifest : {};
  return {
    permissions: strings(root.permissions),
    hosts: strings(root.host_permissions),
    pages: array(root.web_accessible_resources).flatMap((entry) =>
      isObject(entry) ? strings(entry.resources) : [],
    ),
    languages: strings(
      array(locales).map((entry) => (isObject(entry) ? entry.name : undefined)),
    ),
  };
};

/** What the release asks for that the version of the store didn't. */
export const newAsks = (store: Asks, release: Asks): Asks => {
  const added = (key: keyof Asks): string[] =>
    release[key].filter((entry) => !store[key].includes(entry));
  return {
    permissions: added("permissions"),
    hosts: added("hosts"),
    pages: added("pages"),
    languages: added("languages"),
  };
};

const part = (noun: string, items: readonly string[]): string[] =>
  items.length === 0
    ? []
    : [`the ${noun}${items.length === 1 ? "" : "s"} ${LIST.format(items)}`];

/** The sentence for the summary and the annotation of a refused submission. */
export const describeAsks = (
  tag: string,
  published: string | undefined,
  asks: Asks,
): string => {
  const beyond =
    published === undefined
      ? "with no version published in the store yet"
      : `beyond the store's version ${published}`;
  const parts = [
    ...part("permission", asks.permissions),
    ...part("host", asks.hosts),
    ...part("web-accessible page", asks.pages),
    ...part("language", asks.languages),
  ];
  return parts.length === 0
    ? `${tag} asks for nothing ${beyond}, so the dashboard lacks something else.`
    : `What ${tag} asks for ${beyond}: ${parts.join("; ")}.`;
};

/** Compares the release with the version of the store, from their tags at GitHub. */
const compare = async (
  env: NodeJS.ProcessEnv,
  tag: string,
  fetcher: Fetch,
): Promise<string> => {
  const repository = required(env, "GITHUB_REPOSITORY");
  const token = required(env, "GH_TOKEN");
  const contents = async (ref: string, path: string): Promise<unknown> => {
    const response = await fetcher(
      `https://api.github.com/repos/${repository}/contents/${path}?ref=${encodeURIComponent(ref)}`,
      {
        headers: {
          // The content of a file itself; a folder is its listing either way.
          Accept: "application/vnd.github.raw+json",
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      throw new Error(
        `GitHub answered ${response.status} for ${path} at ${ref}`,
      );
    }
    return response.json();
  };
  const asks = async (ref: string): Promise<Asks> =>
    readAsks(
      await contents(ref, "extension/manifest.json"),
      await contents(ref, "extension/_locales"),
    );
  const { version } = parseStatus(
    JSON.parse(readFileSync(required(env, "STATUS"), "utf8")),
  ).published;
  const store = version === undefined ? NOTHING : await asks(`v${version}`);
  return describeAsks(tag, version, newAsks(store, await asks(tag)));
};

/** Writes the sentence as the output new-asks, in any case. */
export const run = async (
  env: NodeJS.ProcessEnv,
  fetcher: Fetch = fetch,
  log: (line: string) => void = console.log,
): Promise<void> => {
  const tag = required(env, "TAG");
  const output = required(env, "GITHUB_OUTPUT");
  let sentence: string;
  try {
    sentence = await compare(env, tag, fetcher);
  } catch (error) {
    sentence = `This run couldn't find out what ${tag} asks for beyond the version of the store (${String(error)}).`;
  }
  // An output ends at a line break, and whatever a manifest holds stays on the line.
  const line = sentence.replace(/\s+/g, " ");
  log(line);
  appendFileSync(output, `new-asks=${line}\n`);
};

if (import.meta.main) {
  await run(process.env);
}
