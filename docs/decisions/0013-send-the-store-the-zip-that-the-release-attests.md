# Send the store the zip that the release attests

- Status: accepted, and the hook, the stored files and the comparison of the sha256 replaced by [0014](0014-take-the-chrome-extension-kind-of-the-blueprint.md)
- Date: 2026-11-01

## Context

The releases carried SBOMs, notices and a provenance, but not the extension. That had two costs:

- Whoever installs it without the Chrome Web Store, such as a tester or the admin of a club, needed Node.js and a build.
- The job *package* of `publish-store.yml` built its own zip from the tag, outside the isolated build of the release. The store got a package that no provenance described, and that nothing tied to the signed tag beyond the version in its manifest.

A release is immutable once published, so a file has to join its draft inside the build. Since v1.3.0, the blueprint offers two ways: a hook of the project, `scripts/release-assets.sh`, whose files the release attests and attaches ([its decision 0084](https://github.com/Dennis-Otto/repo-blueprint/blob/main/docs/decisions/0084-a-project-builds-its-own-release-assets-in-a-job-that-may-write-nothing.md)), and a project kind `chrome-extension` ([its decision 0085](https://github.com/Dennis-Otto/repo-blueprint/blob/main/docs/decisions/0085-a-chrome-extension-reaches-the-store-with-the-zip-that-its-release-attests.md)).

## Options

1. **Attach a zip, and keep the build of the store.** Two builds of one version, which can differ, and the store still gets the one without a provenance.
2. **The hook, and the store takes its zip.** One file for everyone, in a change of this project alone, with `PUBLISH_TO` still `none`.
3. **The kind `chrome-extension`.** The same result, with the workflow of the store in the blueprint. It also moves the checks and the workflow that this project keeps for itself, which is a change of its own.

## Decision

Option 2.

- `scripts/release-assets.sh` calls `scripts/package-extension.sh`, which writes `player-switch-for-autodarts-<version>.zip`. It stops when the manifest lacks the version of the release, and a beta gets the numbers of its version in the manifest and the whole as `version_name`.
- From a clean checkout, the same commit makes the same zip, byte for byte, in Python on every system, so that anyone can build it again and compare. So the build starts from an empty `extension/lib/`, and the files are stored rather than compressed: what zlib makes of a file depends on its build, Python on Windows and on Linux gave different bytes, and a zip of about 330 KB instead of 110 KB costs nobody anything. That also takes the fallback to PowerShell, whose archives have backslashes, away.
- The job *package* of `publish-store.yml` takes that file from the release by its exact name, and runs `gh attestation verify` on it for `build-release.yml`, `refs/heads/main` and a runner of GitHub, then compares the version in its manifest with the release. It runs no code of the repository and no npm package, and reaches GitHub and Sigstore alone.
- The zip holds only the kinds of file that `scripts/package-extension.sh` lists and each file that the manifest names; any other kind stops the build, so nothing new reaches the users unnoticed. `scripts/check-project.sh` builds the zip twice, the second time as a release does and in another time zone, and compares the bytes.
- The job *package* hands on the sha256 of the zip. The job *store* compares its artifact with that sum before it signs in, and names the sum in the summary of the run, so that anyone can compare what went to the store with a download or a build.
- A release without the zip, or a zip that fails a check, stays off the store and fails the run. There is no fallback to a build: that fallback is what an attacker of a job would ask for.
- The README and the website offer the zip as the way to install without the store. The screenshot script renders the picture of `chrome://extensions`, without an extension in it, so that a release doesn't change its pixels.

## Consequences

A player needs no Node.js, and the package of a player and that of the store are one file, which the SBOMs of the release now describe in place of the sources. The job *package* needs no npm registry, and the store gets nothing that the release doesn't attest.

A release from before the zip, up to 1.1.0, can't go to the store any more, not even by hand with its tag: the run says so, and the fix is a new release. A copy loaded from the zip gets no update by itself, which the README and the website say.

A move to the kind `chrome-extension` takes `scripts/release-assets.sh` away, because that kind builds the zip itself and refuses a `*.zip` of the hook; `test/release-zip.test.ts` names this next to `PUBLISH_TO`.
