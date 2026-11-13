# Let a player's PIN hold by itself

- Status: accepted
- Date: 2026-11-13

## Context

[Decision 0008](0008-lock-a-venue-display-with-pins-that-the-worker-checks.md) gives
each player who wants one a PIN, which the service worker checks before anyone plays
under the account, and a manager PIN, which guards **Manage accounts** and the
settings. The two are independent options. Every request of the options page needed
the manager PIN, and nothing else: without a manager PIN, the worker changed or
cleared the PIN of any account without asking for the PIN that it had, and so did a
`protect` of the popup. On a display at home or in a club where players set PINs and
nobody set a manager PIN, a PIN was no lock for the other people at the display, and
the lockout after five wrong PINs never came into play, since no PIN was checked.
The pages promised more: "Nobody else plays under their account and spoils their
statistics."

A manager PIN alone doesn't close it. At a display without one, anyone may set a first
manager PIN, and that PIN would then change every PIN of the players.

## Options

1. **Ask for the PIN that the account has, while no manager PIN is set.** A player PIN
   holds at home, but whoever sets a first manager PIN then replaces it.
2. **Refuse a player PIN until a manager PIN exists.** The manager PIN becomes the root
   of every PIN. A home display needs a manager for any PIN, and the PINs of the
   players need an answer for when the manager PIN goes.
3. **A PIN changes only with itself, unless the manager PIN that guards the display now
   set it.** The service worker notes the accounts whose PIN was set while the manager
   PIN guarded the display; the manager PIN changes those alone, and any other PIN asks
   for itself first.
4. **A PIN changes only with itself, always.** Simple and with no state of its own, but
   the manager could no longer give a player who forgot their PIN a new one, and the
   manager could no longer take on a guest's account by clearing its PIN, which
   [decision 0018](0018-let-a-player-protect-and-remove-their-own-account.md) relies on.

## Decision

Option 3.

- The venue settings keep `managed`, the accounts whose PIN was set while a manager PIN
  was set, since that manager PIN was first set. `setPlayerPin` in `src/venue.ts` notes
  an account there when it gets a PIN while a manager PIN is set, and takes it off when
  it gets one without, or loses its PIN. A first manager PIN and taking the manager PIN
  away start the list anew, empty; a new manager PIN, which needs the one before, keeps
  it. Settings from before this decision, which have no list, count every PIN as the
  manager's while a manager PIN is set, as the manager PIN changed every PIN until now,
  and none while none is set.
- `currentPinFor` in `src/venue.ts` names the PIN that a change of an account's PIN
  asks for besides the manager PIN: the PIN that the account has, unless it is in
  `managed` while a manager PIN is set. A first PIN asks for none.
- The request `playerPin` of the options page carries that PIN as `currentPin`, and
  `protect` of the popup as `pin`. The worker checks it with the same `guard` and the
  same count of wrong PINs as a switch, after the manager PIN, and answers
  `pin: "player"` without it, so the page asks for it on the number pad and sends the
  request again.
- A player who forgot a PIN that the manager PIN didn't set has their account removed
  under **Manage accounts**, which takes the manager PIN while one is set, and adds it
  again. A removal signs the account out at Autodarts and opens it to nobody.

## Consequences

- A player PIN is a lock for the other people at the display, with or without a
  manager PIN, and the lockout after five wrong PINs counts the guesses at it.
- Nobody opens the account of a player by setting a first manager PIN, or by taking the
  manager PIN away and setting a new one.
- The manager still gives a player whose PIN the manager PIN set a new one, and takes on
  a guest's account by setting or clearing its PIN, as decision 0018 says.
- A PIN that a player set before the manager PIN existed stays theirs: the manager
  changes it only with the player's PIN, after which it is the manager's, or removes the
  account.
- Removing an account under **Manage accounts** stays possible without a manager PIN.
  It ends the session at Autodarts instead of opening the account to somebody else.
