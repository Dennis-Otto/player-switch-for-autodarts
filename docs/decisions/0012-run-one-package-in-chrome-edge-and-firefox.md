# Run one package in Chrome, Edge and Firefox

- Status: accepted
- Date: 2026-10-25

## Context

The extension was built for Chrome. Microsoft Edge is built on Chromium and runs the
same package, but the README named only Chrome. Firefox could not run it at all: its
Manifest V3 runs a background from `background.scripts`, as an event page, and ignores
`background.service_worker`, and it wants an id of the add-on in
`browser_specific_settings.gecko`. Since November 2025, addons.mozilla.org also asks
every new add-on to declare in `data_collection_permissions` the data that it sends off
the computer, which Firefox 140 and newer show at the install. Nothing checked the
extension against the rules of Firefox.

Two things in the code assumed Chrome. The service worker took a request to see the
accounts only from an address `chrome-extension://<id>/`, while Firefox serves the
pages of an add-on from `moz-extension://<uuid>/`, with a random host for each
installation; in Firefox the popup would have been turned away. And the bug form named
the browser from `navigator.userAgentData`, which Firefox doesn't have, so it said
"unknown".

## Options

1. **One package with one manifest for every browser**: `background` names
   `background.js` both as `service_worker` and in `scripts`. Chrome 121 and newer and
   Edge ignore `scripts` when there is a service worker, Firefox 121 and newer ignores
   `service_worker`, and every browser ignores the keys of the others.
2. **A second manifest for Firefox**, written by `scripts/package-extension.sh` into a
   zip of its own: each store gets only its own keys, but there are two packages to
   test and to release, and the folder `extension/` no longer loads in Firefox as it is.
3. **Chrome alone**, as before.

For the data that Firefox shows at the install, the extension sends the session tokens
of the saved accounts, and the username and password of an account whose password it
remembers, to the sign-in service of Autodarts, and nothing to the developer or to
anyone else. The policy of addons.mozilla.org counts all data "handled outside of the
add-on or the local browser", and names no exception for the service that the add-on
works with. So the choice is between `none` and `authenticationInfo`.

To lint, `web-ext lint` runs addons-linter, the linter of addons.mozilla.org. `web-ext`
also starts Firefox and Chrome, signs add-ons and talks to Android devices, which
brings 327 packages with it; addons-linter alone brings 190.

## Decision

Option 1. The release builds one package, which the Chrome Web Store, Edge and Firefox
all take, and `extension/` loads as it is in each browser. The manifest names:

- `browser_specific_settings.gecko.id` `player-switch-for-autodarts@dennis-otto.github.io`,
  which never changes, because Firefox keeps the storage of an add-on under its id;
- `strict_min_version` 140.0 for Firefox and 142.0 for Firefox for Android, the first
  versions that show the data at the install; every interface that the extension uses
  is older, such as `storage.session` (115), ES modules in the background (112) and
  `scripting` (102);
- `data_collection_permissions` with `required: ["authenticationInfo"]` and no optional
  data. That says what happens, the user agrees to it at the install, and
  `docs/privacy.md` explains that it goes to Autodarts alone; the privacy practices of
  the Chrome Web Store declare the same, *authentication information*.
  `store/permissions.json` holds the same list with its reason, and
  `scripts/check-extension.mjs` fails when they differ.

`trust.ts` compares the address of a sender with the address of the extension's own
pages, `chrome.runtime.getURL("")`, instead of with its id, and the bug form names
Firefox from its user agent.

`scripts/check-project.sh` runs addons-linter 10.14.0, a pinned development dependency,
on `extension/` through `scripts/check-firefox.mjs`, without `web-ext` and its 137
packages more. It fails on every error and on every warning that the script doesn't
accept with its reason; today it accepts only that Firefox ignores
`background.service_worker`.

## Consequences

- Edge 140 and newer installs the package of the Chrome Web Store, after **Allow
  extensions from other stores**, or loads `extension/` unpacked; Firefox 140 and newer
  loads it as a temporary add-on in `about:debugging`, until it is listed.
- Firefox has no `storage.local.setAccessLevel`, so it can't keep the storage from the
  content script in the Autodarts page as Chrome 140 does. The sessions and passwords
  in it stay sealed with the key of [0006](0006-seal-the-secrets-with-a-key-that-never-leaves-the-browser.md),
  which the content script can't reach, but the names of the accounts, the settings and
  the hashes of the venue PINs would be in reach of a page whose process is taken over.
  The service worker writes that to its console at each start, `docs/security.md`
  names it, and the docs recommend Chrome or Edge for a venue display. Moving the
  accounts into the IndexedDB of the extension in Firefox would close the gap; it comes
  before a listing on addons.mozilla.org.
- The end-to-end tests of [0007](0007-test-the-real-extension-against-a-fake-autodarts.md)
  run in Chromium alone, as Playwright loads no extension into Firefox. A release is
  checked in Firefox by hand, with the steps of `docs/development.md`.
- Chrome may list the keys of Firefox as unrecognized under **Errors** of an unpacked
  extension in `chrome://extensions`; the extension runs all the same, and the
  end-to-end tests load it so.
- The listings on addons.mozilla.org and in Edge Add-ons, and a delivery to them, need
  accounts and API keys of their own: [docs/releases.md](../releases.md#edge-and-firefox)
  lists what Dennis sets up.
