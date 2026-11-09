# Join a lobby with a parked session, in the service worker

- Status: accepted
- Date: 2026-11-08

## Context

Player Switch puts one account on the board at a time. When two people play a match
at a household display, Autodarts records the statistics only for the account that is
signed in on the page; the other player counts as a guest. Autodarts' own lobby docs
([autodarts.diy, lobby settings](https://autodarts.diy/how-to-play/lobby-settings/))
give the workaround: the second player joins the lobby from their own phone, and their
seat then counts for their account.

The extension already holds a live session for every parked player and keeps it fresh.
The community knows the request that seats an account: the page `/join/<lobby>` of
Autodarts Play sends `POST https://api.autodarts.com/gs/v0/lobbies/<id>/players` with
the name, the account and the board, under the access token of that account. The
project tools-for-autodarts sends the same request; it has no license, so this project
takes the shape of the request from it, and no code. `api.autodarts.com` is already in
the host permissions and the `connect-src` of the content security policy, so a join
needs no new permission and shows no new warning at an update.

Dennis approved the feature on 2026-11-08. Nobody signs in to Autodarts for its
development, and no test reaches a real board.

## Options

1. **Leave it to the phones.** Nothing changes, and each player who wants their
   statistics takes out a phone, opens the lobby and signs in there.
2. **Join in the page.** The content script could send the request from the Autodarts
   page. It would need the access token of the parked player in the page, where every
   script of the page could read it, and the extension would have to trust the page
   about which lobby it shows.
3. **Join in the service worker, with the address of the tab.** The worker renews the
   parked session in its queue, keeps the rotated refresh token first, reads the lobby
   with the access token of that renewal for the board of the display, and takes the seat.
   It reads the id of the lobby itself, from the address of the Autodarts tab that the
   browser reports (`/lobbies/<uuid>`), never from a message of the page.

## Decision

Option 3. The token never leaves the service worker: the content script and the page
get none, as for every other request of the extension (decision 0002). The access token
goes only to `api.autodarts.com`, in the header that Autodarts asks for, and Autodarts
seats nobody but the owner of the token. The trust boundary stays where it was:

- **Which player.** Only a page of the extension, the popup or the switcher, may ask
  for a join (`trust.ts`), with the id of a saved account. In the venue mode, the worker
  asks for the PIN of that account first, as for a switch (decision 0008).
- **Which lobby.** The lobby that the display shows, from the address of its tab. A
  script of the page can change that address, but it can't learn a token, and it only
  picks the lobby on the screen in front of the players.
- **Which board.** The board of the display, read from the lobby: the seat of the
  account that plays on the page, or of a guest that this account added. That account
  may have joined the lobby of someone else online, whose host throws at a board of
  their own, so the board of the host would seat the player far away. Only while the
  account on the page has no seat in the lobby, such as a lobby that stays on screen
  after a switch, it is the board of the host, found the same way. A lobby without
  such a board seats nobody.
- **The page.** It stays as it is: the account that plays there plays on, and no token
  is written, so a join never ends a match. The account that plays on the page isn't
  seated this way, since its session belongs to the page, which the extension never
  renews behind its back.

A join that Autodarts refuses, because the lobby is gone, full or started, ends with
the kind `rejected` of `AuthError`, one that can't reach it with `unreachable`, and a
renewal that Autodarts refuses marks the account as needing a sign-in, as a switch does.
The daily check of the workflow Upstream sends a made-up token to the lobby and to its
seats and expects 401, so a change of the game service shows before a player notices it
(decision 0009). The fake Autodarts of the end-to-end tests has the same lobby.

## Consequences

- A second player at the display gets a seat under their own account with one tap,
  without a phone and without a sign-in. The buttons in the popup and the switcher are
  the next step; this decision covers the request beneath them.
- The extension relies on two more parts of Autodarts that aren't a public contract,
  the lobby and its seats. `scripts/upstream-contract.ts` checks both every morning.
- The privacy notes and every store listing say that the extension also joins a lobby
  for a saved player; no new data leaves the computer, only the account's own name and
  id, to the service that already keeps them.
- Dennis confirms once, with his own account, which request a join by the QR code of a
  local board makes: the board of the host, or none. Until then the community's shape
  of the request and the daily contract check are the evidence.
- **Note of 2026-11-09:** the buttons came with release 1.4.0: **Join the lobby** below
  the tile of a parked player, and the chip **In the lobby** once the extension seated
  them. The chip comes from a record of the seats that the extension took
  (`src/lobby.ts`, in `chrome.storage.session`), not from what Autodarts shows, since
  reading the lobby for every view would renew every parked session each time the
  popup opens. A host who takes the player out of the lobby leaves the chip as it is,
  so the seated tile also offers the quieter **Join again**. It sends the same join,
  which reads the lobby with the player's fresh access token first and asks for no
  second seat while Autodarts still lists them; the popup then says that the seat was
  kept. A tap costs one renewal of the parked session at most, and the trust boundary
  above stays as it is.
