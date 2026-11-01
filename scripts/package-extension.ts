// Writes the zip of the extension that a release ships and the stores get, the same
// bytes for the same commit on every computer (decision 0013), so that anybody can
// check a zip against the source of its tag. scripts/package-extension.sh builds
// extension/lib/ and then runs this file; test/package-extension.test.ts tests it. No
// dependencies.
//
//   node scripts/package-extension.ts [FOLDER] [VERSION]
//
// writes FOLDER/<name of package.json>-<version>.zip, dist/ by default, and prints its
// path. The manifest sits at the root of the zip, which the stores ask for. A beta,
// such as 1.3.0-beta.2, comes from main, whose manifest still has the version of the
// last release: its zip gets 1.3.0, as a manifest takes only numbers, and the whole
// version as version_name. For any other VERSION, the manifest has to carry it.
//
// What makes the bytes the same: the files in the order of their bytes, each with the
// time of the commit (or of SOURCE_DATE_EPOCH) as the UTC of the zip, the same attributes
// on every system, nothing from the file system, and no compression. The bytes of
// zlib depend on its version and on the instructions of the processor, while a stored
// file is itself; the zip of the extension is some 330 KB rather than 110 KB, and the
// stores compress what they hand out. .gitattributes keeps LF in every checkout on
// Windows too.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { crc32 } from "node:zlib";

/**
 * The kinds of file that a package holds, by their path in extension/. Everything that
 * the extension loads is one of these, and nothing else reaches the users of a store.
 */
const SHIPS: readonly RegExp[] = [
  /^manifest\.json$/,
  /^_locales\/[A-Za-z_]+\/messages\.json$/,
  /^icons\/[a-z0-9-]+\.png$/,
  /^[a-z]+\.(?:html|css)$/,
  /^lib\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.js$/,
];

/**
 * The kinds of file in extension/ that stay out: the settings of Biome, and source
 * maps, which the stores don't want. scripts/check-firefox.mjs skips them as well.
 */
const STAYS_OUT: readonly RegExp[] = [/^biome\.jsonc$/, /\.map$/];

/** A file of the zip, by its path there. */
export interface ZipFile {
  readonly path: string;
  readonly data: Uint8Array;
}

/** The parts of a manifest that name a file, and its version. */
interface Manifest {
  readonly version: string;
  readonly action?: { readonly default_popup?: string };
  readonly options_ui?: { readonly page?: string };
  readonly background?: {
    readonly service_worker?: string;
    readonly scripts?: readonly string[];
  };
  readonly icons?: Readonly<Record<string, string>>;
  readonly content_scripts?: readonly {
    readonly js?: readonly string[];
    readonly css?: readonly string[];
  }[];
  readonly web_accessible_resources?: readonly {
    readonly resources?: readonly string[];
  }[];
}

/**
 * The files of a package: those that Git knows in extension/ and those that the build
 * wrote into lib/, which Git ignores. A file of no kind above fails the build, so that
 * a new kind of file reaches the stores only when someone chose that.
 */
export const chooseFiles = (
  tracked: readonly string[],
  built: readonly string[],
): string[] => {
  const files = [...new Set([...tracked, ...built])];
  const ships = (path: string): boolean =>
    SHIPS.some((kind) => kind.test(path));
  const strange = files.filter(
    (path) => !ships(path) && !STAYS_OUT.some((kind) => kind.test(path)),
  );
  if (strange.length > 0) {
    throw new Error(
      `extension/ holds ${strange.join(", ")}, of no kind that the package knows. Add the kind to SHIPS in scripts/package-extension.ts when the extension needs it, or to STAYS_OUT when it doesn't.`,
    );
  }
  return files.filter(ships);
};

/** The files that a manifest names, each of which the browser needs from the package. */
export const namedFiles = (manifest: Manifest): string[] =>
  [
    manifest.action?.default_popup,
    manifest.options_ui?.page,
    manifest.background?.service_worker,
    ...(manifest.background?.scripts ?? []),
    ...Object.values(manifest.icons ?? {}),
    ...(manifest.content_scripts ?? []).flatMap((script) => [
      ...(script.js ?? []),
      ...(script.css ?? []),
    ]),
    ...(manifest.web_accessible_resources ?? []).flatMap(
      (entry) => entry.resources ?? [],
    ),
  ].filter((path) => path !== undefined);

/**
 * The text of the manifest for a release, and the version that names the zip. Without a
 * release, it is the version of the manifest.
 */
export const stampVersion = (
  text: string,
  release: string,
): { readonly version: string; readonly text: string } => {
  const manifest = JSON.parse(text) as Manifest;
  if (release === "" || release === manifest.version) {
    return { version: manifest.version, text };
  }
  const numbers = /^([0-9]+(?:\.[0-9]+)*)-/.exec(release)?.[1];
  if (numbers === undefined) {
    throw new Error(
      `extension/manifest.json has the version ${manifest.version}, the release ${release}: the release bot writes the version of a release into the manifest, as release-please-config.json says.`,
    );
  }
  const beta = { ...manifest, version: numbers, version_name: release };
  return {
    version: release,
    text: `${JSON.stringify(beta, null, 2)}\n`,
  };
};

