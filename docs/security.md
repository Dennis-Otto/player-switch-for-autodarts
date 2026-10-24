# Security design

What Player Switch for Autodarts protects, what it trusts and which risks remain.
[SECURITY.md](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/SECURITY.md)
says how to report a vulnerability and how to verify a release.

## What it is

A browser extension that keeps the sign-in of several Autodarts accounts on one
computer, so a shared display can switch between them with a tap. It is meant for a
screen that the members of a household share and trust.

## What it keeps, and where

Everything is kept by the browser on the one computer, in `chrome.storage.local`,
and never leaves it except to Autodarts itself:

- **A session token per account** (the rotating Autodarts refresh token). The
  extension renews it so a parked account can play later, and sends it only to
  `api.autodarts.com`.
- **A password, only if you ask it to.** "Remember password" stores an account's
  username and password so the extension can sign that account in again when its
  token stops working. It is stored as plain text in `chrome.storage.local`, like
  the token, and is sent only to `api.autodarts.com/auth/v1/login`. Leave it off,
  and no password is ever stored.

The extension signs in only through Autodarts' own auth service. It never reads a
token or a password from any other site, and the only code that touches the page's
stored session is `extension/content.js`.

## Trust boundaries

1. **The shared computer.** Anyone at the display can switch to any saved account;
   that is the point. A stored token or password is as safe as the computer and
   the browser profile it sits in.
2. **Extension → Autodarts.** Tokens and passwords go only to `autodarts.com`,
   over HTTPS. Nothing is sent anywhere else, and nothing is logged.

## Threats and countermeasures

| Threat | Countermeasure |
| --- | --- |
| A token is sent to the wrong place | Requests go only to `api.autodarts.com`; the host list in the manifest is limited to Autodarts |
| A stale token is reused and locks an account out | The extension always keeps the token the server last returned (rotation) and renews parked tokens in the background; every change of the accounts runs one at a time in one queue of the service worker, so a double tap or the renewal never sends the same token twice |
| A password is stored when it wasn't wanted | A password is kept only after an explicit "Remember password"; it is off by default and can be forgotten again |
| The page's session is touched by surprise | Only `content.js` reads or writes it, only under the key `autodarts_refresh_token`, only on `play.autodarts.com` |

## Residual risks

- A stored token or password is only as protected as the computer and browser
  profile it lives in; this extension is for a trusted, shared machine, not a
  public one.
- Autodarts' sign-in is not a published interface. A change on their side can stop
  the extension working until it is adjusted, and could change how long a parked
  token stays valid.
