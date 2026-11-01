// Lints the built extension in extension/ with addons-linter, the linter of
// addons.mozilla.org that `web-ext lint` runs, so that the extension keeps loading in
// Firefox and would pass the automatic review of addons.mozilla.org (decision 0012).
// It fails on every error, on every warning that ACCEPTED doesn't explain, and on an
// entry of ACCEPTED that no warning needs any more, so that the list stays true.
//
// Run by scripts/check-project.sh after scripts/check.sh built extension/lib/;
// scripts/check-firefox.test.mjs tests the judgement with made-up results.
import { fileURLToPath } from "node:url";

/** The warnings that the extension accepts, each with the reason why it may stay. */
export const ACCEPTED = {
  BACKGROUND_SERVICE_WORKER_IGNORED:
    "Firefox ignores background.service_worker, which Chrome and Edge run, and runs the same background.js " +
    "from background.scripts instead; scripts/check-manifest.mjs checks that both name it.",
};

/** The files of extension/ that the package leaves out, as scripts/package-extension.sh does. */
export function shipped(path) {
  return !path.endsWith(".map") && !/(^|[/\\])biome\.jsonc$/.test(path);
}

/** One finding of addons-linter as a line, with its file and line where it names them. */
function describe(kind, finding) {
  const where = [finding.file, finding.line].filter(Boolean).join(":");
  const text = [finding.message, finding.description]
    .flat()
    .filter(Boolean)
    .join(" ");
  return `${where || "extension/"}: ${kind} ${finding.code}: ${text}`;
}

/**
 * The problems in the results of addons-linter: every error, every warning whose code
 * `accepted` doesn't list, and every code of `accepted` that no warning has.
 *
 * @param {{errors?: object[], warnings?: object[]}} results what addons-linter found
 * @param {Record<string, string>} accepted the accepted warnings, by their code
 * @returns {string[]}
 */
export function judge(results, accepted = ACCEPTED) {
  const errors = results.errors ?? [];
  const warnings = results.warnings ?? [];
  const problems = errors.map((error) => describe("error", error));
  for (const warning of warnings) {
    if (!(warning.code in accepted)) {
      problems.push(describe("warning", warning));
    }
  }
  for (const code of Object.keys(accepted)) {
    if (!warnings.some((warning) => warning.code === code)) {
      problems.push(
        `addons-linter no longer warns ${code}; remove it from ACCEPTED in scripts/check-firefox.mjs.`,
      );
    }
  }
  return problems;
}

async function main() {
  // Imported here, so that the self-test runs without the linter and its rules.
  const { default: linter } = await import("addons-linter");
  const results = await linter
    .createInstance({
      config: {
        _: [fileURLToPath(new URL("../extension/", import.meta.url))],
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
        enableDataCollectionPermissions: true,
        shouldScanFile: shipped,
      },
      runAsBinary: false,
    })
    .run();
  const problems = judge(results);
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(problem);
    }
    console.error(
      "Why it matters: Firefox refuses an add-on with an error of addons-linter, and addons.mozilla.org " +
        "reviews it with the same rules. Fix the finding, or, for a warning that has to stay, add its code " +
        "to ACCEPTED in scripts/check-firefox.mjs with the reason. docs/development.md#firefox-and-edge " +
        "says how to try the extension in Firefox.",
    );
    process.exit(1);
  }
  const accepted = Object.keys(ACCEPTED).length;
  console.log(
    `addons-linter finds no error in extension/ and only the ${accepted} warning${accepted === 1 ? "" : "s"} ` +
      "that scripts/check-firefox.mjs accepts with its reason.",
  );
}

// Run as a script, not imported by its test.
if (import.meta.main) {
  await main();
}
