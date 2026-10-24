---
hide:
  - navigation
  - toc
---

# Player Switch for Autodarts

![Player Switch logo](images/icon.png){ width="96" align="right" }

**One shared Autodarts display, everyone on their own account, one tap to switch.**

The display in the hallway, the club or the pub is shared, but everyone plays under their own Autodarts account. The extension keeps the sign-in of every saved account on that computer and swaps between them with a single tap: no password, no sign-in page, and the account that steps aside is ready again the moment someone taps it.

[:material-download: Install](https://github.com/Dennis-Otto/player-switch-for-autodarts#quick-start){ .md-button .md-button--primary } [:material-shield-check: Security design](security.md){ .md-button } [:material-file-document-outline: Privacy](privacy.md){ .md-button }

![The popup: a list of players with the one playing highlighted and a tile to add an account, and next to it the manage view of an account with the options to remember its password or remove it](images/popup.png)

## What it does

<div class="grid cards" markdown>

- :material-gesture-tap:{ .lg .middle } **One tap, no typing**

    ---

    Save each account once. A tap on a tile puts that account on the board.

- :material-account-switch:{ .lg .middle } **Nobody gets signed out**

    ---

    The account that steps aside keeps its session parked, so a tap brings it straight back.

- :material-autorenew:{ .lg .middle } **Ready days later**

    ---

    Autodarts rotates its session tokens; the extension renews every parked account in the background.

- :material-lock-outline:{ .lg .middle } **Private by design**

    ---

    Everything stays in the browser on that computer and goes only to Autodarts. No analytics, no server of ours.

</div>

## How it works

Autodarts Play keeps the signed-in session as a single value in the browser, a rotating refresh token. The extension keeps that value per account and swaps it when you switch:

- **Switching** parks the session of the account that was playing, writes the chosen account's session into the page and reloads.
- **The account that steps aside is not signed out at Autodarts.** Its session stays valid; switching away only takes it off the page.
- **Parked sessions are kept fresh**, because the token rotates: every 12 hours, and straight away after a start of the browser when the computer was off while a renewal was due. "Manage accounts" shows for each parked account when it was last renewed, such as "Renewed 3 hours ago".
- **You see who needs attention.** When an account has to sign in again, the toolbar icon shows how many, and its tooltip names them.
- **One change at a time.** A token works only once, so a second tap while a switch is on its way is ignored, and the renewal in the background waits for the switch. A double tap can't sign the previous player out.
- **The tab in front.** A switch happens on the Autodarts tab you're looking at, and every other Autodarts tab reloads with the new player, so none plays on as the one before. With no Autodarts tab open, a tap opens Autodarts and switches there.
- **Password fallback, optional.** If you let the extension remember an account's password, it signs that account back in by itself should its token ever stop working. Accounts that sign in with Google or Apple can't use this.

[Decision 0002](decisions/0002-swap-the-session-not-the-login.md) records why it works this way, and the [security design](security.md) what it stores and the risks that remain.

## Good to know

- The way the extension keeps a session is not an official Autodarts interface. A change on Autodarts' side can stop it until the extension is adjusted. When Autodarts turns every saved account away at once, the popup says so and links to the known problems and updates, so you look for an update of the extension rather than sign everyone in again.
- It is built for a display that the people of a household, club or venue share and trust: anyone at that display can switch to any saved account.
- It asks only for access to the Autodarts sites, its own storage and a timer for the renewal. It can't read the address or title of your other tabs, or your browsing history.

Not affiliated with Autodarts.
