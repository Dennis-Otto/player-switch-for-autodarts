# Privacy policy

Player Switch for Autodarts is a browser extension that lets several people share
one display and switch between their Autodarts accounts. This policy explains what
it handles. It is short because the extension collects almost nothing.

## What it stores, and where

Everything the extension keeps stays in the browser on your own computer, in the
extension's local storage (`chrome.storage.local`). It is never sent to the
developer or to any third party.

- **An Autodarts session token for each saved account**, so an account can play
  again without signing in. The extension renews these tokens with Autodarts.
- **A username and password, only for accounts where you turn on "Remember
  password."** It is stored so the extension can sign that account in again if its
  token stops working. It is off by default, and you can remove it at any time.
- **The settings of the button on the Autodarts page:** whether it shows, and in
  which corner.
- **The time of the last renewal**, and whether Autodarts turned every account
  away in it, so the extension can catch up after the computer was off and tell you
  when it may need an update.
- **Until when a new account is being added**, for ten minutes after "Add account"
  or the install, so that the next sign-in on Autodarts is saved by itself.
- **Only after going back to an older version of the extension: a copy of the
  saved accounts** that the newer version stored in a format the older one can't
  read, so that they can't get lost. It is deleted as soon as a version that reads
  them runs again, and when you remove the extension.

## Where data is sent

The extension talks to Autodarts (`api.autodarts.com` and
`play.autodarts.com`), over HTTPS, to sign in, renew a session and move the session
between accounts — the same requests the Autodarts website itself makes. The popup
and the switcher also show each player's picture from the address Autodarts gives
for it, as the Autodarts website does. The extension opens no other connection,
contacts no analytics or tracking service, and the developer receives no data from it.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/diagrams/data-flow.dark.svg">
  <img src="images/diagrams/data-flow.svg" alt="Where the data goes: Everything stays in the browser on this computer. The popup and the switcher ask the service worker, which keeps a token per account, a password only when one is remembered, the settings of the button, the time of the last renewal, whether Autodarts turned every account away in it, and until when a new account is being added in chrome.storage.local. It moves a session into the Autodarts page and reads the outgoing one out of it only through content.js, the one script that reads or writes the session in the page's localStorage. To renew a token, sign in with a password or end a session, it talks to api.autodarts.com over HTTPS, the same service the Autodarts page itself uses. The popup and the switcher show each player's picture from the address Autodarts gives for it. Nothing else goes anywhere: no server of the developer, no analytics; Help and Report a problem only open a page in a new tab.">
</picture>

"Help" and "Report a problem" in the popup and on the welcome page open the website
of the extension and its bug form on GitHub in a new tab. The bug form is filled in
with the version of the extension and the name and major version of the browser,
and with nothing else; GitHub receives it only when you submit the form yourself.

## What it does not do

- It does not collect analytics, usage statistics or telemetry.
- It does not read or store anything from sites other than Autodarts.
- It can't read the address or title of your other tabs, or your browsing history.
  It asks for no `tabs` permission, so the browser gives it the address of a tab only
  for the Autodarts sites, and it asks only for the tabs that have Autodarts open, so
  a switch can happen in the one in front and the others can reload.
- It does not share or sell any data.

## Your control

Removing an account in the extension deletes its stored token and any remembered
password. Removing the extension deletes everything it stored.

## Contact

Questions about privacy: open an issue at
<https://github.com/Dennis-Otto/player-switch-for-autodarts/issues> or write to the
address in [SECURITY.md](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/SECURITY.md).
