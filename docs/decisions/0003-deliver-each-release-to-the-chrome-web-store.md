# Deliver each release to the Chrome Web Store from the release workflow

- Status: accepted
- Date: 2026-10-15

## Context

Every version of the extension reaches its users through the Chrome Web Store,
which takes a zip of `extension/` and reviews each version. The first release,
0.1.0, was uploaded by hand. The release bot of the blueprint makes a release from
`main` with a signed tag, an SBOM and provenance, but delivers a browser extension
nowhere (`PUBLISH_TO = none`). Three limits shape the automation:

- Google supports the Chrome Web Store API V1 only until 15 October 2026, so only
  its V2 is an option, which names the item by publisher ID and item ID.
- The release bot publishes a release with the `GITHUB_TOKEN`, whose events start no
  workflow, so a workflow that only starts on the event `release` would never run
  for the releases of the bot.
- A release is immutable once published, so no file can join it later, and the
  release verification accepts only files with the provenance of the isolated
  build.

## Options

1. **Upload by hand** after every release, as for 0.1.0.
2. **A workflow of the project** that starts after the Release workflow, and on a
   release published by hand, builds the zip from the tag, and calls the Chrome Web
   Store API with `curl`, with an OAuth client and a refresh token of the developer
   account as the secrets of an environment.
3. **A third-party action** that uploads to the store.
4. **A service account** of Google Cloud as the identity of the workflow, instead of
   a refresh token of the developer's account.

## Decision

Option 2. The upload is four requests, which `curl` and `jq` make without another
dependency that would hold the credentials of the store (against option 3). A
refresh token is the way that Google documents and takes minutes to set up; a
service account (option 4) remains an option should the token prove a burden. The
workflow starts after the Release workflow and looks up which release that run
published, so that it also follows the releases of the bot; before it uploads, it
asks the store which version is published or under review, so that a second start
for the same release does nothing.

The zip stays off the GitHub release for now: no file can join an immutable release,
and only the isolated build of the release workflow could attach one with its signed
provenance.

## Consequences

- A release reaches the store minutes after it is published; Google's review still
  decides when the users get it.
- The secrets live in the environment `chrome-web-store`, which only `main` may use;
  the IDs are variables of the repository. The page *Releases* has the set-up. The
  refresh token lasts as long as the consent screen of the Google Cloud project is
  in production; in testing, it expires after seven days.
- While a version is under review, the store takes no new one; after the review or
  a cancellation, the workflow is started by hand with the tag.
- The upload zip is in the store only, not on the GitHub release; attaching it with
  provenance needs a step in the isolated build.
