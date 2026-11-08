# Roadmap

What Player Switch intends to do in the next twelve months, until November 2027, and what it will not do. It is a direction, not a promise. Ideas are welcome as [feature requests](https://github.com/Dennis-Otto/player-switch-for-autodarts/issues/new?template=feature_request.yml).

## The next twelve months

The extension does what it was built for: one shared Autodarts display, everyone on their own account, one tap to switch. Two larger pieces of work are planned:

- **The venue mode as safe in Firefox as in Chrome.** Firefox can't keep the storage of the extension from its script in the Autodarts page, so the names of the saved accounts, the settings and the hashes of the venue PINs move into the IndexedDB of the extension, beside the key of the sealed sessions, where that script can't reach them ([the security design](security.md#firefox), [decision 0012](decisions/0012-run-one-package-in-chrome-edge-and-firefox.md)).
- **Listings in Edge Add-ons and on addons.mozilla.org,** after that move, once the maintainer has opened the accounts of the two stores ([what they take](releases.md#edge-and-firefox)). Until then, Edge installs from the Chrome Web Store, and Firefox loads [the zip of a release](index.md#install-from-a-release).

Beyond these, the year is about keeping it working and safe:

- **Every change of Autodarts.** How the extension keeps a session is not an official interface of Autodarts. The workflow Upstream checks that contract every morning, and the end-to-end tests run in the next Chrome every day, so a change usually shows before the players see it ([what Autodarts and the next Chrome change](development.md#what-autodarts-and-the-next-chrome-change)). A change that breaks switching is fixed first, with a test that keeps it fixed.
- **Every new version of Chrome, Edge and Firefox,** from version 140 on, in one package for all of them.
- **Fixes and security.** Reported bugs and vulnerabilities come before anything new; [SECURITY.md](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/SECURITY.md) has the times.
- **Current dependencies and tooling,** through the update bots and the [repository blueprint](https://github.com/Dennis-Otto/repo-blueprint).

Feature requests with the most reactions are considered next, in that order: anything that breaks for players first, then what keeps the saved accounts safer, then the rest.

## Done

The larger pieces of work of the recent releases; the [changelog](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/CHANGELOG.md) has every change.

- **Two players, each with their own stats:** a parked player [joins the lobby](index.md#join-a-lobby) on the board with one tap, without a phone and without a sign-in ([decision 0016](decisions/0016-join-a-lobby-with-a-parked-session.md)), and the welcome page reminds the owner to [share the board](help.md#board-not-shared) with every saved player.
- **One package for every browser:** Chrome, Edge and Firefox 140 or newer run the same zip, linted with `web-ext lint` and tested in a real Firefox ([which browsers](index.md#browsers), [decision 0012](decisions/0012-run-one-package-in-chrome-edge-and-firefox.md)).
- **One zip for the players and the store:** every release carries the extension ready to load, the Chrome Web Store gets exactly that file after a check of its signed provenance, and anyone can [rebuild it byte for byte](releases.md#rebuild-a-release) from the source of its tag ([decision 0013](decisions/0013-send-the-store-the-zip-that-the-release-attests.md)).
- **Ready for a club or a pub:** the [venue mode](shared-display.md#venue-mode) with a manager PIN, a PIN for each player and the return to a house account after a break ([decision 0008](decisions/0008-lock-a-venue-display-with-pins-that-the-worker-checks.md)).
- **Sealed sessions and passwords:** with a key that the browser keeps for the extension and never hands out ([the security design](security.md#sealed-tokens-and-passwords), [decision 0006](decisions/0006-seal-the-secrets-with-a-key-that-never-leaves-the-browser.md)).
- **Five languages:** the extension speaks English, German, Dutch, French and Spanish, and the help and this website English and German.

## Not planned

- **A server, an account or analytics of ours.** Everything stays in the browser on that computer and goes only to Autodarts ([privacy](privacy.md)).
- **Saved accounts that follow a player to another computer.** The sessions are sealed with a key that never leaves the browser that saved them ([decision 0006](decisions/0006-seal-the-secrets-with-a-key-that-never-leaves-the-browser.md)), so each display saves its own players.
- **A sign-in with the password at every switch.** A switch swaps the parked session ([decision 0002](decisions/0002-swap-the-session-not-the-login.md)); a remembered password only signs an account back in when its session stops working.
- **Anything of the game itself.** Scores, matches, statistics and the settings of the board stay with Autodarts; the extension decides only which accounts play at the display.
- **A choice of cipher.** The extension picks its algorithms, and a release replaces one that weakens ([the algorithms](security.md#algorithms)): a display that nobody configures shouldn't need a setting for it.
