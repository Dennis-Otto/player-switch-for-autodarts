# Releases and the Chrome Web Store

How a change becomes a release, and how a release reaches the Chrome Web Store. This page is for whoever maintains the extension; using it needs none of this.

## How a release is made

Every change reaches `main` through a pull request whose title follows [Conventional Commits](https://www.conventionalcommits.org/). The release bot keeps a pull request titled `chore: release x.y.z` open with the next version, decided from the titles merged since the last release (`fix` a patch, `feat` a minor, `!` a major version), and with the text of *Unreleased* in [the changelog](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/CHANGELOG.md) as its notes. Merging that pull request publishes the release on GitHub, with its SBOMs, third-party notices and the signed provenance of an isolated build, and raises the version in `package.json` and in `extension/manifest.json` together, so the extension always carries the version of its release.

[CONTRIBUTING](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/CONTRIBUTING.md) has the rules for changes; [SECURITY.md](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/SECURITY.md) says how to verify a release.

## The package for the store

The Chrome Web Store takes a zip with `manifest.json` at its root. From a checkout at the release:

```sh
bash scripts/package-extension.sh
```

builds the extension and writes `dist/player-switch-for-autodarts-<version>.zip` with the contents of `extension/` at the root of the archive, forward slashes in every path and no source maps. On Windows the script falls back to PowerShell, whose archives use backslashes; the store prefers forward slashes, so build the upload archive where `zip` is available, such as WSL or the CI.

## The first listing

The first listing is done by hand, once:

1. A [Chrome Web Store developer account](https://chrome.google.com/webstore/devconsole): a Google account, the developer agreement and a one-off registration fee. A hobby project published privately and for free is not a trader account under the EEA consumer rules.
2. **Add new item**, upload the zip.
3. The **store listing**: the title, the short and the detailed description, the category and the permission justifications are ready to paste in [`store/listing.en.md`](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/store/listing.en.md) and [`store/listing.de.md`](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/store/listing.de.md); the screenshots in the required 1280×800 are `docs/images/store-1.png` and `docs/images/store-2.png`.
4. **Privacy practices**: the single purpose and the justifications from the listing texts; the data the extension handles is *authentication information*, kept on the computer and sent only to Autodarts; it uses no remote code; the privacy policy URL is <https://dennis-otto.github.io/player-switch-for-autodarts/privacy.html>.
5. **Distribution**: public, or unlisted while a small circle tests it; free.
6. Submit for review. Google reviews every version, usually within a few days.

## Later versions

Every release after the first reaches the store on its own: the workflow [`publish-store.yml`](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/.github/workflows/publish-store.yml) runs after every release, builds the package from the tag of the release, checks that the manifest carries the version of the release, uploads the package with the Chrome Web Store API and submits it for review. Google reviews each version again and publishes it after the review; a prerelease stays off the store. The workflow needs this one-time set-up:

1. In the [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the **Chrome Web Store API** for it.
2. Under **APIs & Services → OAuth consent screen**, create the consent screen as an external app with your own address as a test user, then set its publishing status to **In production**: while it stays in testing, Google expires every refresh token after seven days.
3. Under **Credentials**, create an **OAuth client ID** of the type **Desktop app** and note its client ID and client secret.
4. Get a refresh token with the scope `https://www.googleapis.com/auth/chromewebstore`: open this address in the browser, signed in as the developer, and allow the access (Google warns about an unverified app; your own app is fine):

    ```text
    https://accounts.google.com/o/oauth2/v2/auth?client_id=CLIENT_ID&redirect_uri=http://localhost:1&response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&access_type=offline&prompt=consent
    ```

    The browser then lands on an address `http://localhost:1/?code=…` that nothing answers; copy the `code` from it and exchange it within a few minutes:

    ```sh
    curl https://oauth2.googleapis.com/token -d client_id=CLIENT_ID -d client_secret=CLIENT_SECRET -d code=CODE -d grant_type=authorization_code -d redirect_uri=http://localhost:1
    ```

    The answer holds the `refresh_token`.
5. In the [Developer Dashboard](https://chrome.google.com/webstore/devconsole), note the **item ID**, the 32 letters in the address of the item, and the **publisher ID** under **Publisher → Settings**, and turn on 2-step verification for the account, which Google requires for publishing by API.
6. Set the three secrets in the environment `chrome-web-store`, which the settings bot creates from [`repository.project.toml`](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/.github/repository.project.toml), and the two IDs as variables of the repository:

    ```sh
    gh secret set CWS_CLIENT_ID --env chrome-web-store
    gh secret set CWS_CLIENT_SECRET --env chrome-web-store
    gh secret set CWS_REFRESH_TOKEN --env chrome-web-store
    gh variable set CWS_EXTENSION_ID --body ITEM_ID
    gh variable set CWS_PUBLISHER_ID --body PUBLISHER_ID
    ```

While a version is still under review, the store takes no new one. Wait for the review, or cancel the submission in the dashboard, and then start the workflow by hand under *Actions → Chrome Web Store* with the tag of the release; a start for a version that the store already has, under review or published, does nothing. The package is not attached to the GitHub release: a release is immutable once published, and only the isolated build of the release workflow could add a file with its signed provenance. [Decision 0003](decisions/0003-deliver-each-release-to-the-chrome-web-store.md) records the reasons.
