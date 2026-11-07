// Lints the built extension in extension/ with `web-ext lint`, Mozilla's tool for
// add-ons, which runs addons-linter, the linter of addons.mozilla.org, so that the
// extension keeps loading in Firefox and would pass the automatic review of
// addons.mozilla.org (decisions 0012 and 0015).
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
    "from background.scripts instead; scripts/check-extension.mjs checks that both name it.",
};

/**
 * Whether the package holds a file of extension/: without source maps, TypeScript, the
 * configuration of tools and hidden files, as scripts/package-extension.sh of the
 * blueprint leaves them out, which test/store-kind.test.ts keeps so.
 */
export function shipped(path) {
  const parts = path.split(/[/\\]/);
  const name = parts.at(-1);
  return (
    !/\.(?:map|ts)$/.test(name) &&
    !/^(?:biome\.jsonc?|tsconfig.*\.json)$/.test(name) &&
    !parts.some((part) => part.startsWith("."))
  );
}

/** One finding of the linter as a line, with its file and line where it names them. */
function describeFinding(kind, finding) {
  const where = [finding.file, finding.line].filter(Boolean).join(":");
  const text = [finding.message, finding.description]
    .flat()
    .filter(Boolean)
    .join(" ");
  return `${where || "extension/"}: ${kind} ${finding.code}: ${text}`;
}

/**
 * The problems in the results of `web-ext lint`: every error, every warning whose code
 * `accepted` doesn't list, and every code of `accepted` that no warning has.
 *
 * @param {{errors?: object[], warnings?: object[]}} results what `web-ext lint` found
 * @param {Record<string, string>} accepted the accepted warnings, by their code
 * @returns {string[]}
 */
export function judge(results, accepted = ACCEPTED) {
  const errors = results.errors ?? [];
  const warnings = results.warnings ?? [];
  const problems = errors.map((error) => describeFinding("error", error));
  for (const warning of warnings) {
    if (!(warning.code in accepted)) {
      problems.push(describeFinding("warning", warning));
    }
  }
  for (const code of Object.keys(accepted)) {
    if (!warnings.some((warning) => warning.code === code)) {
      problems.push(
        `web-ext lint no longer warns ${code}; remove it from ACCEPTED in scripts/check-firefox.mjs.`,
      );
    }
  }
  return problems;
}

async function main() {
  // Imported here, so that the self-test runs without web-ext and its linter.
  const { cmd } = await import("web-ext");
  // The options of `web-ext lint --source-dir extension/ --output none --boring`; the
  // file filter is the one of the package instead of web-ext's own, which only leaves
  // out hidden files and archives.
  const results = await cmd.lint(
    {
      sourceDir: fileURLToPath(new URL("../extension/", import.meta.url)),
      output: "none",
      boring: true,
      metadata: false,
      pretty: false,
      privileged: false,
      selfHosted: false,
      verbose: false,
      warningsAsErrors: false,
    },
    {
      shouldExitProgram: false,
      createFileFilter: () => ({ wantFile: shipped }),
    },
  );
  const problems = judge(results);
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(problem);
    }
    console.error(
      "Why it matters: Firefox refuses an add-on with an error of `web-ext lint`, and addons.mozilla.org " +
        "reviews it with the same rules. Fix the finding, or, for a warning that has to stay, add its code " +
        "to ACCEPTED in scripts/check-firefox.mjs with the reason. docs/development.md#firefox-and-edge " +
        "says how to try the extension in Firefox, and `npx web-ext lint --source-dir extension` runs the lint alone.",
    );
    process.exit(1);
  }
  const accepted = Object.keys(ACCEPTED).length;
  console.log(
    `web-ext lint finds no error in extension/ and only the ${accepted} warning${accepted === 1 ? "" : "s"} ` +
      "that scripts/check-firefox.mjs accepts with its reason.",
  );
}

// Run as a script, not imported by its test.
if (import.meta.main) {
  await main();
}
