# Changelog

All notable changes, by release. Each pull request that changes something for
users describes it under Unreleased. The release bot makes that text the section of
the next release, or lists the pull requests when there is none.

## Unreleased

**The first stable version, 1.0.0.** Player Switch now does what it was built for:
everyone at a shared Autodarts display plays under their own account and switches
with one tap, in the toolbar popup or on the Autodarts page itself, also in
fullscreen and kiosk mode. The account that steps aside stays signed in, renewed in
the background and stored encrypted in the browser. The extension speaks English,
German, Dutch, French and Spanish, works with a keyboard, a screen reader and a
finger, and guards a display in a club or a pub with PINs in its venue mode. From
now on, a release that takes away something you use, such as a setting, a language
or a keyboard shortcut, is a new major version, and an update within 1.x keeps every
saved account and setting as it is.

## [1.0.0](https://github.com/Dennis-Otto/player-switch-for-autodarts/compare/v0.2.0...v1.0.0) (2026-10-25)


### Features

* add a venue mode with a manager PIN, player PINs and a return to the house account ([#72](https://github.com/Dennis-Otto/player-switch-for-autodarts/issues/72)) ([864c1de](https://github.com/Dennis-Otto/player-switch-for-autodarts/commit/864c1de4dfd05c6c7289880e555efe9126a6023e))
* guide the first set-up and save each newly signed-in account by itself ([#42](https://github.com/Dennis-Otto/player-switch-for-autodarts/issues/42)) ([e28ab05](https://github.com/Dennis-Otto/player-switch-for-autodarts/commit/e28ab054cd87121a20621fe7ea5df75df1d4dc22))
* **security:** encrypt the stored sessions and passwords with a key that never leaves the browser ([#68](https://github.com/Dennis-Otto/player-switch-for-autodarts/issues/68)) ([57027dc](https://github.com/Dennis-Otto/player-switch-for-autodarts/commit/57027dcafba266b427f682115b94a197ecf1b945))
* speak Dutch, French and Spanish ([#69](https://github.com/Dennis-Otto/player-switch-for-autodarts/issues/69)) ([30aab93](https://github.com/Dennis-Otto/player-switch-for-autodarts/commit/30aab939d2a233df95e2bf1850c0b68005637298))
* switch players from the Autodarts page itself, also in fullscreen and kiosk mode ([#40](https://github.com/Dennis-Otto/player-switch-for-autodarts/issues/40)) ([b1d58ee](https://github.com/Dennis-Otto/player-switch-for-autodarts/commit/b1d58eec527f0944b891f43dd026b58c780d53c9))


### Bug fixes

* keep renewing parked accounts after a browser restart and show which accounts need attention ([#37](https://github.com/Dennis-Otto/player-switch-for-autodarts/issues/37)) ([a921e88](https://github.com/Dennis-Otto/player-switch-for-autodarts/commit/a921e88c7d1169164b450a8165eff0a11012c2ef))
* **popup:** make the popup work with a keyboard, a screen reader and big fingers ([#58](https://github.com/Dennis-Otto/player-switch-for-autodarts/issues/58)) ([f354c46](https://github.com/Dennis-Otto/player-switch-for-autodarts/commit/f354c465d05bc80e21c79133c4808ec6aa92d469))
* reach the Autodarts tab after an install or update without a reload ([#62](https://github.com/Dennis-Otto/player-switch-for-autodarts/issues/62)) ([23c0512](https://github.com/Dennis-Otto/player-switch-for-autodarts/commit/23c0512027e3c7cdb87d21b9f58fe2706abd7da0))
* **security:** keep stored passwords away from the page and enforce least privilege ([#57](https://github.com/Dennis-Otto/player-switch-for-autodarts/issues/57)) ([1c7b394](https://github.com/Dennis-Otto/player-switch-for-autodarts/commit/1c7b39471f494b2bc99e926c891a68485263dd10))
* serialize account changes so a double tap cannot lose a session ([#31](https://github.com/Dennis-Otto/player-switch-for-autodarts/issues/31)) ([e6d6755](https://github.com/Dennis-Otto/player-switch-for-autodarts/commit/e6d6755d95711e729dee9f2df7411e0cb8ed6acd))
* switch on the Autodarts tab in front, reload every other Autodarts tab and open Autodarts when none is open ([#39](https://github.com/Dennis-Otto/player-switch-for-autodarts/issues/39)) ([40013f1](https://github.com/Dennis-Otto/player-switch-for-autodarts/commit/40013f141b1887370e409c2164e13c432768c773))
* **worker:** never save over accounts of a newer version and show since when a renewal fails ([#51](https://github.com/Dennis-Otto/player-switch-for-autodarts/issues/51)) ([8b51fe3](https://github.com/Dennis-Otto/player-switch-for-autodarts/commit/8b51fe3cf05264c4970a8171c76c652e2554e6a7))


### Documentation

* release the extension as 1.0.0, its first stable version ([#79](https://github.com/Dennis-Otto/player-switch-for-autodarts/issues/79)) ([3ad2017](https://github.com/Dennis-Otto/player-switch-for-autodarts/commit/3ad2017a5dc2fdc604edc157fb3cf80429b9e6da))

## [0.2.0](https://github.com/Dennis-Otto/player-switch-for-autodarts/compare/v0.1.1...v0.2.0) (2026-10-15)

- Each release now reaches the Chrome Web Store on its own: the release workflow
  uploads it and submits it for review, and Google publishes it once the review
  passes.

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
