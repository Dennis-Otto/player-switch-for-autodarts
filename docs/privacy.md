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

## Where data is sent

The extension talks only to Autodarts (`api.autodarts.com` and
`play.autodarts.com`), over HTTPS, to sign in, renew a session and move the session
between accounts — the same requests the Autodarts website itself makes. It opens
no other connection, contacts no analytics or tracking service, and the developer
receives no data from it.

## What it does not do

- It does not collect analytics, usage statistics or telemetry.
- It does not read or store anything from sites other than Autodarts.
- It does not share or sell any data.

## Your control

Removing an account in the extension deletes its stored token and any remembered
password. Removing the extension deletes everything it stored.

## Contact

Questions about privacy: open an issue at
<https://github.com/Dennis-Otto/player-switch-for-autodarts/issues> or write to the
address in [SECURITY.md](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/SECURITY.md).
