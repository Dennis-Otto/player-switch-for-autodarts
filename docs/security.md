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
- **Only after going back to an older version: a copy of the saved accounts** that
  a newer version stored in a format this one can't read, under `accounts.backup`,
  with their tokens and remembered passwords. This version never saves over such
  accounts; the copy is a second safeguard. It is deleted as soon as a version that
  reads the accounts runs again, and with the extension.

Only the extension itself can read this storage: its service worker and its own
pages, the popup, the options page and the switcher. Chrome lets the content scripts
of an extension read `chrome.storage.local` as well unless the extension says
otherwise, so the service worker limits it to the extension's own contexts
(`TRUSTED_CONTEXTS`) at each of its starts. `content.js`, which runs inside the
Autodarts page, can't read a token or a password, not even if the process of the
page were taken over.

The extension signs in only through Autodarts' own auth service. It never reads a
token or a password from any other site, and the only code that touches the page's
stored session is `extension/content.js`.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/diagrams/data-flow.dark.svg">
  <img src="images/diagrams/data-flow.svg" alt="Where the data goes: Everything stays in the browser on this computer. The popup and the switcher ask the service worker, which keeps a token per account, a password only when one is remembered, the settings of the button, the time of the last renewal, whether Autodarts turned every account away in it, and until when a new account is being added in chrome.storage.local. It moves a session into the Autodarts page and reads the outgoing one out of it only through content.js, the one script that reads or writes the session in the page's localStorage. To renew a token, sign in with a password or end a session, it talks to api.autodarts.com over HTTPS, the same service the Autodarts page itself uses. The popup and the switcher show each player's picture from the address Autodarts gives for it. Nothing else goes anywhere: no server of the developer, no analytics; Help and Report a problem only open a page in a new tab.">
</picture>

## Trust boundaries

1. **The shared computer.** Anyone at the display can switch to any saved account;
   that is the point. A stored token or password is as safe as the computer and
   the browser profile it sits in.
2. **Extension → Autodarts.** Tokens and passwords go only to `api.autodarts.com`,
   over HTTPS. Nothing is sent anywhere else, and nothing is logged. The content
   security policy of the extension enforces it: its pages and its service worker
   run only the extension's own scripts and connect to `api.autodarts.com` alone, so
   the browser blocks a request to any other host.
3. **The Autodarts page ↔ the switcher in it.** The switcher that the page shows is
   `switcher.html`, a page of the extension in a frame: another origin than the
   page, so the scripts of the page can't read the accounts out of it, and it sits in
   a closed shadow root. Only that page is web-accessible, and only for
   `play.autodarts.com`. The content script in the page learns only the name and
   picture of the player on the button, never a token or a password, and can't read
   the storage. The service worker takes a request to see or change the accounts only
   from a page of this extension, by the id and the address of the sender, not from
   the content script, which may only ask what its button shows. The content script
   in turn takes requests only from this extension, and writes only a token into the
   session of the page.
4. **The manifest.** The extension asks for the permissions `storage`, `alarms` and
   `scripting` and for access to `play.autodarts.com` and `api.autodarts.com`, and for
   nothing else. [`store/permissions.json`](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/store/permissions.json)
   lists each with its reason, and `scripts/check-manifest.mjs` fails a change that
   asks for more. `play.autodarts.io` forwards every address to `play.autodarts.com`,
   so no page of it ever shows, and the extension asks for no access to it.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/diagrams/who-reaches-the-accounts.dark.svg">
  <img src="images/diagrams/who-reaches-the-accounts.svg" alt="Who reaches the saved accounts: The saved accounts, with their tokens and remembered passwords, sit in chrome.storage.local, which only the extension's own contexts can read, the service worker and its pages: the popup, the options page and the switcher in its frame. content.js runs inside the Autodarts page and can't read the storage. It may ask the service worker only what its button shows, takes requests only from this extension and writes into the page's session only a token. The service worker takes a request to see or change the accounts only from a page of this extension. Its content security policy lets it connect to api.autodarts.com alone, and the browser blocks any other host.">
</picture>

## Threats and countermeasures

| Threat | Countermeasure |
| --- | --- |
| A token is sent to the wrong place | Requests go only to `api.autodarts.com`; the host list in the manifest is limited to Autodarts, and the content security policy lets the browser block a request to any other host |
| A page whose process is taken over reads the saved tokens and passwords through the content script | At each of its starts, the service worker limits `chrome.storage.local` to the extension's own contexts, so the content script can't read it; it gets only the player on the button |
| The content script, or a page that took it over, sends a request that reads the accounts or switches players | The service worker takes such a request only from a page of this extension, by the id and the address of the sender; the content script takes requests only from this extension |
| A stale token is reused and locks an account out | The extension always keeps the token the server last returned (rotation) and renews parked tokens in the background; every change of the accounts runs one at a time in one queue of the service worker, so a double tap or the renewal never sends the same token twice |
| A password is stored when it wasn't wanted | A password is kept only after an explicit "Remember password"; it is off by default and can be forgotten again |
| A sign-in on the display is saved without being asked for | A new session is saved by itself only in the ten minutes after "Add account" or the install, only once, and only while no saved account plays; a window that ran out closes for good, and "Cancel" in the popup or the switcher closes it earlier. Every other session waits for "Save account" |
| The page's session is touched by surprise | Only `content.js` reads or writes it, only under the key `autodarts_refresh_token`, only on `play.autodarts.com`, and it writes only a token, never another value |
| A switch lands in a hidden tab, or another Autodarts tab plays on as the account before and spends its token | A switch goes to the Autodarts tab shown in the window used last, and every other Autodarts tab reloads once the session in the page has changed, so no tab keeps the account before in memory |
| A page that starts renews its session while the extension parks it | With no tab that answers, the extension opens or reloads one and waits until the page has renewed the session it started with, so it parks the fresh token of the player before and not a spent one |
| The extension sees more of the browser than it needs | It asks for no `tabs` permission: it finds the Autodarts tabs through its host access and asks only for them, and the browser gives it the address and title of no other tab |
| The scripts of the Autodarts page read the saved accounts out of the switcher | The switcher is a page of the extension in a frame of another origin, inside a closed shadow root; the content script gets only the player on the button from the service worker |
| A switch during a match ends it by surprise | On a match page, the service worker refuses a switch or a sign-out until the person confirms, before it spends a token |
| A change adds a permission or a host, and after the update Chrome disables the extension on a kiosk display until someone accepts the new warning | `scripts/check-manifest.mjs` fails `scripts/check.sh` unless `store/permissions.json` allows the permission with its reason and both store listings justify it. It also refuses `externally_connectable`, optional permissions, a content script in the world of the page and a content security policy that runs scripts from elsewhere |
| An older browser installs the extension and then fails as it runs | The manifest asks for Chrome 120 or newer (`minimum_chrome_version`), the first version with every feature that the code uses |

## Residual risks

- A stored token or password is only as protected as the computer and browser
  profile it lives in; this extension is for a trusted, shared machine, not a
  public one.
- The Autodarts page can tell that the extension is installed, from the button and
  from `switcher.html`, which it may load. A page that wanted to could also lay the
  switcher under a decoy and trick a tap on it; that would take a script of Autodarts
  itself, which already holds the session of the player in the page.
- Where a browser can't limit the storage to the extension's own contexts, the
  service worker writes that to its console in `chrome://extensions`, and
  `content.js` still reads nothing from the storage itself.
- Autodarts' sign-in is not a published interface. A change on their side can stop
  the extension working until it is adjusted, and could change how long a parked
  token stays valid.
