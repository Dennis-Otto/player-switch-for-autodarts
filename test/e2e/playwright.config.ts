/**
 * The end-to-end tests: the built extension in Playwright's Chromium against a fake
 * Autodarts (fixtures.ts). `npm run e2e` builds the extension and runs them;
 * `npm run e2e -- --headed` shows the browser, and `--debug` steps through a test.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const ci = process.env.CI !== undefined;
// Every path from this folder, also when the configuration in the root loads this one.
const here = path.dirname(fileURLToPath(import.meta.url));
const report = path.join(here, "report");

export default defineConfig({
  testDir: here,
  testMatch: "**/*.spec.ts",
  outputDir: path.join(here, "results"),
  // A test waits for what the extension and the page do, never for a fixed time.
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: ci,
  // A failure is a finding: a test that passes only on its second try has found a
  // race of the extension, so Playwright tries no test twice. In the CI, the
  // flaky-test bot of the blueprint runs a failed job once more and reports a test
  // that passes then as flaky, in its issue.
  retries: 0,
  reporter: ci
    ? [["github"], ["list"], ["html", { open: "never", outputFolder: report }]]
    : [["list"], ["html", { open: "never", outputFolder: report }]],
  use: {
    // The trace keeps every step, request and DOM snapshot of a test that failed:
    // npx playwright show-trace test/e2e/results/<test>/trace.zip
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
