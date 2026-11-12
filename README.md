<div align="center">

<img src="https://raw.githubusercontent.com/Dennis-Otto/player-switch-for-autodarts/main/extension/icons/icon-128.png" alt="Player Switch logo" width="96" height="96">

# Player Switch for Autodarts

**One shared Autodarts display, everyone on their own account, one tap to switch.**

[![Documentation](https://img.shields.io/badge/docs-website-526CFE.svg?logo=materialformkdocs&logoColor=white)](https://dennis-otto.github.io/player-switch-for-autodarts/)
[![Latest release](https://img.shields.io/github/v/release/Dennis-Otto/player-switch-for-autodarts?label=release)](https://github.com/Dennis-Otto/player-switch-for-autodarts/releases)
[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/gbijblgchbbbkjeibpjaodflfgbgefam?label=chrome%20web%20store&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/player-switch-for-autodar/gbijblgchbbbkjeibpjaodflfgbgefam)
[![Chrome Web Store users](https://img.shields.io/chrome-web-store/users/gbijblgchbbbkjeibpjaodflfgbgefam?label=users&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/player-switch-for-autodar/gbijblgchbbbkjeibpjaodflfgbgefam)
[![CI](https://github.com/Dennis-Otto/player-switch-for-autodarts/actions/workflows/ci.yml/badge.svg)](https://github.com/Dennis-Otto/player-switch-for-autodarts/actions/workflows/ci.yml)
[![Coverage 100 %](https://img.shields.io/badge/coverage-100%25-brightgreen.svg)](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/CONTRIBUTING.md#tests)
[![CodeQL](https://github.com/Dennis-Otto/player-switch-for-autodarts/actions/workflows/codeql.yml/badge.svg)](https://github.com/Dennis-Otto/player-switch-for-autodarts/actions/workflows/codeql.yml)
[![Secret scan](https://github.com/Dennis-Otto/player-switch-for-autodarts/actions/workflows/secret-scan.yml/badge.svg)](https://github.com/Dennis-Otto/player-switch-for-autodarts/actions/workflows/secret-scan.yml)
[![SBOM](https://github.com/Dennis-Otto/player-switch-for-autodarts/actions/workflows/sbom.yml/badge.svg)](https://github.com/Dennis-Otto/player-switch-for-autodarts/actions/workflows/sbom.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Dennis-Otto/player-switch-for-autodarts/badge)](https://scorecard.dev/viewer/?uri=github.com/Dennis-Otto/player-switch-for-autodarts)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/15866/badge)](https://www.bestpractices.dev/projects/15866)
[![REUSE](https://api.reuse.software/badge/github.com/Dennis-Otto/player-switch-for-autodarts)](https://api.reuse.software/info/github.com/Dennis-Otto/player-switch-for-autodarts)
[![issues: triaged by issue assistant](https://img.shields.io/badge/issues-triaged%20by%20issue%20assistant-blue)](https://dennis-otto.github.io/issue-assistant/)
[![Sponsor](https://img.shields.io/badge/sponsor-%E2%99%A5-db61a2?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/Dennis-Otto)

[**Documentation**](https://dennis-otto.github.io/player-switch-for-autodarts/) · [**Deutsche Anleitung**](https://dennis-otto.github.io/player-switch-for-autodarts/de/) · [Quick start](#quick-start) · [Help](https://dennis-otto.github.io/player-switch-for-autodarts/help.html) · [Changelog](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/CHANGELOG.md) · [💛 Sponsor](https://github.com/sponsors/Dennis-Otto)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/switch.dark.gif">
  <img src="docs/images/switch.gif" alt="The popup of Player Switch: Mia Keller is playing; a tap on Jonas Berg shows “Switching to Jonas Berg…”, and then Jonas Berg is playing." width="396">
</picture>

**[Add to Chrome](https://chromewebstore.google.com/detail/player-switch-for-autodar/gbijblgchbbbkjeibpjaodflfgbgefam)**, free from the Chrome Web Store, and it updates by itself. Edge, Brave, Opera and Vivaldi install it from there too; [Firefox and the other ways](#install).

</div>

Every guide is on the [documentation website](https://dennis-otto.github.io/player-switch-for-autodarts/), in English and [German](https://dennis-otto.github.io/player-switch-for-autodarts/de/): the [help](https://dennis-otto.github.io/player-switch-for-autodarts/help.html), which explains every message of the extension, and the [guide for a shared display](https://dennis-otto.github.io/player-switch-for-autodarts/shared-display.html), with kiosk mode, the start with the computer and an on-screen keyboard.

<sub>💛 If Player Switch is useful to you, you can [support its development](https://github.com/sponsors/Dennis-Otto).</sub>

## Why

- **One tap, no typing.** The display in the hallway, the club or the pub is shared, but everyone plays under their own Autodarts account. A tap on a tile puts that account on the board.
- **Nobody gets signed out.** The account that steps aside keeps its session parked, so a tap brings it straight back. No password, no sign-in page.
- **Ready days later.** Autodarts rotates its session tokens; the extension renews every parked account in the background, so a saved account still works next week.
- **Made for the board display.** A round button on the Autodarts page and a keyboard shortcut open the players right over the page, also in fullscreen and in kiosk mode, where the toolbar of the browser is out of reach.
- **Ready for a club or pub.** An optional venue mode guards **Manage accounts** and the settings with a manager PIN, lets each player protect their account with a PIN of their own, and returns the display to a house account after a break, never during a match: [the venue mode](https://dennis-otto.github.io/player-switch-for-autodarts/shared-display.html#venue-mode).
- **For a keyboard, a screen reader and a finger.** The keys 1 to 9 pick a player, the focus keeps its place after every action, errors are read out at once, and every control is at least 44 by 44 pixels. A test checks the popup with axe-core for every change.
- **In five languages.** The popup, the players on the page, the welcome page and the settings speak English, German, Dutch, French and Spanish, in the language that Chrome runs in. The help and the website are in English and German.
- **Private by design.** Everything stays in the browser on that computer and goes only to Autodarts. No analytics, no server of ours, nothing sent anywhere else.
- **Removed means signed out.** **Remove account** ends the session of the account at Autodarts before it deletes it, so no copy of it keeps working, and **Forget all accounts** does so for every account and wipes the extension before a display changes hands: [the help](https://dennis-otto.github.io/player-switch-for-autodarts/help.html#forget-all).
- **No workaround needed.** No signing out and in for every player, no Chrome profile for each of them, no playing as a guest of someone else's account: [why not just …](https://dennis-otto.github.io/player-switch-for-autodarts/#why-not-just) says where each of them falls short.

## How it works

Autodarts Play keeps the signed-in session as a single value in the browser (a rotating refresh token in `localStorage`). The extension keeps that value per account and swaps it when you switch.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/diagrams/switch-flow.dark.svg">
  <img src="docs/images/diagrams/switch-flow.svg" alt="What a tap on a player does: Ada plays, and a tap on Bob switches. The extension renews Bob's session at Autodarts with his parked token or, when Autodarts refuses the token, with his remembered password. When that fails, the page stays as it is and no token is lost: Bob has to sign in again when Autodarts refused him, and a tap later tries again when Autodarts couldn't be reached. Otherwise the extension saves Bob's fresh token and renews the session in the page once, to learn whose it is; without an answer, the page stays as it is here too. It parks that session with the account it belongs to, still valid at Autodarts, usually Ada's, writes Bob's session into the page and reloads it, and every other Autodarts tab reloads as Bob.">
</picture>

- **Switching** parks the session in the page with the account it belongs to, usually the one that was playing, writes the chosen account's session into the page and reloads. Only Autodarts can say whose a session is, so the extension renews it once as it leaves the page: a session that someone signed in with right on the page never lands on the tile of another player.
- **The account that steps aside is not signed out at Autodarts.** Its session stays valid; "switching away" only takes it off the page.
- **Parked sessions are kept fresh.** Because the token rotates, the extension renews each parked account's token in the background, every 12 hours. Each time the browser starts, it checks that the renewal is still scheduled, and when the computer was off while a renewal was due, it renews straight away. "Manage accounts" shows for each parked account when it was last renewed, and since when renewing it fails while Autodarts can't be reached.
- **You see who needs attention.** When an account has to sign in again, the toolbar icon shows how many, and its tooltip names them, so nobody finds out only when they want to play. If Autodarts turns every saved account away at once, or refuses the renewal itself, the popup says that Autodarts may have changed how it signs in and links to the known problems and updates. A refused renewal keeps every saved session, so nobody has to sign in again once the update is there.
- **One change at a time.** A token works only once, so a second tap while a switch is on its way is ignored, and the renewal in the background waits for the switch. A double tap can't sign the previous player out.
- **The tab in front.** A switch happens on the Autodarts tab you're looking at, and every other Autodarts tab reloads with the new player, so none plays on as the one before. With no Autodarts tab open, a tap opens Autodarts and switches there.
- **Updates need no reload.** Chrome updates an extension silently, and a page that was open before gets no new script by itself. The extension brings its script into the open Autodarts tabs after each install and update, and again into a tab that doesn't answer when you tap, so a display that keeps Autodarts open for days switches straight after an update, and a running match goes on.
- **A match ends only on purpose.** A switch reloads the page, so on the page of a running match the extension asks first, before it spends a token: "A match is running. Switching ends it on this display."
- **Password fallback, optional.** If you let the extension remember an account's password, it signs that account back in by itself should its token ever stop working. Accounts that sign in with Google or Apple can't use this.

Over days and weeks, a saved account moves between these states:

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/diagrams/account-states.dark.svg">
  <img src="docs/images/diagrams/account-states.svg" alt="The life of a saved account: An account that signs in on the page is saved by itself after Add account or the install, or with Save account, and it plays. When another player comes on, or Add account signs the page out, its session is parked, still valid at Autodarts, and a tap brings it back. Every 12 hours the extension renews each parked session, with its token or a remembered password. When it signs out on the page and remembers its password, the next renewal or tap signs it in with that password. When Autodarts turns an account away, in a renewal or at a tap, or it signs out on the page without a remembered password, it has to sign in again, and the toolbar badge counts it: remember its password and tap it, or sign in once with Add account. Remove account signs an account out at Autodarts and then deletes it with its token and password, whatever its state.">
</picture>

[Decision 0002](docs/decisions/0002-swap-the-session-not-the-login.md) records why it works this way, and the [security design](docs/security.md) says what is stored and which risks remain.

## Quick start

### Install

**From the Chrome Web Store, recommended** — open [Player Switch in the Chrome Web Store](https://chromewebstore.google.com/detail/player-switch-for-autodar/gbijblgchbbbkjeibpjaodflfgbgefam) and choose **Add to Chrome**. Every update then arrives on its own, also on a display that runs for weeks. It needs Google Chrome 140 or newer, or a browser built on Chromium 140 or newer: Brave, Opera and Vivaldi install it from the same page, some after they ask you to allow extensions from other stores.

**In Microsoft Edge 140 or newer** — Edge runs the same package. Turn on **Allow extensions from other stores** under `edge://extensions`, then install it from [the same page of the Chrome Web Store](https://chromewebstore.google.com/detail/player-switch-for-autodar/gbijblgchbbbkjeibpjaodflfgbgefam), or load it unpacked as below. A listing in Edge Add-ons follows.

**In Firefox 140 or newer** — Firefox runs the same package too: every change is linted with `web-ext lint`, Mozilla's tool for add-ons, and tested in a real Firefox, where the tests install it and switch players. It isn't listed on addons.mozilla.org, so download and unzip the zip of a release as below, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on…** and pick the `manifest.json` in that folder; Firefox removes it again when it closes. There is nothing to allow: as it loads the add-on, Firefox grants its access to the two Autodarts sites, which the add-on's page in `about:addons` lists under **Permissions and data** as the switches **Access your data for `https://play.autodarts.com`** and **for `https://api.autodarts.com`**. Leave both on: with the first off, the Autodarts page shows no button and no sign-in is saved, and with the second off, a switch or **Add account** may say that Autodarts can't be reached ([help](https://dennis-otto.github.io/player-switch-for-autodarts/help.html#firefox-site-access)). The same page lists that the add-on sends authentication information: the sessions and remembered passwords go to the sign-in service of Autodarts, and nowhere else. Firefox can't keep the extension's storage from its script in the Autodarts page, so set up a display in a club or a pub with Chrome or Edge; the [security design](docs/security.md#firefox) explains why. Firefox for Android is not tested.

**From a release, without the store and without Node.js:**

1. Under **Assets** of the [latest release](https://github.com/Dennis-Otto/player-switch-for-autodarts/releases/latest), download `player-switch-for-autodarts-<version>.zip`.
2. Unzip it into a folder that stays, such as `Documents/Player Switch`: the browser reads the extension from there each time it starts.
3. Open `chrome://extensions`, or `edge://extensions` in Edge, turn on **Developer mode**, choose **Load unpacked** and pick that folder, the one with `manifest.json` in it.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/load-unpacked.dark.png">
  <img src="docs/images/load-unpacked.png" alt="The top of the page chrome://extensions: the switch Developer mode at the top right is on, and Load unpacked, the first of three buttons below the title Extensions, appears with it. Both are marked.">
</picture>

A copy loaded this way gets no update by itself, so a display does better with the store. For a new version, replace the contents of the folder with those of the new zip and choose the reload arrow of Player Switch on that page. Leave the folder where it is: the browser ties the saved accounts to its path, so a copy in another folder starts without them. The zip is the very file that goes to the Chrome Web Store, and [the release guide](docs/releases.md#the-package-of-a-release) says how to check that a release built it. To move a display to the store, first remove this copy under `chrome://extensions`, then add Player Switch from the store and save the players again: the store copy has an id of its own and doesn't see the accounts of this one, and two copies at once would both keep the same sign-ins fresh.

**From the source,** to change something:

```sh
npm ci
npm run build
```

Then load it in the same way, with the `extension/` folder of this repository. [Firefox and Edge](docs/development.md#firefox-and-edge) says what differs in the other browsers and how to check a release in them.

The extension asks only for access to `play.autodarts.com` and `api.autodarts.com`, its own storage, a timer for the renewal and the right to run its own script in the Autodarts tabs after an update, or in a tab where it stopped answering. It can't read the address or title of your other tabs, or your browsing history. Its content security policy lets it connect to `api.autodarts.com` alone, and the script that it runs in the Autodarts page can't read the saved accounts; the [security design](docs/security.md#trust-boundaries) has the details.

### Add the players

After the install, a welcome page opens with these four steps:

1. **Pin the icon.** Chrome puts a new extension behind the puzzle piece next to the address bar: click it, then the pin next to Player Switch for Autodarts. Edge and Firefox have the same puzzle piece: in Edge, click the eye instead of the pin, in Firefox the gear and then **Pin to Toolbar**.
2. **Sign in the first player** on [play.autodarts.com](https://play.autodarts.com). The account is saved by itself, and the icon shows ✓ for a moment.
3. **Add the next players:** in the popup, or in the players on the Autodarts page, choose **Add account** and sign in as the next person. That account is saved by itself too, without opening the popup again.
4. **Share the board.** Autodarts shows a board only to its owner and to the accounts that it is shared with, so the owner of the board shares it with every saved account: on Autodarts under **My Boards**, by the exact username, up to 10 other accounts. Otherwise a player sees no board after a switch, as [the help](https://dennis-otto.github.io/player-switch-for-autodarts/help.html#board-not-shared) explains.

From then on, a tap on a tile switches accounts, and **Manage accounts** shows the options of each account. The extension saves a new sign-in by itself only in the ten minutes after **Add account** or the install, and only once; **Cancel** in the popup or the switcher stops it earlier. A `+` on the icon says that someone is signed in who isn't saved, and **Save account** in the popup saves them.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/diagrams/adding-a-player.dark.svg">
  <img src="docs/images/diagrams/adding-a-player.svg" alt="How a new player is saved by itself: After the install, which signs nobody out, or a tap on Add account, which signs the page out, the extension waits ten minutes for a new account. The new player signs in on Autodarts. Each time an Autodarts page has finished loading, the extension looks for the session. Within the ten minutes, it saves the account once, the icon shows a check mark, and the player plays on. After the ten minutes, or once a player was saved, a sign-in is never saved by itself; the icon shows a plus, and Save account in the popup saves it.">
</picture>

The popup links to **Help**, the [help page](https://dennis-otto.github.io/player-switch-for-autodarts/help.html) of the website in the language of the browser, and to **Report a problem**, the bug form, filled in with the versions of the extension and the browser alone. Below the links, and at the bottom of the players on the Autodarts page, stands which version runs on this display, such as *Player Switch 1.6.0*: Chrome fetches an update only every few hours, and [the help](https://dennis-otto.github.io/player-switch-for-autodarts/help.html#which-version) says how to fetch it at once.

### Switch from the Autodarts page, also in fullscreen and kiosk mode

A board display often runs in fullscreen (F11) or as a kiosk (`chrome --kiosk`), where the toolbar and its popup are out of reach. So the Autodarts page itself carries a round button in a corner, with the picture of the player. A tap on it shows the players over the page, in large tiles for a touch screen, with everything the popup has: a tap on a tile switches, and **Manage accounts**, **Save account** and **Add account** are there too.

- **Keyboard:** <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd> opens and closes the players on the page, <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> opens the popup. In the players, the keys <kbd>1</kbd> to <kbd>9</kbd> pick a player and <kbd>Esc</kbd> closes them. **Change shortcuts** in the settings changes both: `chrome://extensions/shortcuts` in Chrome, `edge://extensions/shortcuts` in Edge, and in Firefox `about:addons`, the gear menu, **Manage Extension Shortcuts**.
- **Any screen:** the tiles fit a monitor upright or across, at any zoom of the page. A few players share the width of the panel, and a long name or a long text in your language wraps onto the next line; nothing is cut off.
- **Settings:** **Settings** in the popup, or **Details → Extension options** under `chrome://extensions` (`edge://extensions` in Edge, **Options** of Player Switch under `about:addons` in Firefox), turns the button off or moves it to another corner. The shortcut works with the button off as well.
- **Private:** the players open in a page of the extension, in a frame of its own, so the scripts of the Autodarts page can't read the saved accounts.

The [guide for a shared display](https://dennis-otto.github.io/player-switch-for-autodarts/shared-display.html) sets up kiosk mode, the start with the computer on Windows and on a Raspberry Pi, an on-screen keyboard for the sign-ins and the power settings that keep every account ready.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/switcher.dark.png">
  <img src="docs/images/switcher.png" alt="The switcher over a match on a board display: the players in large tiles with the keys 1 to 4, Mia Keller playing, with Manage accounts, Add account and a button that closes it.">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/diagrams/switch-from-the-page.dark.svg">
  <img src="docs/images/diagrams/switch-from-the-page.svg" alt="Switch players from the Autodarts page: In fullscreen or kiosk mode, a tap on the round button in a corner of the Autodarts page, or the keyboard shortcut, opens the switcher over the page. It is a page of the extension in a frame, so the page can't read the accounts. A tap on a player, or the keys 1 to 9, switches; on a match page the switcher asks first, before any token is spent, and the page reloads as the chosen player.">
</picture>

### Two players at one board, each with their own stats

Autodarts counts a match for each account that sits in its lobby, while the page plays under one account only. So the player on the page opens a lobby on Autodarts, at the board of the display, and the tile of every parked player, in the popup and in the players on the page, shows **Join the lobby**. A tap seats that player in the lobby with the session that the extension keeps for them, and the tile then says **In the lobby**. Nothing switches and nothing reloads: the page stays with the player who plays there, and the match counts for every player's own account, without a phone or a new sign-in.

- **Only on a lobby:** the tiles offer it only while the Autodarts tab shows a lobby; on any other page, a running match among them, they don't, so a match is never touched.
- **Join again:** the extension doesn't watch the lobby, so a tile goes on saying **In the lobby** after the host took that player out. **Join again** below it seats them once more, and changes nothing for a player who still sits there ([help](docs/help.md#join-lobby)).
- **Private:** the extension takes the lobby from the address of the tab, never from a message of the page, and the session of a parked player never reaches the page ([decision 0016](docs/decisions/0016-join-a-lobby-with-a-parked-session.md)).
- **Venue mode:** a player with a PIN types it first, as for a switch.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/lobby.dark.png">
  <img src="docs/images/lobby.png" alt="The popup on a lobby of Autodarts: Mia Keller is playing; Jonas Berg says In the lobby after a tap on Join the lobby, with Join again below his tile, and the popup says “Jonas Berg is in the lobby now, and the match counts for their own account.”; Lena Vogt still offers Join the lobby." width="396">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/diagrams/join-a-lobby.dark.svg">
  <img src="docs/images/diagrams/join-a-lobby.svg" alt="Join the lobby with a parked player: Ada plays on the page and opens a lobby on Autodarts at the board of the display. On that page, the tile of each parked player in the popup and in the switcher offers Join the lobby. A tap on Bob's, or later on Join again below his tile, renews his parked session and keeps the rotated token first. When his session is dead or Autodarts can't be reached, his tile says why and nothing else changes. Otherwise the extension reads the lobby with his own access token, which never reaches the page. When Bob sits there already, the popup says so and Autodarts gets no second seat. Otherwise the extension seats Bob at the board of the display. When Autodarts refuses the seat because the lobby is full, closed or started, the popup says so. Otherwise his tile says In the lobby, with Join again below it for when the host takes him out, the page stays with Ada without a switch or a reload, and the match counts for both accounts.">
</picture>

### Remember a password (optional)

Under **Manage accounts**, choose **Remember password** for an account, and the extension signs it back in on its own if its session ever stops working. It signs in at Autodarts once as it saves the password, so a typo, or the sign-in of another player, shows at once and nothing is remembered. The password stays on that computer, encrypted like every saved session, and is sent only to Autodarts; [SECURITY.md](SECURITY.md) and the [privacy policy](docs/privacy.md) say exactly what is stored.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/manage.dark.png">
  <img src="docs/images/manage.png" alt="Manage accounts in the popup: each account with Remember password or Forget password and Remove account, and for each parked account when it was last renewed, such as “Renewed 2 hours ago”." width="396">
</picture>

## Good to know

- The way the extension keeps a session is not an official Autodarts interface. A change on Autodarts' side can stop it until the extension is adjusted, and how long a parked token stays valid is up to Autodarts. When Autodarts turns every saved account away in one renewal, or refuses the renewal itself, the popup tells you to look for an update of the extension rather than sign everyone in again.
- It is built for a display that the people of a household, club or venue share and trust: anyone at that display can switch to any saved account, which is the point. Where not everyone knows everyone, the [venue mode](https://dennis-otto.github.io/player-switch-for-autodarts/shared-display.html#venue-mode) adds PINs and a return to a house account after a break. A PIN is a lock for the people at the display, not a protection against someone who can use the computer; the extension keeps only a salted hash of it.
- The saved accounts carry the version of their format. Going back to an older version of the extension never wipes accounts that a newer one saved: the older one leaves them untouched, keeps a copy, and the popup asks you to update.
- Something doesn't work? The [help](https://dennis-otto.github.io/player-switch-for-autodarts/help.html) explains every message of the extension and what to do about it.

## Development

Contributions are welcome. Every line of the extension is TypeScript in `src/`, the service worker, the content script and the pages alike, built into `extension/lib/` and checked by the compiler in its strict mode. [CONTRIBUTING.md](CONTRIBUTING.md) has the rules and the checks, [docs/development.md](docs/development.md) explains how the code is laid out, how to run the extension from the source and what the tests check, among them property-based tests that run the account logic on generated inputs and end-to-end tests that run the built extension in a real Chromium against a fake Autodarts, and checks that warn before a change of Autodarts or the next version of Chrome breaks the extension, [docs/releases.md](docs/releases.md) how a release reaches the Chrome Web Store, and [docs/roadmap.md](docs/roadmap.md) what is planned for the next twelve months and what isn't. A translation into another language is welcome: [Add a language](docs/development.md#add-a-language) says what it takes.

## Support and security

Questions and problems: see [SUPPORT.md](SUPPORT.md). Report vulnerabilities privately, as [SECURITY.md](SECURITY.md) describes.

## License

MIT; see [LICENSE](LICENSE). Every file names its license in the machine-readable form of [REUSE](https://reuse.software). Not affiliated with Autodarts.
