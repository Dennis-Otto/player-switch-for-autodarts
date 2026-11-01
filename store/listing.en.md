# Chrome Web Store listing (English)

## Name

Player Switch for Autodarts

## Short description

Switch between Autodarts accounts on a shared display with one tap, without signing in again.

## Detailed description

Share one Autodarts display in the hallway, the club or the pub, and let everyone
play under their own account.

Player Switch for Autodarts keeps the sign-in of several accounts on the computer
and swaps between them with a single tap — no password typing, no signing out and
back in.

How it works:

• Save each account once: after "Add account", the next sign-in on Autodarts is
  saved by itself. A tap on a tile puts that account on the board.
• The account that steps aside stays signed in, so a tap brings it straight back.
• Parked accounts are kept ready in the background, so they still work days later.
• Made for the board display: a round button on the Autodarts page, and the
  shortcut Alt+Shift+O, show the players right over the page, also in fullscreen
  and kiosk mode, in large tiles for a touch screen. The keys 1 to 9 pick a player.
• On the page of a running match, a switch asks first, so a match never ends by
  surprise.
• For a club or pub, optional and off by default: a manager PIN guards "Manage
  accounts" and the settings, each player can protect their account with a PIN of
  their own, and after a break the display returns to a house account by itself,
  never during a match. The extension keeps no PIN, only a salted hash of it.
• Optional: let the extension remember a password, and it signs an account back in
  by itself if its session ever stops working. Accounts that sign in with Google or
  Apple can't use this, because they have no Autodarts password to remember.
• Removing an account signs it out at Autodarts as well, and "Forget all accounts"
  wipes the display before it changes hands.

Everything stays on your computer. The extension talks only to Autodarts, collects
no analytics and sends nothing to anyone else. See the privacy policy for details.

The support page explains every message of the extension, and it links a guide for
a board display in kiosk mode that starts with the computer.

Not affiliated with Autodarts.

## Permission justifications

• storage — to keep your saved accounts, their sessions and the settings on your
  computer, in the venue mode also the salted hashes of the PINs.
• alarms — to renew parked sessions in the background so they stay ready, and in
  the venue mode to look once a minute whether the display should return after a
  break.
• scripting — to bring the button of a new version into the Autodarts tabs that are
  already open when the extension updates, or into one that stopped answering, so a
  display in kiosk mode keeps working without a reload. It runs only the extension's own script, only on
  play.autodarts.com.
• unlimitedStorage — so that Chrome never deletes the key that seals your saved
  sessions and passwords when the disk runs low. Without it, every parked account
  would have to sign in again.
• Web-accessible resource switcher.html, for play.autodarts.com only — the players
  that the button on the Autodarts page shows over the page. It is a page of the
  extension in a frame, so the scripts of the Autodarts page can't read the saved
  accounts out of it.
• Host access to `https://play.autodarts.com/*` — to move a session into the Autodarts page and
  out of it, to show the button there, and to find the open Autodarts tabs, so a
  switch takes effect in the one in front and the others reload. The extension can't
  read the address or title of any other tab.
• Host access to `https://api.autodarts.com/*` — to sign in, renew a session and end it, the
  same requests the Autodarts website makes. The extension connects to no other
  server, and its content security policy enforces that.

## Homepage and support URLs

- Homepage URL: <https://dennis-otto.github.io/player-switch-for-autodarts/>
- Support URL: <https://dennis-otto.github.io/player-switch-for-autodarts/help.html>,
  the help, which explains every message of the extension and links the guide for a
  shared display.

The store takes each address once for every language; the English pages link their
German ones in the language switch of their header.

## Category

Productivity

## Single purpose

Switch the signed-in Autodarts account on a shared display without signing in again.

## Images

The screenshots (1280×800) and the promo tiles (440×280 and 1400×560) of this listing are the `.en` files in [`images/`](images/), rendered by `bash scripts/screenshots.sh`; [the release guide](../docs/releases.md#the-images-of-the-store) says which slot of the dashboard takes which file.
