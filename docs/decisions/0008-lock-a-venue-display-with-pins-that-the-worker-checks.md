# Lock a venue display with PINs that the service worker checks

- Status: accepted
- Date: 2026-10-25

## Context

The extension is made for a display that a household, a club or a pub shares: anyone
at it may switch to any saved account, which is the point at home. In a club or a pub,
not everyone at the board knows everyone else. A guest can play under a regular's
account and spoil their statistics, **Manage accounts** removes accounts and
remembers passwords with one tap, and the account of a player who left stays on the
board, so the next games count for them.

Nothing in a browser extension can keep the accounts from someone who can use the
computer: they can open `chrome://extensions`, remove the extension or read the
profile of the browser. The people at a board display can only use what it shows, the
popup and the players on the Autodarts page, often on a touch screen in kiosk mode.

## Options

1. **Leave it to the display.** A kiosk mode of the operating system and a separate
   browser profile keep people out of the settings of Chrome, but not out of the
   extension, and nothing returns the display after a player left.
2. **Lock the views.** The popup and the switcher could hide **Manage accounts** and
   ask for a PIN before a switch. Every check would sit in the view, and a second view,
   or a request sent around it, would pass.
3. **Check every PIN in the service worker, with the views only asking for it.** The
   worker already takes the requests that see or change the accounts only from the
   pages of the extension, and keeps the storage from the content script. It refuses
   a switch to an account with a PIN, and every change under **Manage accounts** or of
   the venue settings while a manager PIN is set, until the request carries the right
   PIN; the popup, the switcher and the options page then ask the person and send the
   request again, the way a switch during a match asks first.

## Decision

Option 3, off until a person turns it on under **Settings** → **For a club or pub**.

- `src/venue.ts` holds the logic, without the browser: the PINs, 4 to 8 digits, kept
  as PBKDF2 hashes with SHA-256, 600,000 rounds and a random salt of 16 bytes each,
  never the PIN; a count of wrong PINs, shared by every PIN and not cleared by a right
  one, five of which in a row lock every PIN for a minute; and the return after a
  break.
- The return after a break is decided once a minute, by an alarm of the worker, from
  the last input on the Autodarts page. The content script reports only that an input
  happened, at most every 15 seconds, and only while the return is on. A match that
  runs in any Autodarts tab counts as input, so the return never interrupts a match,
  and the break starts once it has ended. It switches to the house account, or signs
  out with the new `leaveDisplay`, which waits for no new account; either way the
  player before keeps their session parked, as at every switch.
- The views keep a manager PIN only as long as they need it: the popup and the
  switcher until **Manage accounts** closes, the options page until it closes.

## Consequences

- The documentation calls a PIN what it is: a lock for the people at the display, not
  a protection against someone who can use the computer. A copy of the profile lets a
  program try all 10,000 PINs of 4 digits against a hash in a short time; the security
  design lists that as a risk that remains.
- A forgotten manager PIN can't be recovered. Someone who can use the computer removes
  the venue settings in the console of the service worker, as the guide for a shared
  display shows; the accounts stay.
- The settings of the venue mode live under their own key, `venue`, beside the
  accounts, so the format of the accounts (decision 0006) stays as it is; removing an
  account removes its PIN as well.
- Each new view that switches players or changes accounts asks the worker and handles
  its answer `pin`, as `players.js` does; it can't skip the check.
