# Lint with web-ext and test the add-on in a real Firefox

- Status: accepted
- Date: 2026-11-07

## Context

[0012](0012-run-one-package-in-chrome-edge-and-firefox.md) made one package run in
Chrome, Edge and Firefox. It linted the package with addons-linter alone, to spare the
packages that `web-ext` brings, and left Firefox to a check by hand before each
release, because Playwright loads no add-on into Firefox and the end-to-end tests of
[0007](0007-test-the-real-extension-against-a-fake-autodarts.md) run in Chromium
alone. That check never ran: it needs a Firefox and test accounts of Autodarts, so the
docs called Firefox a preview. Issue #83 asks for `web-ext lint` in the checks and an
extension that runs in Firefox; the maintainer chose both on 2026-11-07, without a
listing on addons.mozilla.org.

Firefox can be driven without Playwright: its WebDriver BiDi installs an add-on as a
temporary one, as `about:debugging` does, and Puppeteer speaks it. BiDi doesn't reach
the pages of an add-on yet (Mozilla's bug 1755014): it sends no event of a
`moz-extension://` page and lists no frame of one, but it evaluates a script in such a
tab, and the keyboard reaches a frame that has the focus.

## Options

1. Keep addons-linter alone and the check by hand. Fewer packages, but Firefox stays
   untested and the docs stay with a preview.
2. `web-ext lint` in the checks, and tests in a real Firefox in the workflow E2E, with
   Puppeteer over WebDriver BiDi against the same fake Autodarts.
3. Selenium with geckodriver for the tests. It installs add-ons as well, but brings a
   driver of its own to download, and the rest of the tests use nothing like it.

## Decision

Option 2.

- `scripts/check-firefox.mjs` runs the lint of web-ext, `cmd.lint` of its API, which
  `web-ext lint` runs, with the file filter of the package. web-ext 10.8.0 is pinned
  exactly, and its addons-linter with it; it fails on the same findings as before.
- `test/firefox/` installs `extension/` into the Firefox of the runner with
  `browser.installExtension` of Puppeteer 25, pinned exactly. Firefox sends every
  request through a proxy of the test, which tunnels play.autodarts.com and
  api.autodarts.com to the fake server and refuses every other host. The tests save two
  accounts and switch between them from the popup, and from the switcher in the page
  with the keyboard. The profile names the uuid of the add-on, so the popup has a fixed
  address, and Firefox runs with `--remote-allow-system-access`, without which BiDi
  opens no `moz-extension://` page.
- The job `firefox` of the workflow E2E runs them beside the Chromium tests, and the
  required check `e2e` waits for both.

## Consequences

- The docs name Firefox 140 and newer as supported, not as a preview. The tests run in
  the newest Firefox of the runner image; Firefox ESR 140, the oldest that the manifest
  allows, passed them when they were written.
- The tests in Firefox can't read the console of the background or the storage of the
  add-on, and can't look into the switcher's frame, until BiDi reaches extension
  pages. What only those show stays with the Chromium tests and the unit tests.
- web-ext brings 157 packages more than addons-linter alone, all of them tools of the
  checks that no release ships; `test/advisories.test.ts` keeps their advisories in
  view, as before.
- A listing on addons.mozilla.org and in the Edge Add-ons store stays a follow-up for
  the maintainer, with new accounts and secrets (`docs/releases.md`).
