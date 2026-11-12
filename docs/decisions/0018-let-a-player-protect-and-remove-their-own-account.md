# Let a player protect and remove their own account without the manager

- Status: accepted
- Date: 2026-11-12

## Context

[Decision 0008](0008-lock-a-venue-display-with-pins-that-the-worker-checks.md) locks a
club or pub display with a manager PIN, which guards every change under **Manage
accounts**, and a PIN for each player who wants one, which the manager sets on the
options page. **Add account** stays open to everybody, so that a member or a guest
can play under their own account while the manager is not there.

Everything that protects or removes the account that was just added needed the
manager, though. A player who added their account and left kept a working session on
a public display, without a PIN, for anyone to play under. The return after a break
parks that session on purpose, so a tap brings it back. Their only ways out were to
find the manager or to change their password at Autodarts. Decision 0008 said nothing
about who sets a player PIN or who removes an account.

## Options

1. **Leave it to the manager.** Simple, and the manager keeps every change, but it
   keeps the gap that this record is about: a public display holds a session that its
   owner can't protect or end.
2. **Open "Manage accounts" to everybody for their own account.** The person would
   pick their account in the list, and the worker would check its PIN. The list holds
   every account, though, and an account without a PIN has nothing to check: anyone
   could remove the account of a regular who left it unprotected.
3. **Two exceptions in the service worker, tied to what proves the account.** A first
   PIN goes, without the manager PIN, only to the account that plays on the page,
   whose player is the one at the display, and only while it has none, so nobody
   replaces the PIN of another. A removal goes without the manager PIN only with the
   PIN of the account, which the worker checks as at a switch and counts towards the
   wrong PINs. The popup and the switcher offer each one below the tile of the player
   who plays.

## Decision

Option 3, while a manager PIN is set; without one, every account may change anyway.

- The new request `protect` gives an account a PIN. The worker allows it without the
  manager PIN only for the account that plays (`activeId`), while it has no PIN and is
  not the house account, which belongs to the manager; any other `protect` needs the
  manager PIN, as a change of "Manage accounts" does. `protectsItself` in
  `src/venue.ts` holds the rule, and the view of the popup names the one account that
  it allows.
- `removeAccount` without a manager PIN checks the PIN of the account instead, when it
  has one (`ownRemovalPin`): the worker answers `pin: "player"`, the popup asks for that
  PIN and sends the request again. A request that carries the manager PIN is the
  manager's and is checked against the manager PIN alone. The removal signs the account
  out at Autodarts as before.
- Below the tile of the player who plays, the popup and the switcher show **Protect
  with a PIN**, which asks for the new PIN twice, or, once the account has a PIN,
  **Remove my account**, which asks for a yes and that PIN. They show nothing else
  outside **Manage accounts**, so the tiles of the other players stay as they are.

## Consequences

- A guest who adds their account can protect it and remove it before they leave,
  without the manager.
- Whoever plays under an account without a PIN can give it one, such as the account of
  a regular who left it unprotected; that is no more than playing under it already
  allows, and the manager takes that PIN away under **PINs of the players**. The house
  account is spared, since the display returns to it after every break.
- A player whose account is parked switches to it first, with their PIN, to remove it.
  An option that removes accounts that didn't play for some days, beside the return
  after a break, would end forgotten sessions without anyone at the display; it is
  left for later.
