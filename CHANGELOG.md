# Changelog

All notable changes, by release. Each pull request that changes something for
users describes it under Unreleased. The release bot makes that text the section of
the next release, or lists the pull requests when there is none.

## Unreleased

## [0.1.1](https://github.com/Dennis-Otto/player-switch-for-autodarts/compare/v0.1.0...v0.1.1) (2026-10-15)

- The password form and the account menu no longer show all the time: they appear
  only under "Manage accounts" and only after a tap on "Remember password".
- An account without a picture at Autodarts shows its initial instead of an empty
  circle, the popup carries the browser's language, and the labels read "Remember
  password" / "Stop remembering" and "Remove account".

## 0.1.0 (2026-10-15)

- Switch between saved Autodarts accounts on a shared display with one tap: the
  extension parks each account's session, keeps parked sessions fresh in the
  background, and can optionally remember a password to sign an account back in.
- A redesigned popup: a clean tile grid of players with a separate "Manage
  accounts" mode, and German and English throughout.
- Clearer messages when a switch can't happen (no Autodarts tab, Autodarts
  unreachable, or an account that must sign in again).
- A renewed token is now saved before it is written into the page, so a page that
  reloads or closes mid-switch can no longer lose a session.
- Ready for the Chrome Web Store: `scripts/package-extension.sh` builds the upload
  zip, the manifest version follows the release, and there is a privacy policy and
  listing texts.
