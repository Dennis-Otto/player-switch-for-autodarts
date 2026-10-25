# Test the real extension in Chromium against a fake Autodarts

- Status: accepted
- Date: 2026-10-25

## Context

The unit tests cover every line of `src/`, but none ran the code that Chrome runs:
the manifest, `background.js` with its imports of `lib/`, `content.js` in the
Autodarts page, the popup and the switcher. A wrong import path, a renamed message,
a permission missing from the manifest or a broken popup passed `scripts/check.sh`
and would have reached the Chrome Web Store, whose review takes days for every fix.
The risk at the heart of the extension, a refresh token sent twice, was tested only
against the fakes of `test/helpers.ts`, never between the real page, the content
script and the service worker.

A test in a browser must never reach the real Autodarts: it would sign in real
accounts and could spend their tokens. Google Chrome no longer loads an unpacked
extension from the command line since version 137.

## Options

1. **Test the extension by hand before each release**, as the release checklist
   did: slow, and it finds a broken release only after it was built.
2. **Playwright with its Chromium, and Playwright's routing** for the requests of
   the pages and the service worker: the routing misses the first request of a tab
   that the extension opens, so that request would go to the network.
3. **Playwright with its Chromium, and a fake Autodarts on the computer**, which
   `--host-resolver-rules` gives the two hosts of Autodarts to, while no other host
   resolves, with a certificate made for each run that the browser trusts by its
   key alone.
4. **The same in the Playwright image in Docker**: the same browser on every
   computer, at the price of a large image for every run of the CI.

## Decision

Option 3. Every request of the browser, of the page, of the service worker or of a
tab that the extension opens, reaches the fake or no host at all, so the tests can't
reach the real Autodarts even by mistake. The fake keeps the rules of Autodarts that
the extension depends on, the rotation of every refresh token and the end of a
session whose token comes back, and fails the test that sends a token twice. Each
test starts with a new profile, as after an install. The CI runs the tests natively
and keeps the browser in its cache; option 4 stays the way to run them on a computer
where Playwright's Chromium doesn't start.

## Consequences

- A change of the extension, of `src/` or of the tests runs the end-to-end tests in
  the workflow E2E; its check `e2e` is required, and a pull request that changes
  none of these passes it in seconds.
- A failed test keeps its trace and screenshots, in the CI as an artifact of the run.
- Playwright's Chromium is not Google Chrome: a difference of the branded browser,
  such as a policy of an organization, stays untested.
- The fake has to follow Autodarts: a change of its sign-in that breaks the
  extension in real life passes the tests until the fake learns it, as with the
  fakes of the unit tests.
- Renovate updates `@playwright/test` with the image of the pictures, in one pull
  request, and the CI downloads the browser of a new version once.