/**
 * A time as a zip keeps it: in fields without a time zone, here always those of UTC,
 * from 1980 on, with the seconds in twos.
 */
export const zipTime = (
  seconds: number,
): { readonly date: number; readonly time: number } => {
  const at = new Date(Math.max(seconds * 1000, Date.UTC(1980, 0, 1)));
  return {
    date:
      ((at.getUTCFullYear() - 1980) << 9) |
      ((at.getUTCMonth() + 1) << 5) |
      at.getUTCDate(),
    time:
      (at.getUTCHours() << 11) |
      (at.getUTCMinutes() << 5) |
      (at.getUTCSeconds() >> 1),
  };
};

/** The version of the zip format that a stored file needs, 1.0, as a zip keeps it. */
const FORMAT = 10;
/** Unix in the upper byte, so that every system writes the same bytes. */
const MADE_BY = (3 << 8) | FORMAT;
/** A plain file that its owner may write and everybody may read, on Unix. */
const FILE_MODE = (0o100644 << 16) >>> 0;

/** The bytes of a zip of these files, each stored as it is, by the format of PKWARE. */
export const zipBytes = (
  files: readonly ZipFile[],
  seconds: number,
): Buffer => {
  const { date, time } = zipTime(seconds);
  const sorted = files
    .map(({ path, data }) => ({ name: Buffer.from(path), data }))
    .sort((a, b) => Buffer.compare(a.name, b.name));
  const parts: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  for (const { name, data } of sorted) {
    // What the header of a file and its line in the directory have in common: no
    // flags, the method 0 (stored) and no extra fields, which would hold more times.
    const shared = Buffer.alloc(26);
    shared.writeUInt16LE(FORMAT, 0);
    shared.writeUInt16LE(time, 6);
    shared.writeUInt16LE(date, 8);
    shared.writeUInt32LE(crc32(data), 10);
    shared.writeUInt32LE(data.length, 14);
    shared.writeUInt32LE(data.length, 18);
    shared.writeUInt16LE(name.length, 22);

    const header = Buffer.alloc(4);
    header.writeUInt32LE(0x04034b50, 0);
    parts.push(header, shared, name, data);

    const start = Buffer.alloc(6);
    start.writeUInt32LE(0x02014b50, 0);
    start.writeUInt16LE(MADE_BY, 4);
    const rest = Buffer.alloc(14);
    rest.writeUInt32LE(FILE_MODE, 6);
    rest.writeUInt32LE(offset, 10);
    directory.push(start, shared, rest, name);

    offset += header.length + shared.length + name.length + data.length;
  }
  const lines = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(sorted.length, 8);
  end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(lines.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, lines, end]);
};

/** Writes the zip of the checkout in `root` and returns its path. */
export const run = (
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  root: string = process.cwd(),
): string => {
  const [out = "dist", release = ""] = args;
  const git = (...command: string[]): string =>
    execFileSync("git", command, { cwd: root, env, encoding: "utf8" });
  const folder = join(root, "extension");
  const lib = join(folder, "lib");
  const tracked = git("ls-files", "-z", "--", "extension")
    .split("\0")
    .filter((path) => path !== "")
    .map((path) => path.slice("extension/".length));
  const built = existsSync(lib)
    ? readdirSync(lib, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) =>
          relative(folder, join(entry.parentPath, entry.name)).replaceAll(
            "\\",
            "/",
          ),
        )
    : [];
  const paths = chooseFiles(tracked, built);

  const manifest = stampVersion(
    readFileSync(join(folder, "manifest.json"), "utf8"),
    release,
  );
  const missing = namedFiles(JSON.parse(manifest.text) as Manifest).filter(
    (path) => !paths.includes(path),
  );
  if (missing.length > 0) {
    throw new Error(
      `extension/manifest.json names ${missing.join(", ")}, which the package lacks: Git doesn't know the file, or the build didn't write it; bash scripts/package-extension.sh builds first.`,
    );
  }

  const epoch =
    env.SOURCE_DATE_EPOCH ||
    git("log", "-1", "--no-show-signature", "--format=%ct").trim();
  if (!/^[0-9]+$/.test(epoch)) {
    throw new Error(`SOURCE_DATE_EPOCH is no time in seconds: ${epoch}`);
  }
  const bytes = zipBytes(
    paths.map((path) => ({
      path,
      data:
        path === "manifest.json"
          ? Buffer.from(manifest.text)
          : readFileSync(join(folder, path)),
    })),
    Number(epoch),
  );

  const { name } = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  ) as { readonly name: string };
  mkdirSync(resolve(root, out), { recursive: true });
  const target = join(out, `${name}-${manifest.version}.zip`);
  writeFileSync(resolve(root, target), bytes);
  return target.replaceAll("\\", "/");
};

if (import.meta.main) {
  try {
    console.log(run(process.argv.slice(2), process.env));
  } catch (error) {
    console.error(String(error));
    process.exitCode = 1;
  }
}
