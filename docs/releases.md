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

A new version is a new upload of the package of its release, which Google reviews again and then publishes. Automatic publishing on every release, through the Chrome Web Store API, is being added: a workflow that builds the package of the release, uploads it and submits it, with the store's credentials in the environment `chrome-web-store`. Its set-up will be described here once it is in place.
