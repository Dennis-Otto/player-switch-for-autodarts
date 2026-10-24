<div align="center">

<img src="https://raw.githubusercontent.com/Dennis-Otto/player-switch-for-autodarts/main/extension/icons/icon-128.png" alt="Player Switch logo" width="96" height="96">

# Player Switch for Autodarts

**One shared Autodarts display, everyone on their own account, one tap to switch.**

[![Documentation](https://img.shields.io/badge/docs-website-526CFE.svg?logo=materialformkdocs&logoColor=white)](https://dennis-otto.github.io/player-switch-for-autodarts/)
[![Latest release](https://img.shields.io/github/v/release/Dennis-Otto/player-switch-for-autodarts?label=release)](https://github.com/Dennis-Otto/player-switch-for-autodarts/releases)
[![CI](https://github.com/Dennis-Otto/player-switch-for-autodarts/actions/workflows/ci.yml/badge.svg)](https://github.com/Dennis-Otto/player-switch-for-autodarts/actions/workflows/ci.yml)
[![Coverage 100 %](https://img.shields.io/badge/coverage-100%25-brightgreen.svg)](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/CONTRIBUTING.md#tests)
[![CodeQL](https://github.com/Dennis-Otto/player-switch-for-autodarts/actions/workflows/codeql.yml/badge.svg)](https://github.com/Dennis-Otto/player-switch-for-autodarts/actions/workflows/codeql.yml)
[![Secret scan](https://github.com/Dennis-Otto/player-switch-for-autodarts/actions/workflows/secret-scan.yml/badge.svg)](https://github.com/Dennis-Otto/player-switch-for-autodarts/actions/workflows/secret-scan.yml)
[![SBOM](https://github.com/Dennis-Otto/player-switch-for-autodarts/actions/workflows/sbom.yml/badge.svg)](https://github.com/Dennis-Otto/player-switch-for-autodarts/actions/workflows/sbom.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Dennis-Otto/player-switch-for-autodarts/badge)](https://scorecard.dev/viewer/?uri=github.com/Dennis-Otto/player-switch-for-autodarts)
[![REUSE](https://api.reuse.software/badge/github.com/Dennis-Otto/player-switch-for-autodarts)](https://api.reuse.software/info/github.com/Dennis-Otto/player-switch-for-autodarts)
[![Sponsor](https://img.shields.io/badge/sponsor-%E2%99%A5-db61a2?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/Dennis-Otto)

[**Documentation**](https://dennis-otto.github.io/player-switch-for-autodarts/) · [**Deutsche Anleitung**](https://dennis-otto.github.io/player-switch-for-autodarts/de/) · [Quick start](#quick-start) · [Changelog](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/CHANGELOG.md) · [💛 Sponsor](https://github.com/sponsors/Dennis-Otto)

<img src="https://raw.githubusercontent.com/Dennis-Otto/player-switch-for-autodarts/main/docs/images/popup.png" alt="The popup: a list of players with the one playing highlighted and a tile to add an account, and next to it the manage view of an account with the options to remember its password or remove it" width="760">

</div>

Every guide is on the [documentation website](https://dennis-otto.github.io/player-switch-for-autodarts/), in English and [German](https://dennis-otto.github.io/player-switch-for-autodarts/de/).

<sub>💛 If Player Switch is useful to you, you can [support its development](https://github.com/sponsors/Dennis-Otto).</sub>

## Why

- **One tap, no typing.** The display in the hallway, the club or the pub is shared, but everyone plays under their own Autodarts account. A tap on a tile puts that account on the board.
- **Nobody gets signed out.** The account that steps aside keeps its session parked, so a tap brings it straight back. No password, no sign-in page.
- **Ready days later.** Autodarts rotates its session tokens; the extension renews every parked account in the background, so a saved account still works next week.
- **Private by design.** Everything stays in the browser on that computer and goes only to Autodarts. No analytics, no server of ours, nothing sent anywhere else.

## How it works

Autodarts Play keeps the signed-in session as a single value in the browser (a rotating refresh token in `localStorage`). The extension keeps that value per account and swaps it when you switch:

- **Switching** parks the session of the account that was playing, writes the chosen account's session into the page and reloads.
- **The account that steps aside is not signed out at Autodarts.** Its session stays valid; "switching away" only takes it off the page.
- **Parked sessions are kept fresh.** Because the token rotates, the extension renews each parked account's token in the background, every 12 hours. Each time the browser starts, it checks that the renewal is still scheduled, and when the computer was off while a renewal was due, it renews straight away. "Manage accounts" shows for each parked account when it was last renewed.
- **You see who needs attention.** When an account has to sign in again, the toolbar icon shows how many, and its tooltip names them, so nobody finds out only when they want to play. If Autodarts turns every saved account away at once, the popup says that Autodarts may have changed how it signs in and links to the known problems and updates.
- **One change at a time.** A token works only once, so a second tap while a switch is on its way is ignored, and the renewal in the background waits for the switch. A double tap can't sign the previous player out.
- **The tab in front.** A switch happens on the Autodarts tab you're looking at, and every other Autodarts tab reloads with the new player, so none plays on as the one before. With no Autodarts tab open, a tap opens Autodarts and switches there.
- **Password fallback, optional.** If you let the extension remember an account's password, it signs that account back in by itself should its token ever stop working. Accounts that sign in with Google or Apple can't use this.

[Decision 0002](docs/decisions/0002-swap-the-session-not-the-login.md) records why it works this way, and the [security design](docs/security.md) says what is stored and which risks remain.

## Quick start

### Install

**From the Chrome Web Store** — once the listing is live, install it in one click from its store page; updates then arrive on their own. The link goes here when it is.

**Unpacked, from the source:**

```sh
npm ci
npm run build
```

Then in Chrome open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked** and pick the `extension/` folder of this repository.

The extension asks only for access to the Autodarts sites, its own storage and a timer for the renewal. It can't read the address or title of your other tabs, or your browsing history.

### Add the players

1. Open [play.autodarts.com](https://play.autodarts.com) and sign in as the first person.
2. Open the extension and choose **Save account**.
3. Choose **Add account**, sign in as the next person, and save that one too.
4. From then on, a tap on a tile switches accounts. **Manage accounts** shows the options of each account.

### Remember a password (optional)

Under **Manage accounts**, choose **Remember password** for an account, and the extension signs it back in on its own if its session ever stops working. The password stays on that computer and is sent only to Autodarts; [SECURITY.md](SECURITY.md) and the [privacy policy](docs/privacy.md) say exactly what is stored.

## Good to know

- The way the extension keeps a session is not an official Autodarts interface. A change on Autodarts' side can stop it until the extension is adjusted, and how long a parked token stays valid is up to Autodarts. When Autodarts turns every saved account away in one renewal, the popup tells you to look for an update of the extension rather than sign everyone in again.
- It is built for a display that the people of a household, club or venue share and trust: anyone at that display can switch to any saved account, which is the point.

## Development

Contributions are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) has the rules and the checks, [docs/development.md](docs/development.md) explains how the code is laid out, how to run the extension from the source and what the tests check, among them property-based tests that run the account logic on generated inputs, and [docs/releases.md](docs/releases.md) how a release reaches the Chrome Web Store.

## Support and security

Questions and problems: see [SUPPORT.md](SUPPORT.md). Report vulnerabilities privately, as [SECURITY.md](SECURITY.md) describes.

## License

MIT; see [LICENSE](LICENSE). Every file names its license in the machine-readable form of [REUSE](https://reuse.software). Not affiliated with Autodarts.
