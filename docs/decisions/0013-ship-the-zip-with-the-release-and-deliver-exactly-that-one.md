# Ship a reproducible zip with every release, and deliver exactly that one to the store

- Status: accepted
- Date: 2026-11-01

## Context

[Decision 0003](0003-deliver-each-release-to-the-chrome-web-store.md) left the zip off the GitHub release, because only the isolated build of the release could attach one with its signed provenance, and that build belonged to the blueprint. So the workflow of the store built the zip a second time from the tag:

- What the store got had no provenance, and only an artifact of 30 days showed what it was.
- A release offered no zip to someone who loads the extension unpacked.
- `zip -r` stored the file times of the checkout in the order of the file system, so two builds of one tag differed. Nobody could check what went to the store against the source of its tag, and this extension handles passwords.
- Whatever lay in `extension/`, apart from source maps and the settings of Biome, went in, and on Windows the fallback to PowerShell wrote backslashes into the archive.

The blueprint now lets a project add its own assets: `scripts/release-assets.sh` runs in a job of the isolated build that may write nothing, and the release attests and attaches what it writes.

## Options

1. Keep building the zip in the workflow of the store, and only make it reproducible. Anybody could then compare it with a build of their own, but it would still have no provenance and no place in the release.
2. Take the kind `chrome-extension` of the blueprint, whose build zips the extension with `PUBLISH_TO = "chrome-web-store"`. It is the way to go for a new extension, but it changes the kind of the whole project, and it builds the zip in the job that holds the rights of the release.
3. Build the zip with `scripts/release-assets.sh`, keep `PUBLISH_TO = "none"`, and let the workflow of the store take that asset from the release.

## Decision

Option 3.

- **One zip.** `scripts/package-extension.sh` builds `extension/lib/` from nothing, and `scripts/package-extension.ts` writes `player-switch-for-autodarts-<version>.zip`. `scripts/release-assets.sh` runs the same script from the signed tag, with a token that may only read, without the secrets and the OIDC token of the release. The isolated build attests the zip and attaches it with the other assets.
- **The same bytes for the same commit.** The writer is a small script of Node on every system, in place of `zip` and PowerShell: the files in the order of their bytes, each with the time of the commit in the fields of UTC, the same attributes everywhere and no extra fields. The files are stored, not compressed: the bytes of zlib depend on its version and on the instructions of the processor, while a stored file is itself. `.gitattributes` keeps LF in every checkout, and `package-lock.json` the compiler. `scripts/check-project.sh` builds the zip twice, in two time zones, and fails when the two differ; `test/package-extension.test.ts` pins the digest of a zip of made-up files on every system.
- **Only what the extension loads.** Of `extension/`, the zip takes what Git knows and what the build wrote into `lib/`. A file of a kind that `SHIPS` doesn't list fails the build unless `STAYS_OUT` lists it, and the build fails when the manifest names a file that the zip lacks. An untracked file beside the pages stays out by itself.
- **The store gets exactly that zip.** The job *the package of the release* holds no secret and builds nothing. It downloads the zip of the release, checks with `gh attestation verify` that it comes from `build-release.yml` on `main`, on a runner of GitHub, and that its manifest carries the version of the release, and hands on its sha256. The job that uploads compares the artifact with that sha256 before it signs in, and writes the sha256 into the summary of the run.
- **The provenance names `refs/heads/main`, not the tag.** The Release workflow runs on `main`, so a certificate never names a tag. What ties the zip to its release is that the isolated build builds only from a tag that it signed itself, at the commit of the release, and the version in the manifest. It doesn't compare the commit of the certificate with that of the tag: a run that takes up a draft of an earlier run builds from the tag but starts at a later commit of `main`.
- **No fallback.** A release without a zip, or a zip without a valid provenance, fails the run and goes nowhere.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../images/diagrams/the-zip-of-a-release.dark.svg">
  <img src="../images/diagrams/the-zip-of-a-release.svg" alt="How the zip of a release is made and who checks it: From the signed tag, a job that may write nothing builds the zip. The isolated build of the release attests it and attaches it to the release, which is immutable once published. The workflow of the store takes the zip from the release, checks its provenance and its version without any secret, and hands on its sha256. A job that reaches only Google compares the bytes and uploads them, and Google reviews and publishes the version. Someone who loads the extension unpacked downloads the same zip and checks it with gh attestation verify. Anybody can build the zip again from the tag, and gets the same sha256.">
</picture>

## Consequences

- Every release carries the zip with its provenance, for as long as the release exists. `verify-release.yml` checks that provenance every week, as for every other asset.
- The SBOMs of a release now describe the contents of the zip, which is what the blueprint does for an archive of `scripts/release-assets.sh`.
- The zip is some 330 KB rather than 110 KB. A player never downloads it from the store, which compresses what it hands out; someone who loads it unpacked barely notices.
- A release from before this decision, up to 1.1.0, can't go to the store any more. Should the store lack the latest release at that moment, the daily run fails with that reason until the next release, whose build attaches its zip.
- What the store hands out holds the same files and a `_metadata` folder of the store's own, so it can be compared with the zip file by file, not by its sha256.
- The script takes `[FOLDER] [VERSION]` as that of the kind `chrome-extension` does, so a later move to that kind has no other caller to change.
