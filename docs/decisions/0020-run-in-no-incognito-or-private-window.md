# Run in no incognito or private window

- Status: accepted
- Date: 2026-11-13

## Context

A manifest without the key `incognito` runs the extension in the mode `spanning`:
once the person allows it in incognito windows (private windows in Firefox), the
one service worker serves the incognito tabs too, and `chrome.tabs.query` hands it
the Autodarts tabs of both kinds of window.

The extension rests on one rule for its tabs: every Autodarts tab of the browser
shares one `localStorage`, and with it one refresh token (`src/tabs.ts`). An
incognito window keeps a `localStorage` of its own. A switch from an incognito tab
read the session of that window, parked it as the session of the account that played
in the normal windows, wrote the new token into the incognito window and reloaded only
the normal tabs, which went on with their old player. A look at an incognito tab
without a session marked the account that plays as **Sign in again**. The accounts
themselves, in `chrome.storage.local`, are the same for both kinds of window.

## Options

1. **`"incognito": "not_allowed"`:** the extension runs in no incognito or private
   window, whatever the person allows. Chrome, Edge and Firefox know the value.
2. **Tell the windows apart:** the tabs carry `incognito`, and every request, reload and
   new tab of `src/tabs.ts` takes only those of the normal windows. The incognito tabs
   would still show the button and the switcher, which then could do nothing there.
3. **`"incognito": "split"`:** a second service worker for the incognito windows, with
   accounts of its own. Firefox doesn't support it, and the accounts of a display would
   be in two places.

## Decision

Option 1. A shared display runs Autodarts in a normal window of its profile, as the
guide to a shared display already says, and nobody needs Player Switch in a private
window: there it can only park the wrong session. `scripts/check-extension.mjs` fails
on a manifest that lets the extension run in such a window, and the help says so in
every language.

## Consequences

- The extension doesn't show up in incognito and private windows, and its switch can't
  reach their tabs, also after the person allowed extensions there.
- Should a person ever need it there, option 2 or 3 is a new decision, with tests for
  both kinds of window.
