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
3. The **store listing**: the title, the short and the detailed description, the category and the permission justifications are ready to paste in [`store/listing.en.md`](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/store/listing.en.md) and [`store/listing.de.md`](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/store/listing.de.md); the pictures are in `store/images/`, as [the images of the store](#the-images-of-the-store) lists them.
4. **Privacy practices**: the single purpose and the justifications from the listing texts; the data the extension handles is *authentication information*, kept on the computer and sent only to Autodarts; it uses no remote code; the privacy policy URL is <https://dennis-otto.github.io/player-switch-for-autodarts/privacy.html>. The store takes one address for every language; the English page links its German one, <https://dennis-otto.github.io/player-switch-for-autodarts/de/privacy.html>, in the language switch of its header. The homepage and support URLs, the latter the help, are in `store/listing.en.md` as well.
5. **Distribution**: public, or unlisted while a small circle tests it; free.
6. Submit for review. Google reviews every version, usually within a few days.

## The images of the store

`bash scripts/screenshots.sh` renders every picture of the listing from the real popup and switcher, with made-up accounts, in exactly the size that the store asks for, and the screenshot bot keeps them current with every change of the popup ([how](development.md#pictures)). The store takes them under **Store listing → Graphic assets**, first for the default language, English, and then, with the language of the listing switched to German, the `.de` files for the German one:

| Slot in the dashboard | Size | Files |
| --- | --- | --- |
| Store icon | 128×128 | `extension/icons/icon-128.png` |
| Screenshots, in this order | 1280×800 | `store/images/screenshot-1.en.png` (the players), `screenshot-2.en.png` (**Manage accounts**), `screenshot-3.en.png` (the switcher on a board display) |
| Small promo tile | 440×280 | `store/images/promo-small.en.png` |
| Marquee promo tile | 1400×560 | `store/images/marquee.en.png` |

The pictures show no logo and no design of Autodarts, and each screenshot says that the extension is not affiliated with Autodarts. A new picture of the store comes into `test/harness/capture.py` and `test/harness/stage.js`; a change of one reaches the store only by hand, as the listing texts do.

## Later versions

Every release after the first reaches the store on its own: the workflow [`publish-store.yml`](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/.github/workflows/publish-store.yml) starts after every run of the Release workflow, every day at 00:17 UTC, and by hand under *Actions → Chrome Web Store* with a tag. It signs in, asks the store for the state of the item and decides. A release that the store lacks goes to the store once no review is pending: a job without any secret builds the package from the tag of the release, checks that the manifest carries the version of the release and keeps the package as an artifact of the run for 30 days, so that what went to the store can be looked at later; then a job that reaches only Google uploads it with the Chrome Web Store API and submits it for review. Google reviews each version again and publishes it after the review; a prerelease stays off the store.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/diagrams/store-delivery.dark.svg">
  <img src="images/diagrams/store-delivery.svg" alt="How a release reaches the Chrome Web Store: After every release, every day at 00:17 UTC and when started by hand with a tag, the workflow signs in to the Chrome Web Store and asks for the state of the item. A refresh token that Google turns away, a rejected release, a warning, a takedown or a review of more than 7 days fail the run, with the reason and the fix in its summary, and the bot-health sweep of the night keeps an issue open. While a review is pending, the run ends with a note, and a later day delivers the release. When the store has the release already, nothing happens. Otherwise a job without any secret builds the zip from the tag and keeps it as an artifact, and a job that reaches only Google uploads it and submits it for review.">
</picture>

Every run writes a table into its summary: the release, the version that the store publishes and the one submitted since, each with its state, the days that a pending review has taken, and whether Google warned the item or took it down. `scripts/store-status.ts` decides, and its tests cover every row of this table:

| What the store says | What the run does |
| --- | --- |
| It publishes the release, or has it approved | A note: nothing to deliver. |
| It lacks the release, and no review is pending | Delivers the release. |
| It reviews the release, or an earlier version | A note. The store takes no new version during a review, so a later day delivers the release. |
| The review has taken more than 7 days | Fails. |
| Google rejected the release | Fails. A start by hand with the tag submits it again. |
| The submission of the release was cancelled in the dashboard | A note. A start by hand with the tag submits it again. |
| Google rejected an earlier version | A warning, and delivers the release. |
| Google warned the item | Fails, and still delivers a release that the store lacks, as it may be the fix. |
| Google took the item down | Fails, and delivers nothing. |
| It has a higher version than the release | Fails: the store takes only a version above its own. |

The days of a review count from the artifact of the delivery, or from the release of the version when it went to the store another way. The workflow needs this one-time set-up:

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

### When a run fails

A failed run names the reason and the fix in its summary and in an annotation, and the bot-health sweep of the night opens an issue with the label `bot-failure`, which the next run that passes closes:

- **Google turned the refresh token away** (`invalid_grant`): [renew it](#renew-the-refresh-token).
- **Google doesn't know the OAuth client**: set `CWS_CLIENT_ID` and `CWS_CLIENT_SECRET` again from **Credentials** of the Google Cloud project (steps 3 and 6).
- **Rejected**: the mail of Google and the [Developer Dashboard](https://chrome.google.com/webstore/devconsole) say why. Fix the cause and release a new version; when only the listing or the privacy practices had to change, change them in the dashboard and start the workflow by hand with the tag, which submits the same version again.
- **Warned or taken down**: the dashboard says which policy and until when. Fix it there or with a new release, and ask for a review.
- **In review for more than 7 days**: look in the dashboard whether Google asks for anything, or contact the support of the Chrome Web Store. A new permission makes a review take longer.
- **A higher version in the store**: a version went to the store by hand without its release; release a version above it.

A run that failed for a reason of GitHub or of the network needs nothing: the next daily run delivers the release.

### Renew the refresh token

The daily sign-in keeps the refresh token in use, so Google doesn't expire it after six months without use. It still ends when the password of the Google account changes, when someone removes the access of the app under **Security → Third-party connections** of the account, or when the consent screen goes back to testing (step 2). Then get a new one as in step 4, set it, and start the workflow by hand to check it:

```sh
gh secret set CWS_REFRESH_TOKEN --env chrome-web-store
gh workflow run publish-store.yml
```

### The network of the jobs

The jobs that hold the secrets of the store could publish a version to every user, so each job of the workflow reaches only the hosts that it needs: [Harden-Runner](https://github.com/step-security/harden-runner) blocks every other one with `egress-policy: block`, and the jobs run without sudo and containers, on `ubuntu-24.04`, an image that doesn't move to a new release of Ubuntu by itself.

| Job | Secrets | Hosts |
| --- | --- | --- |
| *the state of the store* | the OAuth client and the refresh token | GitHub, `oauth2.googleapis.com`, `chromewebstore.googleapis.com` |
| *the package of the release* | none | GitHub, `registry.npmjs.org` |
| *deliver to the Chrome Web Store* | the OAuth client and the refresh token | `oauth2.googleapis.com`, `chromewebstore.googleapis.com` |

GitHub means `api.github.com`, `github.com` and the two hosts of its downloads, for Node.js should the runner image lack its version; the hosts of the Actions service itself, such as those of the artifacts, are open to every job. The job that uploads runs no code of the repository and no npm package: it takes the zip of the job before it as an artifact. When a new version of an action needs another host, its run fails at the blocked request, and the insights of Harden-Runner, linked in the log of its first step, name the host to add to `allowed-endpoints`. `scripts/check-project.sh` fails when a job of the workflow goes back to recording its traffic only, gives up `disable-sudo-and-containers` or runs on `ubuntu-latest`.

The package is not attached to the GitHub release: a release is immutable once published, and only the isolated build of the release workflow could add a file with its signed provenance; the artifact of the run holds it instead. [Decision 0003](decisions/0003-deliver-each-release-to-the-chrome-web-store.md) and [decision 0005](decisions/0005-look-after-the-store-every-day-from-a-closed-network.md) record the reasons.
