# Player Switch for Autodarts

[![CI](https://github.com/Dennis-Otto/player-switch-for-autodarts/actions/workflows/ci.yml/badge.svg)](https://github.com/Dennis-Otto/player-switch-for-autodarts/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Dennis-Otto/player-switch-for-autodarts/actions/workflows/codeql.yml/badge.svg)](https://github.com/Dennis-Otto/player-switch-for-autodarts/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Dennis-Otto/player-switch-for-autodarts/badge)](https://scorecard.dev/viewer/?uri=github.com/Dennis-Otto/player-switch-for-autodarts)
[![REUSE](https://api.reuse.software/badge/github.com/Dennis-Otto/player-switch-for-autodarts)](https://api.reuse.software/info/github.com/Dennis-Otto/player-switch-for-autodarts)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A Chrome extension that switches between Autodarts accounts on a shared touch
display with one tap, without signing in again. Everyone in the house plays under
their own account; a tap on a tile puts that account on the board.

> **Status: prototype.** It needs three lines from you before it works (see
> [The one gap you fill in](#the-one-gap-you-fill-in)), and the way it keeps a
> session is not an official Autodarts interface, so a change on their side can
> stop it until the extension is adjusted.

## How it works

Autodarts Play keeps the signed-in session as a single value in the browser (a
rotating refresh token in `localStorage`). The extension keeps that value per
account and swaps it when you switch:

- **Switching** parks the session of the account that was playing, writes the
  chosen account's session into the page and reloads. No password is typed.
- **The account that steps aside is not signed out at Autodarts.** Its session
  stays valid so a tap brings it straight back. "Switching away" only takes it off
  the page.
- **Parked sessions are kept fresh.** Because the token rotates, the extension
  renews each parked account's token in the background, so it still works days
  later.
- **Password fallback (optional).** If you let the extension remember an account's
  password, it signs that account in again automatically should its token ever
  stop working. Accounts that use Google or Apple to sign in can't use this.

## Install (unpacked)

```sh
npm ci
npm run build
```

Then in Chrome: open `chrome://extensions`, turn on **Developer mode**, choose
**Load unpacked** and pick the `extension/` folder of this repository.

## The one gap you fill in

One file, [`extension/content.js`](extension/content.js), reads and writes the
session inside the Autodarts page. Three lines there are left blank on purpose and
marked `GAP 1 of 3` … `GAP 3 of 3`; fill each in with the line shown in its
comment (a `localStorage` get, set and remove under the key
`autodarts_refresh_token`). Then reload the extension and the Autodarts tab.

Everything else — renewing tokens, the password fallback, the account list — is
written and tested in [`src/`](src/); `content.js` is the only place that touches
the page's stored session, which is why that part is yours to complete.

## Use it

1. Open [play.autodarts.com](https://play.autodarts.com) and sign in as the first
   person.
2. Open the extension and choose **Save this account**.
3. Choose **Add another account**, sign in as the next person, and save that one
   too.
4. From then on, a tap on a tile switches accounts.

Optionally, open an account's menu and **Remember password** so the extension can
sign it back in on its own. See [SECURITY.md](SECURITY.md) for what that stores.

## Development

Every change goes through a pull request whose title follows
[Conventional Commits](https://www.conventionalcommits.org/), with signed-off
commits (`git commit -s`). The checks of the CI run locally with

```sh
bash scripts/check.sh
```

[CONTRIBUTING.md](CONTRIBUTING.md) explains the set-up and the rules.

## Support and security

Questions and problems: see [SUPPORT.md](SUPPORT.md). Report vulnerabilities
privately, as [SECURITY.md](SECURITY.md) describes.

## License

MIT; see [LICENSE](LICENSE). Every file names its license in the machine-readable
form of [REUSE](https://reuse.software).
