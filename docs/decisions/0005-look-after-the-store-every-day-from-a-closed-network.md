# Look after the store every day, from jobs with a closed network

- Status: accepted
- Date: 2026-10-25

## Context

[Decision 0003](0003-deliver-each-release-to-the-chrome-web-store.md) delivers a
release to the Chrome Web Store once, right after the Release workflow, or when
someone starts the workflow by hand. That left four gaps:

- A release that arrives while Google still reviews the previous version fails at
  the upload, as the store takes no new version during a review, and a failed run
  was never tried again.
- After the submission, nobody learned whether Google published, rejected or took
  down the item: the run ended green with `PENDING_REVIEW`.
- Google expires a refresh token that goes unused for six months. After 1.0,
  releases get rarer, so a dead token would show up only at the next release.
- Both jobs held the client secret and the refresh token, which can publish a
  version to every user, but only recorded their network traffic
  (`egress-policy: audit`): a compromised action or npm package in the job of the
  upload, which ran `npm ci` and the build right before the sign-in, could have sent
  the token anywhere. The plan of the blueprint to block the traffic covers its own
  workflows, not this one of the project.

The store tells the state of the item with `fetchStatus`: the published and the
submitted version, each with its state (`PENDING_REVIEW`, `STAGED`, `PUBLISHED`,
`PUBLISHED_TO_TESTERS`, `REJECTED` or `CANCELLED`), and whether Google warned the
item or took it down. It doesn't tell when a version was submitted.

## Options

1. **Keep the single delivery** and document what to do by hand after a failure.
2. **A daily run of the same workflow** that asks the store, delivers what it lacks
   once no review is pending, and fails with the reason and the fix when a person
   has to act; a run that fails keeps an issue of the bot-health sweep open.
3. **Poll the store in a loop** after the submission, until the review ends: a job
   that waits for days, which a runner can't do.

For the network, either keep recording the traffic, or block every host apart from
those that a job needs, with `egress-policy: block` of Harden-Runner.

## Decision

Option 2, and block the network.

- The workflow also runs every day at 00:17 UTC, before the bot-health sweep of the
  night. `scripts/store-status.ts` decides, from the answer of `fetchStatus` and the
  latest release, with tests for every case: a release that the store lacks goes to
  the store when no review is pending; a pending review ends the run with a note; a
  rejected submission, a warning, a takedown, a review of more than 7 days and a
  store version above the release fail the run, each with what to do. A tag started
  by hand goes to the store again after a rejection or a cancellation.
- The days of a review count from the artifact that the delivery keeps, whose time
  the API of GitHub tells; for a version that went to the store another way, from
  its release.
- The daily sign-in keeps the refresh token in use; a token that Google turns away
  fails the run within a day, with the way to renew it.
- Three jobs, each with the hosts that it needs and no other: *status* (GitHub and
  Google), *package* (GitHub and npm, without a secret) and *store* (Google only),
  which takes the zip of *package* as an artifact and runs no code of the repository
  and no npm package beside the token. Every job runs without sudo and containers,
  on `ubuntu-24.04` rather than an image that moves to a new release of Ubuntu by
  itself, and `scripts/check-project.sh` fails when a job of the workflow gives up
  any of it.

## Consequences

- A release that had to wait for a review, or whose run failed, reaches the store
  within a day after the cause is gone, without anyone starting the workflow.
- A rejection, a warning or a takedown of Google shows up as a failed run and an
  issue within a day, not at the next release.
- A new host that a job needs, such as one of a new version of an action, has to be
  added to its `allowed-endpoints`; the run that it breaks names the blocked host in
  the insights of Harden-Runner.
- The image moves to a new release of Ubuntu only with a change of `runs-on`, which a
  pull request reviews.
- The workflow makes a run every day, which takes about a minute of a runner.
