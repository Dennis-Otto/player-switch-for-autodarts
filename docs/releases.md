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
3. The **store listing**: the title, the short and the detailed description, the category and the permission justifications are ready to paste in a file for each language of the extension: [`store/listing.en.md`](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/store/listing.en.md), [`listing.de.md`](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/store/listing.de.md), [`listing.nl.md`](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/store/listing.nl.md), [`listing.fr.md`](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/store/listing.fr.md) and [`listing.es.md`](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/store/listing.es.md). The store offers a listing for each language of `extension/_locales/`, and `scripts/check-manifest.mjs` fails when a language has no file or a file no language; the pictures are in `store/images/`, as [the images of the store](#the-images-of-the-store) lists them.
4. **Privacy practices**: the single purpose and the justifications from the listing texts; the data the extension handles is *authentication information*, kept on the computer and sent only to Autodarts; it uses no remote code; the privacy policy URL is <https://dennis-otto.github.io/player-switch-for-autodarts/privacy.html>. The store takes one address for every language; the English page links its German one, <https://dennis-otto.github.io/player-switch-for-autodarts/de/privacy.html>, in the language switch of its header. The homepage and support URLs, the latter the help, are in `store/listing.en.md` as well.
5. **Distribution**: public, or unlisted while a small circle tests it; free.
6. Submit for review. Google reviews every version, usually within a few days.

## The images of the store

`bash scripts/screenshots.sh` renders every picture of the listing from the real popup and switcher, with made-up accounts, in exactly the size that the store asks for and in every language of `extension/_locales/`, and the screenshot bot keeps them current with every change of the popup or of the texts on the pictures, `store/pictures.<code>.json` ([how](development.md#pictures)). The store takes them under **Store listing → Graphic assets**, first for the default language, English, and then, with the language of the listing switched, for each of the others. The slots are the same in every language, and `<code>` is the code of the language:

| Slot in the dashboard | Size | Files |
| --- | --- | --- |
| Store icon | 128×128 | `extension/icons/icon-128.png`, the same in every language |
| Screenshots, in this order | 1280×800 | `store/images/screenshot-1.<code>.png` (the players), `screenshot-2.<code>.png` (**Manage accounts**), `screenshot-3.<code>.png` (the switcher on a board display) |
| Small promo tile | 440×280 | `store/images/promo-small.<code>.png` |
| Marquee promo tile | 1400×560 | `store/images/marquee.<code>.png` |

| Language of the listing | Its pictures |
| --- | --- |
| English, the default | `store/images/*.en.png` |
| German | `store/images/*.de.png` |
| Dutch | `store/images/*.nl.png` |
| French | `store/images/*.fr.png` |
| Spanish | `store/images/*.es.png` |

The pictures show no logo and no design of Autodarts, and each screenshot says that the extension is not affiliated with Autodarts. A new picture of the store comes into `test/harness/capture.py` and `test/harness/stage.js`, and a new language brings its pictures by itself, from `store/pictures.<code>.json` ([Add a language](development.md#add-a-language)); a change of one reaches the store only by hand, as the listing texts do.

## Later versions

Every release after the first reaches the store on its own: the workflow [`publish-store.yml`](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/.github/workflows/publish-store.yml) starts after every run of the Release workflow, every day at 00:17 UTC, and by hand under *Actions → Chrome Web Store* with a tag. It signs in, asks the store for the state of the item and decides. A release that the store lacks goes to the store once no review is pending: a job without any secret builds the package from the tag of the release, checks that the manifest carries the version of the release and keeps the package as an artifact of the run for 30 days, so that what went to the store can be looked at later; then a job that reaches only Google uploads it with the Chrome Web Store API and submits it for review. Google reviews each version again and publishes it after the review; a prerelease stays off the store.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/diagrams/store-delivery.dark.svg">
  <img src="images/diagrams/store-delivery.svg" alt="How a release reaches the Chrome Web Store: After every release, every day at 00:17 UTC and when started by hand with a tag, the workflow signs in to the Chrome Web Store and asks for the state of the item. A sign-in that Google turns away, a rejected release, a warning, a takedown or a review of more than 7 days fail the run, with the reason and the fix in its summary, and the bot-health sweep of the night keeps an issue open. While a review is pending, the run ends with a note, and a later day delivers the release. When the store has the release already, nothing happens. Otherwise a job without any secret builds the zip from the tag and keeps it as an artifact, and a job that reaches only Google uploads it and submits it for review.">
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
| Google took the item down | Fails, and delivers nothing; a start by hand with the tag of the fixing release delivers it. |
| It has a higher version than the release | Fails: the store takes only a version above its own. |

The days of a review count from the artifact of the delivery, or from the release of the version when it went to the store another way.

### The one-time set-up

The workflow needs the IDs of the item and of the publisher, and a way to sign in to Google, which the two jobs that talk to the store each take by themselves. The better way needs no stored secret: GitHub issues each run an OIDC token, which Google trades for an access token of a service account, and only for a run of this workflow on `main` ([decision 0010](decisions/0010-sign-in-to-the-store-without-a-stored-secret.md)). The other way, with which the store delivery started, is an OAuth client and a refresh token of the developer account, the secrets of the environment `chrome-web-store`: the workflow takes it as long as the variables of the first way aren't set.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/diagrams/store-sign-in.dark.svg">
  <img src="images/diagrams/store-sign-in.svg" alt="How the workflow signs in to the Chrome Web Store: Each of the two jobs that talk to the store signs in by itself. With the variables CWS_WORKLOAD_IDENTITY_PROVIDER and CWS_SERVICE_ACCOUNT set, the job asks GitHub for its OIDC token, which names the repository, the branch and the workflow. Google's Security Token Service trades it for a federated token only when the condition of the provider admits this repository, the branch main and publish-store.yml, and IAM trades that for an access token of the service account for 20 minutes. Without the variables, Google issues the access token for the OAuth client and the refresh token, the secrets of the environment chrome-web-store. Either way the token stays in a file of the job, and the Chrome Web Store takes it when the Developer Dashboard names its account. A sign-in that Google turns away fails the run, with the reason and the fix.">
</picture>

Either way starts in Google Cloud and in the dashboard:

1. In the [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the **Chrome Web Store API** for it.
2. In the [Developer Dashboard](https://chrome.google.com/webstore/devconsole), note the **item ID**, the 32 letters in the address of the item, and the **publisher ID** under **Publisher → Settings**, and turn on 2-step verification for the account, which Google requires for publishing by API. Set the two IDs as variables of the repository:

    ```sh
    gh variable set CWS_EXTENSION_ID --body ITEM_ID
    gh variable set CWS_PUBLISHER_ID --body PUBLISHER_ID
    ```

#### Sign in without a stored secret

A pool of Workload Identity Federation in the Google Cloud project takes the OIDC tokens of GitHub, under a condition of its provider: the repository, by its ID, which a new repository of the same name doesn't get, the branch `main` and the workflow `publish-store.yml`. So no branch, fork or other workflow can trade a token, not even the Release workflow, whose jobs get OIDC tokens to sign the provenance. The pool may act as a service account that has no role in the project, and the Developer Dashboard admits that service account to the item.

1. In the [Cloud Shell](https://console.cloud.google.com/home/dashboard?cloudshell=true) of the project, or wherever `gcloud` is signed in, create the pool, its provider and the service account, with the ID of the project in place of `PROJECT_ID`:

    ```sh
    project=PROJECT_ID
    repo=Dennis-Otto/player-switch-for-autodarts
    repo_id="$(curl -s "https://api.github.com/repos/$repo" | jq -r .id)"
    number="$(gcloud projects describe "$project" --format='value(projectNumber)')"
    gcloud services enable iamcredentials.googleapis.com sts.googleapis.com --project "$project"
    gcloud iam workload-identity-pools create github --project "$project" \
      --location global --display-name GitHub
    gcloud iam workload-identity-pools providers create-oidc player-switch --project "$project" \
      --location global --workload-identity-pool github --display-name "Player Switch for Autodarts" \
      --issuer-uri https://token.actions.githubusercontent.com \
      --attribute-mapping 'google.subject=assertion.sub,attribute.repository_id=assertion.repository_id' \
      --attribute-condition "assertion.repository_id == '$repo_id' && assertion.ref == 'refs/heads/main' && assertion.workflow_ref == '$repo/.github/workflows/publish-store.yml@refs/heads/main'"
    gcloud iam service-accounts create chrome-web-store --project "$project" \
      --display-name "Chrome Web Store delivery"
    gcloud iam service-accounts add-iam-policy-binding "chrome-web-store@$project.iam.gserviceaccount.com" \
      --project "$project" --role roles/iam.workloadIdentityUser \
      --member "principalSet://iam.googleapis.com/projects/$number/locations/global/workloadIdentityPools/github/attribute.repository_id/$repo_id"
    echo "CWS_WORKLOAD_IDENTITY_PROVIDER=projects/$number/locations/global/workloadIdentityPools/github/providers/player-switch"
    echo "CWS_SERVICE_ACCOUNT=chrome-web-store@$project.iam.gserviceaccount.com"
    ```

2. In the [Developer Dashboard](https://chrome.google.com/webstore/devconsole), under **Account**, add the address of the service account, `chrome-web-store@PROJECT_ID.iam.gserviceaccount.com`. A publisher has one service account.
3. Set the two values that the last lines printed as variables of the repository, and start the workflow by hand, which checks the sign-in:

    ```sh
    gh variable set CWS_WORKLOAD_IDENTITY_PROVIDER --body projects/NUMBER/locations/global/workloadIdentityPools/github/providers/player-switch
    gh variable set CWS_SERVICE_ACCOUNT --body chrome-web-store@PROJECT_ID.iam.gserviceaccount.com
    gh workflow run publish-store.yml
    ```

4. Once that run passes, the secrets of the other way are of no use and could still publish a version, and each run warns of them until they are gone. Delete them, delete the OAuth client under **APIs & Services → Credentials** of the project, which ends the refresh token at Google too, and remove the line `secrets = [...]` of `[environments.chrome-web-store]` from [`repository.project.toml`](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/.github/repository.project.toml) in a pull request; the table itself stays, as it keeps the environment to `main`:

    ```sh
    gh secret delete CWS_CLIENT_ID --env chrome-web-store
    gh secret delete CWS_CLIENT_SECRET --env chrome-web-store
    gh secret delete CWS_REFRESH_TOKEN --env chrome-web-store
    ```

Nothing of this expires: the access token lasts 20 minutes, longer than either job may run, and each run gets a new one.

#### Sign in with a refresh token

1. Under **APIs & Services → OAuth consent screen**, create the consent screen as an external app with your own address as a test user, then set its publishing status to **In production**: while it stays in testing, Google expires every refresh token after seven days.
2. Under **Credentials**, create an **OAuth client ID** of the type **Desktop app** and note its client ID and client secret.
3. Get a refresh token with the scope `https://www.googleapis.com/auth/chromewebstore`: open this address in the browser, signed in as the developer, and allow the access (Google warns about an unverified app; your own app is fine):

    ```text
    https://accounts.google.com/o/oauth2/v2/auth?client_id=CLIENT_ID&redirect_uri=http://localhost:1&response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&access_type=offline&prompt=consent
    ```

    The browser then lands on an address `http://localhost:1/?code=…` that nothing answers; copy the `code` from it and exchange it within a few minutes:

    ```sh
    curl https://oauth2.googleapis.com/token -d client_id=CLIENT_ID -d client_secret=CLIENT_SECRET -d code=CODE -d grant_type=authorization_code -d redirect_uri=http://localhost:1
    ```

    The answer holds the `refresh_token`.
4. Set the three secrets in the environment `chrome-web-store`, which the settings bot creates from [`repository.project.toml`](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/.github/repository.project.toml):

    ```sh
    gh secret set CWS_CLIENT_ID --env chrome-web-store
    gh secret set CWS_CLIENT_SECRET --env chrome-web-store
    gh secret set CWS_REFRESH_TOKEN --env chrome-web-store
    ```

### When a run fails

A failed run names the reason and the fix in its summary and in an annotation, and the bot-health sweep of the night opens an issue with the label `bot-failure`, which the next run that passes closes:

- **Google turned the refresh token away** (`invalid_grant`): [renew it](#renew-the-refresh-token), or [sign in without a stored secret](#sign-in-without-a-stored-secret).
- **Google doesn't know the OAuth client**: set `CWS_CLIENT_ID` and `CWS_CLIENT_SECRET` again from **Credentials** of the Google Cloud project (steps 2 and 4 of the refresh token).
- **A variable of the sign-in without a stored secret is missing or has the wrong form**: set both `CWS_WORKLOAD_IDENTITY_PROVIDER`, `projects/` with the number of the project, not its ID, and no `//iam.googleapis.com/` in front, and `CWS_SERVICE_ACCOUNT`, the address of the service account, as in step 3 of [the sign-in without a stored secret](#sign-in-without-a-stored-secret); or delete both for the refresh token.
- **Google's Security Token Service turned the OIDC token of GitHub away**: the error from Google in the run says why. Most often the provider was deleted or disabled, or its condition doesn't admit the run: one started by hand on another branch than `main`, or after the repository or the workflow got a new name or owner. **IAM & Admin → Workload Identity Federation** of the project shows the condition, which step 1 of [the sign-in without a stored secret](#sign-in-without-a-stored-secret) sets.
- **Google issued no access token of the service account**: the pool lacks the role *Workload Identity User* on the service account, or the project the IAM Service Account Credentials API; step 1 of [the sign-in without a stored secret](#sign-in-without-a-stored-secret) enables the API with `gcloud services enable` and grants the role with `add-iam-policy-binding`.
- **The store didn't tell the status of the item** with a 401 or 403 after the sign-in without a stored secret: the Developer Dashboard doesn't name the service account under **Account** (step 2 of [the sign-in without a stored secret](#sign-in-without-a-stored-secret)).
- **Rejected**: the mail of Google and the [Developer Dashboard](https://chrome.google.com/webstore/devconsole) say why. Fix the cause and release a new version; when only the listing or the privacy practices had to change, change them in the dashboard and start the workflow by hand with the tag, which submits the same version again.
- **Warned or taken down**: the dashboard says which policy and until when. Fix it there or with a new release, and ask for a review. A warned item gets the new release from the daily run; for a taken-down item, start the workflow by hand with the tag of the fixing release.
- **In review for more than 7 days**: look in the dashboard whether Google asks for anything, or contact the support of the Chrome Web Store. A new permission makes a review take longer.
- **A higher version in the store**: a version went to the store by hand without its release; release a version above it.

A run that failed for a reason of GitHub or of the network needs nothing: the next daily run delivers the release.

### Renew the refresh token

With the [sign-in without a stored secret](#sign-in-without-a-stored-secret), there is no token to renew. Otherwise, the daily sign-in keeps the refresh token in use, so Google doesn't expire it after six months without use. It still ends when the password of the Google account changes, when someone removes the access of the app under **Security → Third-party connections** of the account, or when the consent screen goes back to testing (step 1 of [the refresh token](#sign-in-with-a-refresh-token)). Then get a new one as in step 3, set it as in step 4, and start the workflow by hand to check it:

```sh
gh secret set CWS_REFRESH_TOKEN --env chrome-web-store
gh workflow run publish-store.yml
```

### The network of the jobs

The jobs that sign in to the store could publish a version to every user, so each job of the workflow reaches only the hosts that it needs: [Harden-Runner](https://github.com/step-security/harden-runner) blocks every other one with `egress-policy: block`, and the jobs run without sudo and containers, on `ubuntu-24.04`, an image that doesn't move to a new release of Ubuntu by itself.

| Job | Secrets | Hosts |
| --- | --- | --- |
| *the state of the store* | none, or the OAuth client and the refresh token | GitHub, `oauth2.googleapis.com`, `sts.googleapis.com`, `iamcredentials.googleapis.com`, `chromewebstore.googleapis.com` |
| *the package of the release* | none | GitHub, `registry.npmjs.org` |
| *deliver to the Chrome Web Store* | none, or the OAuth client and the refresh token | `oauth2.googleapis.com`, `sts.googleapis.com`, `iamcredentials.googleapis.com`, `chromewebstore.googleapis.com` |

`oauth2.googleapis.com` is for the refresh token, `sts.googleapis.com` and `iamcredentials.googleapis.com` for the sign-in without a stored secret. Only the two jobs that sign in may ask GitHub for an OIDC token (`id-token: write`), and `test/publish-store.test.ts` fails when another job may, or when the sign-in of one job differs from that of the other.

GitHub means `api.github.com`, `github.com` and the two hosts of its downloads, for Node.js should the runner image lack its version; the hosts of the Actions service itself, such as those of the artifacts and of the OIDC token, are open to every job. The job that uploads runs no code of the repository and no npm package: it takes the zip of the job before it as an artifact. When a new version of an action needs another host, its run fails at the blocked request, and the insights of Harden-Runner, linked in the log of its first step, name the host to add to `allowed-endpoints`. `scripts/check-project.sh` fails when a job of the workflow goes back to recording its traffic only, gives up `disable-sudo-and-containers` or runs on `ubuntu-latest`.

The package is not attached to the GitHub release: a release is immutable once published, and only the isolated build of the release workflow could add a file with its signed provenance; the artifact of the run holds it instead. [Decision 0003](decisions/0003-deliver-each-release-to-the-chrome-web-store.md), [decision 0005](decisions/0005-look-after-the-store-every-day-from-a-closed-network.md) and [decision 0010](decisions/0010-sign-in-to-the-store-without-a-stored-secret.md) record the reasons.

## Edge and Firefox {#edge-and-firefox}

The package of the Chrome Web Store is the package of every browser: one manifest names what Chrome and Edge run and what Firefox runs, as [decision 0012](decisions/0012-run-one-package-in-chrome-edge-and-firefox.md) records, and `scripts/check-project.sh` lints it with addons-linter, the linter of addons.mozilla.org. Until it is listed there, a player loads it in Firefox as a temporary add-on, and in Edge from the Chrome Web Store, as [the README](https://github.com/Dennis-Otto/player-switch-for-autodarts#install) says.

The listings in the two other stores are new accounts and new secrets, so they wait for Dennis:

1. **Edge Add-ons.** A developer account in Microsoft Partner Center, which is free ([how to register](https://learn.microsoft.com/microsoft-edge/extensions/publish/create-dev-account)). **Create new extension**, upload the zip of the release, and paste the listing texts of `store/` as for the Chrome Web Store; Microsoft reviews every version, usually within a week. A delivery of each release takes an API key of the [Edge Add-ons API](https://learn.microsoft.com/microsoft-edge/extensions/update/api/using-addons-api) (a client id and an API key, which expires and is renewed in Partner Center) in an environment `edge-add-ons`, and a job like *deliver to the Chrome Web Store* that reaches only `api.addons.microsoftedge.microsoft.com`.
2. **addons.mozilla.org.** A Firefox account on the [Developer Hub](https://addons.mozilla.org/developers/), which is free. Before the listing, the accounts move out of the reach of the content script in Firefox, as [decision 0012](decisions/0012-run-one-package-in-chrome-edge-and-firefox.md#consequences) says. **Submit a New Add-on**, *On this site*, upload the zip of the release, and give the source code: the zip holds `lib/`, which `npm run build` compiles from `src/`, so the review asks for the source and the build steps, which are a zip of the tag and `npm ci --ignore-scripts && npm run build` with Node 24. The data that the add-on sends is declared in its manifest already, `authenticationInfo` (see [the privacy policy](privacy.md)). A delivery of each release takes the API keys of the Developer Hub (a JWT issuer and its secret) in an environment `addons-mozilla-org`, and a job that runs `web-ext sign --channel listed` or the [Add-ons API](https://mozilla.github.io/addons-server/topics/api/addons.html) and reaches only `addons.mozilla.org`.

Each new job keeps the rules of [the network of the jobs](#the-network-of-the-jobs), and `scripts/check-project.sh` checks them as it checks those of today.
