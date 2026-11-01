# Changelog

All notable changes, by release. Each pull request that changes something for
users describes it under Unreleased. The release bot makes that text the section of
the next release, or lists the pull requests when there is none.

## Unreleased

## [1.2.0](https://github.com/Dennis-Otto/player-switch-for-autodarts/compare/v1.1.0...v1.2.0) (2026-11-01)


### Features

* **release:** attach the ready-to-load extension to every release and send the store exactly that file ([#120](https://github.com/Dennis-Otto/player-switch-for-autodarts/issues/120)) ([ae905e5](https://github.com/Dennis-Otto/player-switch-for-autodarts/commit/ae905e5052bcf9f5eb526c7a3bf86fa0e27c0b13))
* **release:** check what the release zip holds and compare its bytes before the store upload ([#121](https://github.com/Dennis-Otto/player-switch-for-autodarts/issues/121)) ([e008390](https://github.com/Dennis-Otto/player-switch-for-autodarts/commit/e008390ec903bd549c662e3a2f04e3343e564850))
* render the store pictures in Dutch, French and Spanish ([#115](https://github.com/Dennis-Otto/player-switch-for-autodarts/issues/115)) ([e19ed80](https://github.com/Dennis-Otto/player-switch-for-autodarts/commit/e19ed804e2a84c872e6a1921db0c67bb57dcc4be))


### Bug fixes

* a session signed in directly in the page can no longer be saved under another player's tile ([#111](https://github.com/Dennis-Otto/player-switch-for-autodarts/issues/111)) ([77ecb21](https://github.com/Dennis-Otto/player-switch-for-autodarts/commit/77ecb2103546e580ef72c1b02c796449d734a974))
* make OSV-Scanner and Findings pass on main ([#110](https://github.com/Dennis-Otto/player-switch-for-autodarts/issues/110)) ([fe0ad64](https://github.com/Dennis-Otto/player-switch-for-autodarts/commit/fe0ad644b1f56b585e6f9e41af9363143b1cf309))
* the store run explains INVALID_ITEM_METADATA and a version that is already in review ([#114](https://github.com/Dennis-Otto/player-switch-for-autodarts/issues/114)) ([d169e10](https://github.com/Dennis-Otto/player-switch-for-autodarts/commit/d169e10b86b71b5635e529a11107aa5debb9a168))

## [1.1.0](https://github.com/Dennis-Otto/player-switch-for-autodarts/compare/v1.0.0...v1.1.0) (2026-10-25)

### Features

- Player Switch now runs in Microsoft Edge 140 or newer, from the Chrome Web Store or
  loaded unpacked, and, as a preview not yet tested by hand in Firefox, in Firefox 140
  or newer, for now as a temporary add-on until it is listed on addons.mozilla.org. The
  website and the README say how to install it in each browser. Firefox lists on the
  add-on's page in `about:addons`, and will ask at the install once the add-on is listed
  on addons.mozilla.org, that it sends authentication information, which goes to the
  sign-in service of Autodarts alone. Firefox can't keep
  the storage of the extension from its script in the Autodarts page, so a display in a
  club or a pub is best set up with Chrome or Edge.
- **Change shortcuts** on the options page opens the shortcuts of the browser in
  Firefox too, where it did nothing before.
- "Report a problem" now names Firefox and its version in the bug form, where it said
  "unknown" before.
- Removing an account now signs it out at Autodarts as well, before the extension
  deletes it, so that no copy of its session, such as in a backup of the computer,
  keeps working. Removing the player who plays on the page signs the page out, and
  during a match the extension asks first. When Autodarts can't be reached, the
  account is removed all the same, and the popup says that its session ends only
  when it expires.
- "Forget all accounts", under "Manage accounts", prepares a display that changes
  hands: after a confirmation, and in the venue mode the manager PIN, it signs every
  account out at Autodarts and deletes everything the extension keeps, with the key
  that seals the sessions, the PINs and the settings.

## [1.0.0](https://github.com/Dennis-Otto/player-switch-for-autodarts/compare/v0.2.0...v1.0.0) (2026-10-25)

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

### Features

- The saved sessions and remembered passwords are now stored encrypted. The key stays
  in the browser, which never hands it out, not even to the extension, so a tool, a
  backup or a copy that reads the extension's storage finds no session and no
  password in it. The update encrypts the accounts that are already saved, and every
  player stays signed in.
- If the key is ever lost, for example because the data of the extension was
  cleared, the parked accounts ask to sign in again once, and remembered passwords
  are forgotten. Nothing else breaks.
- The update asks for the permission `unlimitedStorage`, which shows no warning, so
  that Chrome never deletes the key when the disk runs low.
- Versions up to 0.2.0 don't know the encrypted format, so don't go back to them: they
  would drop the saved sessions. From this release on, an older version leaves newer
  accounts untouched and asks for an update.
- Switch players from the Autodarts page itself, also in fullscreen and kiosk mode,
  where the toolbar is out of reach: a round button in a corner of the page, with the
  picture of the player, shows the players over the page in large tiles for a touch
  screen. Alt+Shift+O opens them from the keyboard, Alt+Shift+P opens the popup, and
  in the players the keys 1 to 9 pick a player and Esc closes them.
- On the page of a running match, a switch now asks first, before anything changes:
  "A match is running. Switching ends it on this display."
- A new options page, behind "Settings" in the popup, turns the button off or moves
  it to another corner. Removing an account now asks in a dialog that works on a
  touch screen.
- After an update of the extension, the button keeps working in Autodarts tabs that
  were already open, without a reload. A switch from the button on the page always
  happens in that tab, also with Autodarts open in two windows.
- The extension speaks Dutch, French and Spanish too: with Chrome set to one of them,
  the popup, the players on the Autodarts page, the welcome page, the settings and the
  tooltip of the icon show its texts, and names and times its format. The Chrome Web
  Store gets a listing in each of them. Help leads to the English help there, as the
  website stays in English and German.
- A welcome page opens once after the install, in English or German: it shows how
  to pin the icon, with a picture, and how to add the players, and opens Autodarts
  with one click.
- Adding a player no longer needs a second visit to the popup: after "Add account",
  and after the install, the next sign-in on Autodarts is saved by itself, and the
  icon shows a check mark for a moment. Only the first sign-in in the next ten
  minutes is saved this way; "Cancel" in the popup or the switcher stops the waiting earlier.
- A "+" on the icon says that someone is signed in on Autodarts who isn't saved yet.
- The popup links to the help and to "Report a problem", which opens the bug form
  with the versions of the extension and the browser filled in, and nothing else.
- A venue mode for a display in a club or a pub, off until you turn it on under
  Settings → For a club or pub:
  - A manager PIN guards Manage accounts and the settings, so nobody at the display
    removes an account or remembers a password without it.
  - Each player can protect their account with a PIN of 4 to 8 digits. A tap on their
    tile asks for it on a number pad that works on a touch screen, in the popup and on
    the Autodarts page, and their tile shows a lock. Five wrong PINs in a row make
    every PIN wait a minute.
  - After a break of 5 to 60 minutes without a tap, a click or a key on the Autodarts
    page, the display returns to a house account of your choice, or signs out, so the
    next games don't count for the player who left. A match is never interrupted: the
    break starts once it has ended, and the player before keeps their session parked.
- The extension keeps no PIN, only a salted hash of it. A PIN is a lock for the people
  at the display, not a protection against someone who can use the computer; the
  guide for a shared display shows what to do about a forgotten manager PIN.

### Changes

- "Help" in the popup and on the welcome page now opens a help page that explains
  every message of the extension word for word, in English and German, with what to
  do about it.
- The website has a guide for setting up a shared board display: fullscreen, autostart,
  an on-screen keyboard and the power settings, and German pages for privacy and security.

### Bug fixes

- Parked accounts keep being renewed when the browser or the computer was off:
  each start of the browser sets the renewal again if Chrome dropped it, and
  renews straight away when a renewal was due while the computer was off.
- The toolbar icon shows how many accounts have to sign in again, and its tooltip
  names them, so nobody finds out only when they want to play. "Manage accounts"
  shows for each parked account when it was last renewed, such as "Renewed 3 hours
  ago".
- When Autodarts turns every saved account away at once, the popup says that
  Autodarts may have changed how it signs in and links to the known problems and
  updates, instead of only asking everyone to sign in again.
- The saved accounts, with their sessions and remembered passwords, are now out of
  reach of the script that the extension runs in the Autodarts page: only the
  extension's own popup, options page, switcher and background service can read
  them, so even a page that went rogue can't get at them through that script.
- The extension now lets the browser block every connection except to Autodarts'
  sign-in service, takes requests to see or switch accounts only from its own
  pages, and writes nothing but a session into the Autodarts page.
- The extension no longer asks for access to `play.autodarts.io`, which only
  forwards to `play.autodarts.com`. It now needs Chrome 140 or newer, so an older
  browser no longer installs a version that can't run, and `chrome://extensions`
  links its website.
- After a silent update of the extension, a tap on a player switches straight away
  in an Autodarts tab that was open before, also on a display that keeps Autodarts
  open for days, instead of saying "Open Autodarts" or reloading the page first. A
  tab that the update missed gets the new script of the extension at the next tap
  in the toolbar popup, "Open Autodarts" or keyboard shortcut, and a running match goes on.
- The popup and the players on the Autodarts page work with a keyboard and a screen
  reader: after a switch, a removal or a saved password the focus stays where you
  were instead of jumping to the top, the tile of the player who plays is marked as
  the current one, "Manage accounts" says whether it is on, the actions below a tile
  name its account, and an error is read out at once.
- The keys 1 to 9 pick a player in the popup too, as they do on the page; their
  numbers show on the tiles once you use the keyboard.
- Every button and link of the popup is at least 44 by 44 pixels, easy to hit with a
  finger on a touch display, no text is smaller than 12 pixels, and the blue and amber
  texts are a little darker, so they are easy to read on the light background.
- In German, the buttons under "Konten verwalten" no longer break onto two lines.
- After a switch, the popup no longer keeps saying "Switching to …".
- A contrast theme of Windows keeps the player who plays and the chips apart, and with
  reduced motion in the system, nothing in the popup moves.
- Tapping a player twice no longer signs the previous player out, and a switch
  while the extension renews the parked sessions in the background no longer loses
  a session or marks a player as needing a new sign-in. The popup takes no other
  tap while a switch is on its way, and tells screen readers that it is busy.
- A switch now happens on the Autodarts tab you're looking at, also with Autodarts
  open in a second window, and every other Autodarts tab reloads with the new
  player, one after another, so no tab plays on as the one before or signs a parked
  player or the new one out.
- With no Autodarts tab open, a tap on a player opens Autodarts and switches there,
  and "Add account" opens it signed out. When Autodarts doesn't answer, the popup
  offers "Open Autodarts" instead of a dead end. After an update of the extension,
  a tap reloads an Autodarts tab that no longer answers by itself.
- The extension no longer asks to "Read your browsing history" when it is
  installed: it reads the address of a tab only for the Autodarts sites.
- Going back to an older version of the extension no longer wipes the saved
  accounts: the accounts now carry the version of their format, a version that
  doesn't know it leaves them untouched and keeps a copy, and the popup asks you
  to update instead.
- "Manage accounts" shows since when renewing a parked account fails while
  Autodarts can't be reached, such as "Renewal failing since Oct 22, 2026,
  9:15 PM", until a renewal works again, and the extension logs such failures in
  its service worker console instead of hiding them.

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
