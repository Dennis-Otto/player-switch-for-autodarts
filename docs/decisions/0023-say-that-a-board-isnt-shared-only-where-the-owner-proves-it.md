# Say that a board isn't shared only where the answer of its owner proves it

- Status: accepted
- Date: 2026-11-14

## Context

Autodarts shows a board only to its owner and to the accounts that the owner shares it
with, up to 10. A player whom the board of the display isn't shared with sees no board
after a switch, although the switch worked, and that is the most common surprise on a
new display. Since 1.7.0 the message after each saved account reminds the owner to
share the board, but for every account, the owner and the accounts that see the board
already included: nothing says for which account the sharing is still missing
(#235 and #278).

The page **My Boards** of Autodarts Play asks `GET https://api.autodarts.com/bs/v0/boards`
with the access token of the account, the same JWT that the extension holds for each
saved account. For the owner of a board, its answer lists `permissions`: one entry with
`isOwner: true` and one for each account that the board is shared with, each by the id
that is the `sub` of that account's token, which the extension already knows each saved
account by. What an account that owns no board gets is not known: nobody signed in
with such an account to look. The address is no official interface, as the others that
the extension uses ([decision 0009](0009-watch-autodarts-and-the-next-chrome-before-the-players-do.md)).

## Options

1. **Keep the reminder for every account.** Nothing new is asked or kept, but the
   display never says which player is missing, and the owner has to compare the list of
   **My Boards** with the tiles by hand.
2. **A chip on every account that no answer names,** also where no saved account owns a
   board. Simple, but it rests on a guess: while the owner isn't saved, every tile would
   say that no board is shared, the shared ones too, and a hint that is wrong half of the
   time teaches the players to ignore it.
3. **A chip only where the answer of a saved owner proves it:** read the boards with the
   access token that each renewal brings anyway, keep only ids, and show **No board
   shared** on a saved account only when a saved account owns a board, no board that a
   saved account owns names the account, and the account's own answer names no board.
   Where nothing is proven, no chip.

## Decision

Option 3. It rests only on what was seen at Autodarts: the answer for an owner names
every account that a board is shared with. Every way of not knowing, no saved owner, a
request that fails, a time limit of five seconds that passes, an answer of another
shape, a board with no owner or two, leaves the boards of that account unknown, and an
unknown account gets no chip and stops none: a missing chip proves nothing, a chip that
shows is always right. The request goes with an access token that a renewal, a switch,
a save or a join made anyway, so no session is renewed for it, and it runs after the
operation has let go of the accounts, so no other operation waits for it. No new
permission is needed: the manifest allows `https://api.autodarts.com/*` already.

The extension keeps of the answer only the id of each board, the id of its owner and
the ids of the accounts that it is shared with, never the name of a board, its address
or the name of another account, and it goes with the account and with **Forget all
accounts**. The workflow Upstream checks every morning that the address still refuses
a made-up token with 401, as it does for the game service.

## Consequences

- A tile says **No board shared**, a link to the help, for the player who sees no board
  after a switch, once the owner of the board is saved on the display too. It goes away
  with the next answer that names the account.
- The privacy policy, the page about the data of the extension, the store listing of
  every language and `store/permissions.json` name the board service.
- The recorded answers of the end-to-end tests have one of this shape, with made-up
  values, so the fake Autodarts and the parser can't drift apart from it.
- When the address proves unstable, the chip goes again, and with it the request and
  what it keeps; nothing else depends on it.
