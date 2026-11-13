# Test the oldest browsers that the manifest allows, and the next Firefox, every morning

- Status: accepted
- Date: 2026-11-13

## Context

The manifest allows Chrome 140 and Firefox 140 and newer (`minimum_chrome_version`,
`strict_min_version`), and the README promised the same, but the checks ran the
extension only in new browsers: Playwright's Chromium and the Firefox of the runner
image in the workflow E2E, and Chrome for Testing Beta in the workflow Upstream
([decision 0009](0009-watch-autodarts-and-the-next-chrome-before-the-players-do.md)).
Firefox 140 ESR, 153 ESR and 159 were tried once by hand
([decision 0015](0015-lint-with-web-ext-and-test-in-a-real-firefox.md)), Chrome 140
never.

`tsconfig.json` builds with the types of the newest DOM, so nothing kept the code to
what the oldest browser has. Displays in a kiosk, such as a Raspberry Pi or a thin
client, often stay on an older Chromium or on Firefox ESR, which would install a
package that then fails as it runs. And the next Firefox wasn't watched at all: a
break showed only once the runner image had that Firefox, after the players had it.

Mozilla shipped the last update of Firefox 140 ESR, 140.17.0esr, on 2026-09-29; its
list of versions names 153 ESR as the ESR now, and Firefox moves the computers of an
ended ESR to the next one by itself.

## Options

1. **The tests in the oldest versions, in every pull request.** Two more browser jobs
   in every pull request that changes the extension, in the queue of GitHub Actions
   that the free plan shares among every repository.
2. **The tests in the oldest versions and in Firefox Beta, every morning in Upstream.**
   A change that needs a newer browser shows the morning after its merge, weeks before
   a release reaches a display.
3. **A list of the interfaces that the code uses, compared with the minimum.** No such
   list exists for both browsers in a form that a check can read, and it would miss
   what only running shows.

## Decision

Option 2. The workflow Upstream gets two jobs beside `chrome-beta`:

- `oldest-browsers` runs the end-to-end tests of `test/e2e/` in Chrome for Testing 140
  and the tests of `test/firefox/` in Firefox 153 ESR, the oldest versions that the
  manifest allows. `OLDEST_CHROME` and `OLDEST_FIREFOX` of the job name them, and
  `test/oldest-browsers.test.ts` fails when the manifest names others, so the manifest
  promises only what a check runs.
- `firefox-beta` runs the tests of `test/firefox/` in Firefox Beta, about four weeks
  before that version reaches the players, as `chrome-beta` does for Chrome.

Both download with `@puppeteer/browsers`, which comes with puppeteer-core, the driver
of the tests in Firefox, and installs a fixed version of Chrome for Testing or any
version of Firefox from Mozilla's archive. `scripts/chrome-for-testing.sh` of the
blueprint downloads only the latest build of a channel.

`strict_min_version` rises from 140.0 to 153.0: Mozilla no longer supports 140 ESR,
and the oldest Firefox that a check runs is the oldest ESR that it supports. Chrome
has no ESR, and Chrome for Testing 140 still runs, so `minimum_chrome_version` stays
140, the first version in which `chrome.storage.local.setAccessLevel` works.

## Consequences

- A failure of either job opens an issue of the bot-health bot, which the next run
  that passes closes, as for every job of Upstream; the PR coach explains both
  (`.github/checks.project.toml`).
- When Mozilla ends an ESR, or a minimum version can't be run any more, the minimum
  rises to the oldest version that a check runs: the version of the job, the manifest,
  the README and the help together.
- A change that needs a newer browser than the minimum shows the morning after its
  merge, not in its pull request; a pull request that changes the workflow Upstream
  runs both jobs.
- Firefox 140 to 152 no longer installs the add-on. They are out of support, and a
  computer on 140 ESR has moved to 153 ESR by itself.
