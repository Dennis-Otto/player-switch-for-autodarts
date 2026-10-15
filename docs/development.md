# Development

How the code is laid out, how to run the extension from the source, and what the checks look at. [CONTRIBUTING](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/CONTRIBUTING.md) has the rules for changes.

## How the code is laid out

| Where | What |
| --- | --- |
| `src/` | The account logic, in TypeScript, without the browser: `autodarts.ts` talks to Autodarts' sign-in service (renew, sign in, end a session, read who a session belongs to), `state.ts` keeps the saved accounts and which one plays, `switch.ts` is the switch itself, with the page, the storage, the clock and `fetch` passed in. Every line, branch and function runs in a test. |
| `test/` | The tests of `src/`, with fakes for the page, the storage and Autodarts. |
| `extension/` | The loadable extension, Manifest V3: `background.js` wires the browser to the logic, `popup.html`, `popup.css` and `popup.js` are the popup, `content.js` runs in the Autodarts page and is the only code that reads or writes the page's stored session, `_locales/` holds the English and German texts. `extension/lib/` is built from `src/` and not committed. |
| `store/` | The texts of the Chrome Web Store listing. |
| `scripts/` | `check.sh` runs every check, `check-project.sh` the ones of this project (the manifest version against the release, the two languages against each other), `package-extension.sh` builds the store package. |

The one rule that shapes `switch.ts`: Autodarts rotates the refresh token, so the token in the page belongs to the page. The extension reads it only to park it when switching away, writes a token only when a different account takes over, and never renews the token that is live in the page behind the page's back. [Decision 0002](decisions/0002-swap-the-session-not-the-login.md) records why, and the [security design](security.md) what is stored.

## Run it from the source

```sh
npm ci
npm run build
```

Then in Chrome open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked** and pick the `extension/` folder. After a change, build again and reload the extension there; a change of `content.js` also needs a reload of the Autodarts tab.

## Checks

```sh
bash scripts/check.sh
```

runs what the CI runs: the text files, the version in every file, the shell scripts, the types, the tests with full coverage, the package, and the checks of this project. The service worker and the popup have no unit tests of their own, which is why they hold only wiring and every decision sits in `src/`.
