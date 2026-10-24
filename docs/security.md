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
- **The settings of the button in the page:** whether it shows, and in which corner.
- **When the renewal last ran,** and whether Autodarts turned every parked account
  away in it, so that the extension catches up on a renewal it missed while the
  computer was off and can suggest an update of itself. This holds no token and no
  name.

The extension signs in only through Autodarts' own auth service. It never reads a
token or a password from any other site, and the only code that touches the page's
stored session is `extension/content.js`.

## Trust boundaries

1. **The shared computer.** Anyone at the display can switch to any saved account;
   that is the point. A stored token or password is as safe as the computer and
   the browser profile it sits in.
2. **Extension → Autodarts.** Tokens and passwords go only to `autodarts.com`,
   over HTTPS. Nothing is sent anywhere else, and nothing is logged.
3. **The Autodarts page ↔ the switcher in it.** The switcher that the page shows is
   `switcher.html`, a page of the extension in a frame: another origin than the
   page, so the scripts of the page can't read the accounts out of it, and it sits in
   a closed shadow root. Only that page is web-accessible, and only for
   `play.autodarts.com` and `play.autodarts.io`. The content script in the page learns
   only the name and picture of the player on the button, never a token or a password,
   and the service worker takes a request to see or change the accounts only from a
   page of the extension, not from the content script.

## Threats and countermeasures

| Threat | Countermeasure |
| --- | --- |
| A token is sent to the wrong place | Requests go only to `api.autodarts.com`; the host list in the manifest is limited to Autodarts |
| A stale token is reused and locks an account out | The extension always keeps the token the server last returned (rotation) and renews parked tokens in the background; every change of the accounts runs one at a time in one queue of the service worker, so a double tap or the renewal never sends the same token twice |
| A password is stored when it wasn't wanted | A password is kept only after an explicit "Remember password"; it is off by default and can be forgotten again |
| The page's session is touched by surprise | Only `content.js` reads or writes it, only under the key `autodarts_refresh_token`, only on `play.autodarts.com` |
| The scripts of the Autodarts page read the saved accounts out of the switcher | The switcher is a page of the extension in a frame of another origin, inside a closed shadow root; the content script gets only the player on the button from the service worker |
| A switch during a match ends it by surprise | On a match page, the service worker refuses a switch or a sign-out until the person confirms, before it spends a token |

## Residual risks

- A stored token or password is only as protected as the computer and browser
  profile it lives in; this extension is for a trusted, shared machine, not a
  public one.
- The Autodarts page can tell that the extension is installed, from the button and
  from `switcher.html`, which it may load. A page that wanted to could also lay the
  switcher under a decoy and trick a tap on it; that would take a script of Autodarts
  itself, which already holds the session of the player in the page.
- Autodarts' sign-in is not a published interface. A change on their side can stop
  the extension working until it is adjusted, and could change how long a parked
  token stays valid.
