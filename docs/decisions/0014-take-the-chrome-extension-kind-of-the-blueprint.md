# Take the Chrome extension kind of the blueprint

- Status: accepted
- Date: 2026-11-01

## Context

This project was the first Chrome extension of the blueprint, and it was made as a Node package, with `PUBLISH_TO = none`: the workflow of the store, its status script, the zip, the checks of the manifest and Chrome for Testing were files of its own. Since v1.1.0, the blueprint has a kind `chrome-extension` that brings the same files ([its decision 0085](https://github.com/Dennis-Otto/repo-blueprint/blob/main/docs/decisions/0085-a-chrome-extension-reaches-the-store-with-the-zip-that-its-release-attests.md)), and that decision says this project takes it. As long as it doesn't, it renews by hand what the blueprint keeps current for every other extension, its `SECURITY.md` tells users to verify a `*.tgz` that no release has, and its update pull requests bring nothing of what the kind learns.

## Options

1. **Stay a Node package.** No change, and the two copies drift apart.
2. **Take the kind, and keep the project's versions of the files that it brings.** Every update of the blueprint would conflict with them, and a change that belongs to the blueprint would land here again.
3. **Take the kind with its files, and keep only what is this project's own.** The files move to the blueprint, including what this project had that the blueprint lacks, which then has to reach the blueprint to come back.

## Decision

Option 3, with `copier update --data project_type=chrome-extension`.

- The blueprint now owns `publish-store.yml`, `check-manifest.mjs`, `package-extension.sh`, `chrome-for-testing.sh`, `load-extension.mjs` and `store-status.mjs`. The hook `release-assets.sh`, `store-status.ts`, `store-new-asks.ts` and their tests are gone, as the blueprint tests its own. `PUBLISH_TO` is `chrome-web-store`, from `.github/repository.toml`.
- The sign-in stays as [decision 0010](0010-sign-in-to-the-store-without-a-stored-secret.md) made it: the same variables `CWS_WORKLOAD_IDENTITY_PROVIDER` and `CWS_SERVICE_ACCOUNT`, and an environment `chrome-web-store` without a secret, kept to `main`. Google's condition names this repository, `main` and `publish-store.yml`, none of which change.
- What this project asks of its manifest beyond the store stays its own, as `scripts/check-extension.mjs`: exactly the permissions of `store/permissions.json`, nothing that opens the extension wider, Firefox, and the texts of the pictures. It holds a few rules of `check-manifest.mjs` as well, because it holds them to a stricter measure, and the kinds of file that the package may hold, which were in this project's `package-extension.sh`. `scripts/check-project.sh` still builds the zip twice and compares the bytes.
- The store listings use the headings that the check of the blueprint reads, `## Short description` and `## Permission justifications`, in every language, and name each host as the manifest does.
- `gh attestation verify` in the workflow keeps `--source-ref refs/heads/main --deny-self-hosted-runners`. The blueprint has changed its workflow to the same line since its release v1.3.0, so its next release brings no conflict. Dropping them until then would have weakened the check of what reaches every player.
- `scripts/load-extension.mjs` checks that what it takes from its map of answers is a function. CodeQL raised a high alert on that line of v1.3.0, which the ruleset of this repository doesn't let merge, though nothing but functions is in the map. The same change has to reach the blueprint, as every extension of the kind runs into it.

## Consequences

The update pull requests of the blueprint now keep the delivery current. A test here, `test/store-kind.test.ts`, keeps the settings that it depends on, and that the lint for Firefox reads what the package holds.

Four things that this project had are gone until they reach the blueprint, each a smaller loss than a second copy of the workflow:

- The job that uploads no longer compares its artifact with the sha256 of the job before it, and the summary of the run no longer names that sum. The provenance of the zip is checked as before, and an artifact keeps its digest within a run.
- A refusal with `INVALID_ITEM_METADATA` names everything that the version asks for, not only what is new since the version in the store.
- A review that begins while a run delivers fails that run, with the answer of the store, where it used to end with a note. The next daily run delivers the release.
- The zip is compressed rather than stored, about 110 KB instead of 330 KB, so another build of zlib may make other bytes around the same files. The build of a release no longer starts from an empty `extension/lib/`, which a clean checkout has anyway.
