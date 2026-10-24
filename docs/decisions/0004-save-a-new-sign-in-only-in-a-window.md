# Save a new sign-in by itself only in a window after "Add account"

- Status: accepted
- Date: 2026-10-24

## Context

Adding a player took five steps: open the popup, choose **Add account**, which signs
the page out and closes the popup, sign in on Autodarts, open the popup again and
choose **Save account**. A forgotten last step left the account unsaved, and a new
user found out only when the tile was missing. The extension can see a new session:
each Autodarts tab that finishes loading reaches the service worker through
`chrome.tabs.onUpdated`, and the content script can read the session of the page.
But reading who a session belongs to rotates its token, and a display is shared, so
not every sign-in on it is one that should become a tile.

## Options

1. **Keep the tap on Save account.** Nothing is saved that nobody asked for, but the
   extra steps stay, and so does the account that was never saved.
2. **Save every new session in the page by itself.** No step is needed, but a guest
   who signs in once, or a person who signs in to look at their statistics, becomes a
   tile without being asked, and each look at a page spends a token.
3. **Save the first new session within a window after Add account or the install.**
   The tap on **Add account**, or the install itself, is the request; the next
   sign-in in the following ten minutes is saved once, and the window closes.

## Decision

Option 3. The person has already said that a new account comes; saving the sign-in
that follows is what they would do anyway. The window is short, is used once, closes
when a saved account comes on, closes for good when it runs out, and **Cancel** in
the popup or the switcher closes it earlier, so a sign-in later on is never saved without a tap. A
`+` on the icon points at a session that no account keeps outside the window, and
**Save account** stays for it. The window is part of the saved accounts
(`addingUntil`), because the service worker stops while a person signs in.

## Consequences

- Adding a player needs one visit to the popup, and the first player none after the
  install: the welcome page that the install opens explains the steps.
- `switch.ts` has `adoptNewSignIn`, which spends no token outside the window; the
  unit tests run the window with a set clock, and the model test lets time pass and
  pages load at any step of an evening.
- Autodarts stores the session a moment after the page has loaded, so the service
  worker looks a few times over 15 seconds; the popup and the switcher on the page
  look as well when they open.
- Autodarts renews the session it started with as a page loads, and a token sent a
  second time ends the session: after a load, the service worker first waits until
  the page has renewed it, as a switch does, and keeps a session that the page
  renewed while Autodarts turned the old token away.
- Saving a session reloads every Autodarts tab, so nothing is saved by itself while a
  match runs in one of them; **Save account** and the `+` still cover that session.
