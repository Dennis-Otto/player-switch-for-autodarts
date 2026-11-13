### Bug fixes

- **Save account** says that Autodarts can't be reached when it can't, instead of a general error, and the page keeps its session.
- **Save account** asks first while a match runs, as a switch does: saving reloads the page, which ended the match without a word until now.
- A player's PIN holds by itself, also on a display without a manager PIN: changing it or **Remove PIN** under **PINs of the players** asks for that PIN first, and a wrong one counts towards the lockout. A manager PIN changes only the PINs that were set while it guarded the display, so nobody opens a player's account by setting a manager PIN first. A player who forgot such a PIN has their account removed and adds it again.
