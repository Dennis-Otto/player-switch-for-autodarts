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
  token stops working. It is stored sealed, like the token (see below), and is
  sent only to `api.autodarts.com/auth/v1/login`. Leave it off, and no password is
  ever stored.
- **The settings of the button in the page:** whether it shows, and in which corner.
- **The settings of the venue mode, once a person turns it on:** a salted PBKDF2
  hash of the manager PIN and of each player's PIN, never a PIN itself, the length
  of the break and the house account (see [the venue mode](#venue-mode)). In
  `chrome.storage.session`, which the browser empties as it closes: the count of
  wrong PINs in a row, and the time of the last input on the Autodarts page, which
  says only that there was one.
- **When the renewal last ran,** and whether Autodarts turned every parked account
  away in it, so that the extension catches up on a renewal it missed while the
  computer was off and can suggest an update of itself. This holds no token and no
  name.
- **Only after going back to an older version: a copy of the saved accounts** that
  a newer version stored in a format this one can't read, under `accounts.backup`,
  with their tokens and remembered passwords, sealed as that version sealed them.
  This version never saves over such accounts; the copy is a second safeguard. It
  is deleted as soon as a version that reads the accounts runs again, and with the
  extension.
- **The key that seals the tokens and passwords,** in the IndexedDB of the
  extension (see below).

### Sealed tokens and passwords

`chrome.storage.local` holds no token and no password in plain text. The service
worker seals each one with AES-GCM under a key of 256 bits (`src/vault.ts`), and
stores only the random nonce and the encrypted text, `{ iv, data }`. The names,
the pictures and which account plays stay readable, because the button in the page
shows them.

- **The key never leaves the browser.** The service worker makes it once, with
  WebCrypto, as a key that can't be exported, and keeps it in the IndexedDB of the
  extension's own origin. The browser uses the key for the extension, but no script
  ever sees its bytes, not even the extension's own. Neither a content script nor a
  page of another origin can open that database. The permission `unlimitedStorage`
  keeps Chrome from evicting it when the disk runs low, as it may do with the web
  storage of an extension without it.
- **Each secret is bound to its place.** The id of the account and the field, such
  as `token/<id>`, are the additional data of AES-GCM. A sealed token copied to
  another account, or changed by a single bit, no longer opens.
- **Losing the key costs a sign-in, nothing more.** Without the key, for example
  after the data of the extension was cleared, a sealed token or password no longer
  opens. The accounts then need to sign in again and their passwords are forgotten,
  and nothing fails. A key store that can't be read for a moment fails the request
  instead, so that a passing fault never costs a session.
- **An update seals what was plain.** The versions before stored the tokens and
  passwords in plain text. An update to this version seals them, and so does the
  first reading of the accounts after it. A version that doesn't know the sealed
  format never saves over it (see the copy above).

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
4. **The manifest.** The extension asks for the permissions `storage`, `alarms`,
   `scripting` and `unlimitedStorage` and for access to `play.autodarts.com` and `api.autodarts.com`, and for
   nothing else. [`store/permissions.json`](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/store/permissions.json)
   lists each with its reason, and `scripts/check-manifest.mjs` fails a change that
   asks for more. `play.autodarts.io` forwards every address to `play.autodarts.com`,
   so no page of it ever shows, and the extension asks for no access to it.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/diagrams/who-reaches-the-accounts.dark.svg">
  <img src="images/diagrams/who-reaches-the-accounts.svg" alt="Who reaches the saved accounts: The saved accounts sit in chrome.storage.local, which only the extension's own contexts can read, the service worker and its pages: the popup, the options page and the switcher in its frame. Their tokens and remembered passwords are sealed there with AES-GCM; the key can't be exported and sits in the IndexedDB of the extension, which only the service worker uses. content.js runs inside the Autodarts page and can't read the storage. It may ask the service worker only what its button shows, takes requests only from this extension and writes into the page's session only a token. The service worker takes a request to see or change the accounts only from a page of this extension. Its content security policy lets it connect to api.autodarts.com alone, and the browser blocks any other host.">
</picture>

## The venue mode {#venue-mode}

The venue mode, which is off until a person turns it on under **Settings**, locks a
club or pub display against the people in front of it: a guest who plays under a
regular's account and spoils their statistics, someone who removes accounts or
remembers a password, and the account of a player who left, which would count the
next games. It is a lock for the people at the display, not a protection against
someone who can use the computer.

- **No PIN is kept.** Each PIN, 4 to 8 digits, is kept as a hash of PBKDF2 with
  SHA-256, 600,000 rounds as OWASP recommends, and a random salt of 16 bytes of its
  own, made with WebCrypto. A check compares the hashes in a time that doesn't tell
  how many bytes agree.
- **The service worker checks every PIN,** for every switch to an account with a PIN
  and every change under **Manage accounts** or on the options page, so neither the
  popup nor the switcher on the Autodarts page can go around it. The content script
  can neither read the hashes nor send these requests.
- **Five wrong PINs in a row lock every PIN for a minute.** The count is kept in
  `chrome.storage.session`, so it outlives a sleep of the service worker; a restart
  of the browser clears it.
- **The manager PIN lives as long as the view that asked for it:** the popup and the
  switcher forget it as **Manage accounts** closes, the options page as it closes.
- **The return after a break** needs to know when someone last used the Autodarts
  page. The content script tells the service worker only that an input happened,
  never where or what, at most every 15 seconds, and only while the return is on.
  A match that runs in any Autodarts tab counts as input, so the return never ends
  one, and the player before keeps their session parked.
- **What it doesn't stop:** whoever can use the computer can remove the extension in
  `chrome://extensions`, turn the venue mode off in the console of its service
  worker (the [guide](shared-display.md#forgotten-manager-pin) shows how, for a
  forgotten manager PIN), or copy the profile of the browser and try all 10,000
  PINs of 4 digits against a hash in a short time. Longer PINs take longer, not
  forever.

## Threats and countermeasures

| Threat | Countermeasure |
| --- | --- |
| A token is sent to the wrong place | Requests go only to `api.autodarts.com`; the host list in the manifest is limited to Autodarts, and the content security policy lets the browser block a request to any other host |
| A page whose process is taken over reads the saved tokens and passwords through the content script | At each of its starts, the service worker limits `chrome.storage.local` to the extension's own contexts, so the content script can't read it; it gets only the player on the button |
| The content script, or a page that took it over, sends a request that reads the accounts or switches players | The service worker takes such a request only from a page of this extension, by the id and the address of the sender; the content script takes requests only from this extension |
| A tool, a dump or a copy of `chrome.storage.local` (not of the whole profile) finds the tokens and passwords; a copy of the whole profile takes the key with it, see the risk that remains | Each token and password is sealed with AES-GCM under a key that can't be exported and sits in the extension's IndexedDB, not in `chrome.storage.local`; the storage holds only the sealed text |
| Someone who can write the storage moves a sealed token to another account, or changes it | Each secret is sealed with its account and field as additional data, so a moved or changed value doesn't open, and the account has to sign in again |
| The key is gone, for example after the data of the extension was cleared (the permission `unlimitedStorage` keeps Chrome from evicting it on its own) | The accounts that can't be opened need to sign in again, and their passwords are forgotten; nothing fails, and nothing is saved in plain text instead |
| A stale token is reused and locks an account out | The extension always keeps the token the server last returned (rotation) and renews parked tokens in the background; every change of the accounts runs one at a time in one queue of the service worker, so a double tap or the renewal never sends the same token twice |
| A password is stored when it wasn't wanted | A password is kept only after an explicit "Remember password"; it is off by default and can be forgotten again |
| A sign-in on the display is saved without being asked for | A new session is saved by itself only in the ten minutes after "Add account" or the install, only once, and only while no saved account plays; a window that ran out closes for good, and "Cancel" in the popup or the switcher closes it earlier. Every other session waits for "Save account" |
| The page's session is touched by surprise | Only `content.js` reads or writes it, only under the key `autodarts_refresh_token`, only on `play.autodarts.com`, and it writes only a token, never another value |
| Other code than `content.js` runs in the Autodarts page, as when the extension runs its script again after an update or in a tab that stopped answering | `chrome.scripting` runs only the packaged file `content.js`, by its name, never code made at run time, and only in the main frame of a tab that the service worker picks by its `play.autodarts.com` address just before; `content.js` itself does nothing on any other site, should the tab have moved on in between. A copy that an update cut off reaches neither the extension nor the storage, and the new copy runs once per page, so a tab that gets it twice answers once |
| After a silent update of the extension, the page no longer answers, and a display shows "Open Autodarts" until someone reloads it | Each install and update runs the new `content.js` in the open Autodarts tabs, and a tab whose script doesn't answer a request gets it once more, before the extension reloads that tab as the last resort |
| A switch lands in a hidden tab, or another Autodarts tab plays on as the account before and spends its token | A switch goes to the Autodarts tab shown in the window used last, and every other Autodarts tab reloads once the session in the page has changed, so no tab keeps the account before in memory |
| A page that starts renews its session while the extension parks it | With no tab that answers, the extension opens or reloads one and waits until the page has renewed the session it started with, so it parks the fresh token of the player before and not a spent one |
| The extension sees more of the browser than it needs | It asks for no `tabs` permission: it finds the Autodarts tabs through its host access and asks only for them, and the browser gives it the address and title of no other tab |
| The scripts of the Autodarts page read the saved accounts out of the switcher | The switcher is a page of the extension in a frame of another origin, inside a closed shadow root; the content script gets only the player on the button from the service worker |
| A switch during a match ends it by surprise | On a match page, the service worker refuses a switch or a sign-out until the person confirms, before it spends a token |
| A change adds a permission or a host, and after the update Chrome disables the extension on a kiosk display until someone accepts the new warning | `scripts/check-manifest.mjs` fails `scripts/check.sh` unless `store/permissions.json` allows the permission with its reason and both store listings justify it. It also refuses `externally_connectable`, optional permissions, a content script in the world of the page and a content security policy that runs scripts from elsewhere |
| Someone at a club or pub display plays under another player's account | In the venue mode, an account can ask for a PIN, which the service worker checks before it spends a token of that account |
| Someone at the display removes accounts or remembers a password | In the venue mode, the service worker takes no change under **Manage accounts** and no change of the venue mode without the manager PIN |
| Someone at the display guesses a PIN by hand | Five wrong PINs in a row lock every PIN for a minute, counted in the service worker, not in the popup |
| A PIN is read out of the storage | The storage holds a salted PBKDF2 hash of 600,000 rounds, never the PIN, and only the service worker and the pages of the extension can read it |
| A player leaves, and the next games count for their account | The venue mode returns the display to a house account, or signs it out, after a break without input, parking the session of the player; a match that runs counts as input and is never interrupted |
| An older browser installs the extension and then fails as it runs | The manifest asks for Chrome 140 or newer (`minimum_chrome_version`), the first version in which `chrome.storage.local.setAccessLevel` keeps the accounts from the content script; `scripts/check-manifest.mjs` fails on a lower one |

## Residual risks

- A stored token or password is only as protected as the computer and browser
  profile it lives in; this extension is for a trusted, shared machine, not a
  public one. Sealing it is defense in depth, not a password manager: someone who
  can read the profile of the browser on the disk, with the same account of the
  operating system, can read the key in the IndexedDB of the extension as well,
  and code that runs inside the extension itself could ask the key to open a token.
  The key stops the tools, backups and copies of the profile that read only the
  storage of the extension, and a content script or a page of another origin.
- A PIN of the venue mode is a lock for the people at the display. Someone who can
  use the computer can remove the extension or turn the venue mode off, and a copy
  of the profile of the browser lets a program try every PIN of 4 digits against its
  hash in a short time.
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
