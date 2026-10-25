# Watch Autodarts and the next Chrome before the players do

- Status: accepted
- Date: 2026-10-25

## Context

A switch depends on parts of Autodarts that are no public contract: the key
`autodarts_refresh_token` under which Autodarts Play keeps its session in
`localStorage`, the sign-in service `https://api.autodarts.com/auth/v1` with the client
`autodarts-play`, the answers 400 and 401 for a dead session and a wrong password, and
the forward of play.autodarts.io to play.autodarts.com. When Autodarts renames the key
or moves the service, every switch fails on every display, and an address that answers
404 counts as an outage, so the extension keeps retrying and never falls back to a
remembered password. The end-to-end tests of [0007](0007-test-the-real-extension-against-a-fake-autodarts.md)
can't see such a change: their fake Autodarts keeps the old rules until somebody
teaches it the new ones.

A new version of Chrome reaches every display by itself every four weeks, and nothing
ran the extension in it before. Branded Chrome, Beta too, no longer loads an unpacked
extension from the command line since version 137.

## Options

1. **Wait for the reports of players**: no work, but the first to notice is a player
   at the board, and a fix then needs days in the review of the Chrome Web Store.
2. **End-to-end tests against the real Autodarts with a test account**: they would
   see every change, but need a secret, sign a real account in every day and spend
   its tokens, and break when Autodarts limits sign-ins.
3. **A daily check of the contract with made-up data, and a daily run of the
   end-to-end tests in Chrome for Testing Beta**: the check looks for the three
   values in the code of Autodarts Play, sends a made-up token, a made-up account and
   the end of a made-up session through the functions of the extension, and follows
   the forward of play.autodarts.io; Chrome for Testing is Chrome built for tests,
   which still loads an unpacked extension.

## Decision

Option 3, in the workflow Upstream. It needs no secret and no account, and sends about
a dozen requests a day, fewer than one visit of Autodarts Play, which loads more than
150 scripts; it reads every script only on a day when a value is missing. The expected
values come from `src/autodarts.ts`, and the sign-in requests go through the
extension's own functions, so the check tests what the extension really sends. A unit
test fails when a place that the report names, such as the copy of the key in
`extension/content.js` or in the fake Autodarts, no longer has its value. The name
Upstream is on the list of the bot-health bot, so a failure opens an issue at once and
the next run that passes closes it.

## Consequences

- A change of Autodarts or a break in the next Chrome shows up as an issue with the
  label `bot-failure` within a day, or about four weeks before the version of Chrome
  reaches the players, with a summary that names what changed and where the code
  relies on it.
- An outage of Autodarts fails the check too; the bot-health bot runs a failed job
  once more, and the next run that passes closes the issue.
- The check knows only what the code of Autodarts Play shows and what its sign-in
  service answers to made-up data: a change of what a real session contains, such as
  the claims of its access token, still needs the reports of players.
- A pull request that changes `src/autodarts.ts` runs the check as well, so a new
  value is checked against the real Autodarts before it merges.
