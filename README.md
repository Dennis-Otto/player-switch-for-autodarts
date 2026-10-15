# Player Switch for Autodarts

[![CI](https://github.com/Dennis-Otto/player-switch-for-autodarts/actions/workflows/ci.yml/badge.svg)](https://github.com/Dennis-Otto/player-switch-for-autodarts/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Dennis-Otto/player-switch-for-autodarts/actions/workflows/codeql.yml/badge.svg)](https://github.com/Dennis-Otto/player-switch-for-autodarts/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Dennis-Otto/player-switch-for-autodarts/badge)](https://scorecard.dev/viewer/?uri=github.com/Dennis-Otto/player-switch-for-autodarts)
[![REUSE](https://api.reuse.software/badge/github.com/Dennis-Otto/player-switch-for-autodarts)](https://api.reuse.software/info/github.com/Dennis-Otto/player-switch-for-autodarts)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A Chrome extension that switches between Autodarts accounts on a shared touch
display with one tap, without signing in again. Everyone in the house plays under
their own account; a tap on a tile puts that account on the board.

> **Status: prototype.** The way it keeps a session is not an official Autodarts
> interface, so a change on their side can stop it until the extension is adjusted.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/popup-dark.png" />
  <img alt="The popup: a grid of players with the one playing highlighted, and the manage view with the password and remove options" src="docs/images/popup.png" width="640" />
</picture>

## How it works

Autodarts Play keeps the signed-in session as a single value in the browser (a
rotating refresh token in `localStorage`). The extension keeps that value per
account and swaps it when you switch:

- **Switching** parks the session of the account that was playing, writes the
  chosen account's session into the page and reloads. No password is typed.
- **The account that steps aside is not signed out at Autodarts.** Its session
  stays valid so a tap brings it straight back. "Switching away" only takes it off
  the page.
- **Parked sessions are kept fresh.** Because the token rotates, the extension
  renews each parked account's token in the background, so it still works days
  later.
- **Password fallback (optional).** If you let the extension remember an account's
  password, it signs that account in again automatically should its token ever
  stop working. Accounts that use Google or Apple to sign in can't use this.

## Install

### From the Chrome Web Store

Once the listing is live, install it in one click from its store page (the link
goes here after the first release). Updates then arrive on their own.

### Unpacked, from the source

```sh
npm ci
npm run build
```

Then in Chrome: open `chrome://extensions`, turn on **Developer mode**, choose
**Load unpacked** and pick the `extension/` folder of this repository.

The account logic — renewing tokens, the password fallback, the account list — is
written and tested in [`src/`](src/). Only
[`extension/content.js`](extension/content.js) touches the page's stored session,
reading and writing the refresh token under `autodarts_refresh_token`.

## Use it

1. Open [play.autodarts.com](https://play.autodarts.com) and sign in as the first
   person.
2. Open the extension and choose **Save account**.
3. Choose **Add account**, sign in as the next person, and save that one too.
4. From then on, a tap on a tile switches accounts. **Manage accounts** reveals
   the per-account options.

Optionally, under **Manage accounts**, choose **Remember password** so the
extension can sign an account back in on its own. See [SECURITY.md](SECURITY.md)
and the [privacy policy](docs/privacy.md) for what that stores.

## Publish to the Chrome Web Store

The first listing is made by hand: the Chrome Web Store needs a one-time developer
account (a one-off US$5 fee), the listing details and a review. Every release after
it reaches the store on its own, once the [set-up below](#every-later-release-from-the-release-workflow)
is done.

1. Build the upload package:

   ```sh
   bash scripts/package-extension.sh
   ```

   This writes `dist/player-switch-for-autodarts-<version>.zip` with the manifest
   at its root.
2. At the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole),
   create the item, upload the zip, and fill in the listing (the texts in
   [`store/`](store/) are ready to paste) and the [privacy policy](docs/privacy.md)
   URL.
3. Submit for review.

### Every later release, from the release workflow

The workflow [`publish-store.yml`](.github/workflows/publish-store.yml) runs after
every release: it builds the zip from the tag of the release, checks that the
manifest carries the version of the release, uploads the zip with the Chrome Web
Store API and submits it for review. Google still reviews each version and
publishes it after the review. The workflow needs this one-time set-up:

1. In the [Google Cloud Console](https://console.cloud.google.com/), create a
   project and enable the **Chrome Web Store API** for it.
2. Under **APIs & Services → OAuth consent screen**, create the consent screen as an
   external app with your own address as a test user, then set its publishing
   status to **In production**: while it stays in testing, Google expires every
   refresh token after seven days.
3. Under **Credentials**, create an **OAuth client ID** of the type **Desktop app**
   and note its client ID and client secret.
4. Get a refresh token with the scope `https://www.googleapis.com/auth/chromewebstore`:
   open this address in the browser, signed in as the developer, and allow the
   access (Google warns about an unverified app; your own app is fine):

   ```text
   https://accounts.google.com/o/oauth2/v2/auth?client_id=CLIENT_ID&redirect_uri=http://localhost:1&response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&access_type=offline&prompt=consent
   ```

   The browser then lands on an address `http://localhost:1/?code=…` that nothing
   answers; copy the `code` from it and exchange it within a few minutes:

   ```sh
   curl https://oauth2.googleapis.com/token -d client_id=CLIENT_ID -d client_secret=CLIENT_SECRET -d code=CODE -d grant_type=authorization_code -d redirect_uri=http://localhost:1
   ```

   The answer holds the `refresh_token`.
5. In the [Developer Dashboard](https://chrome.google.com/webstore/devconsole),
   note the **item ID**, the 32 letters in the address of the item, and the
   **publisher ID** under **Publisher → Settings**, and turn on 2-step verification
   for the account, which Google requires for publishing by API.
6. Set the three secrets in the environment `chrome-web-store`, which the settings
   bot creates from [`repository.project.toml`](.github/repository.project.toml)
   once this is merged, and the two IDs as variables of the repository:

   ```sh
   gh secret set CWS_CLIENT_ID --env chrome-web-store
   gh secret set CWS_CLIENT_SECRET --env chrome-web-store
   gh secret set CWS_REFRESH_TOKEN --env chrome-web-store
   gh variable set CWS_EXTENSION_ID --body ITEM_ID
   gh variable set CWS_PUBLISHER_ID --body PUBLISHER_ID
   ```

While a version is still under review, the store takes no new one. Wait for the
review, or cancel the submission in the dashboard, and then start the workflow by
hand under *Actions → Chrome Web Store* with the tag of the release. The zip is not
attached to the GitHub release: a release is immutable once published, and only the
isolated build of the release workflow could add a file with its signed provenance.

## Development

Every change goes through a pull request whose title follows
[Conventional Commits](https://www.conventionalcommits.org/), with signed-off
commits (`git commit -s`). The checks of the CI run locally with

```sh
bash scripts/check.sh
```

[CONTRIBUTING.md](CONTRIBUTING.md) explains the set-up and the rules.

## Support and security

Questions and problems: see [SUPPORT.md](SUPPORT.md). Report vulnerabilities
privately, as [SECURITY.md](SECURITY.md) describes.

## License

MIT; see [LICENSE](LICENSE). Every file names its license in the machine-readable
form of [REUSE](https://reuse.software).
