# Development

How the code is laid out, how to run the extension from the source, and what the checks look at. [CONTRIBUTING](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/CONTRIBUTING.md) has the rules for changes.

## How the code is laid out

| Where | What |
| --- | --- |
| `src/` | The account logic, in TypeScript, without the browser: `autodarts.ts` talks to Autodarts' sign-in service (renew, sign in, end a session, read who a session belongs to), `state.ts` keeps the saved accounts and which one plays, `switch.ts` is the switch itself, with the page, the storage, the clock, `fetch` and the queue passed in, `queue.ts` the queue that runs one change of the accounts at a time, `tabs.ts` finds the Autodarts tab that a switch talks to, reloads the others and opens Autodarts when no tab is open, and `health.ts` decides when the renewal runs and what the toolbar badge and the popup say about it. Every line, branch and function runs in a test. |
| `test/` | The tests of `src/`, with fakes for the page, the tabs of the browser, the storage and Autodarts. The `*.property.test.ts` files are [property-based tests](#property-based-tests), which run the code on many generated inputs. |
| `extension/` | The loadable extension, Manifest V3: `background.js` wires the browser to the logic, `popup.html`, `popup.css` and `popup.js` are the popup, `content.js` runs in the Autodarts page and is the only code that reads or writes the page's stored session, `_locales/` holds the English and German texts. `extension/lib/` is built from `src/` and not committed. |
| `store/` | The texts of the Chrome Web Store listing. |
| `scripts/` | `check.sh` runs every check, `check-project.sh` the ones of this project (the manifest version against the release, the two languages against each other), `package-extension.sh` builds the store package. |

The one rule that shapes `switch.ts`: Autodarts rotates the refresh token, so the token in the page belongs to the page. The extension reads it only to park it when switching away, writes a token only when a different account takes over, and never renews the token that is live in the page behind the page's back. [Decision 0002](decisions/0002-swap-the-session-not-the-login.md) records why, and the [security design](security.md) what is stored.

### One change of the accounts at a time

Because a token works only once, two changes of the accounts must never run side by side: both would load the same accounts and spend the same token, and the one that saves last would write the accounts it loaded over the work of the other. So every operation of `switch.ts` that reads or changes the accounts, a switch, a sign-out, the claim of a session, a remembered password and the view of the popup, waits for its turn in the queue of `deps.queue`, and loads the accounts only when its turn has come. The renewal in the background takes one turn per parked account, so a tap waits for one renewal at most, and saves each fresh token as soon as it arrives. A second tap on the player who is coming on finds them playing when its turn comes, and spends no token. All of it runs in the one service worker, so a chain of promises there is the whole lock; the popup on its side takes no tap while a request runs.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/diagrams/one-change-at-a-time.dark.svg">
  <img src="images/diagrams/one-change-at-a-time.svg" alt="One change of the accounts at a time: A tap on a player, a second tap on the same player and the renewal in the background wait in one queue of the service worker. Each turn loads the saved accounts, talks to Autodarts and the page, and saves before the next turn starts, so the second tap finds the player playing and spends no token.">
</picture>

The tests in `test/switch.test.ts` run these races against a fake Autodarts that rotates every token it renews and refuses a token that comes back.

### Which tab a switch talks to

Every Autodarts tab of the browser shares one `localStorage`, and with it one session. So `tabs.ts` sends a switch to the tab that the person is looking at: the one shown in the window used last, then one shown in another window, such as the board display beside a laptop, then the one shown most recently. A tab whose content script doesn't answer, as one that was open before the extension was installed or updated, passes the request on to the next. Once the session in the page has changed, every other Autodarts tab reloads, so none plays on as the account before and spends its token when it renews its session. The tabs reload one after another, each once the one before has renewed the new session: every page that starts sends the token it finds in `localStorage`, and two that started together would send the same one, which Autodarts takes for a stolen token and answers by ending the new player's session.

With no tab that answers, a tap still works: the extension reloads the tab in front, or opens Autodarts behind the popup when no tab is open, and switches there once the page is ready. Autodarts renews its session as it starts, which spends the token in `localStorage`; so the extension first waits until the page has done that, and parks the fresh token of the player before, not the spent one. A switch that worked brings the tab it opened to the front; after one that failed, the popup stays open with the reason.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/diagrams/which-tab.dark.svg">
  <img src="images/diagrams/which-tab.svg" alt="How a tap finds its Autodarts tab: A tap on a player goes to the Autodarts tab shown in the window used last, then to a tab shown in another window, then to the tab shown most recently. When no tab answers, the extension reloads the tab in front, or opens Autodarts behind the popup when no tab is open, and waits until the page has renewed the session it started with. Then it switches there, and every other Autodarts tab reloads with the new player.">
</picture>

The extension finds the Autodarts tabs through its access to the Autodarts sites, which lets the browser filter the tabs by their address. It asks for no `tabs` permission, which would show the warning "Read your browsing history" at the install and let it read the address of every tab. The tests in `test/tabs.test.ts` run it against a fake browser whose Autodarts tabs share one session, load for a while and renew their session as they start.

### The renewal keeps going

Chrome [may clear an alarm when the browser restarts](https://developer.chrome.com/docs/extensions/reference/api/alarms), and a display that is switched off at night misses the renewal that was due. So `background.js` doesn't rely on the alarm alone: each start of the service worker asks `planStart` of `health.ts` what to do, with the alarm, the record of the last renewal and the clock. A missing alarm is set again for the time the next run is due, and a renewal that is a period overdue, or that never ran, runs straight away. `chrome.runtime.onStartup` and `onInstalled` wake the service worker for it, and the run that the alarm starts and the one of a start share one turn.

Each run records its time only when Autodarts answered for every parked account, so a start without a network catches up at the next start, and it sets the next run 15 minutes later in that case, 12 hours later otherwise. The time of every attempt is kept as well, and a start does not catch up when the last attempt is less than 15 minutes ago, so an account that Autodarts keeps failing for does not renew everyone at each wake-up of the service worker; the retry alarm comes instead. Names and times on the badge and in the popup use the language of the extension's texts, not the browser's, so a line never mixes two languages. When one run turns away every parked account, at least two, the record keeps that as a suspected change at Autodarts, and the popup suggests an update of the extension while an account still has to sign in again; a run that renews an account clears it. The toolbar badge follows every change of the saved accounts and counts those that have to sign in again. Each of these decisions is a function of `health.ts` with the clock passed in, and `test/health.test.ts` runs them with a clock that stands still.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/diagrams/how-the-renewal-keeps-going.dark.svg">
  <img src="images/diagrams/how-the-renewal-keeps-going.svg" alt="How the renewal keeps going: Each start of the service worker, after a start of the browser, an update or any other event, checks the alarm and the time of the last renewal. A missing alarm is set again, and a renewal that is a period overdue runs straight away. Each run renews the parked accounts one at a time, records the time when Autodarts answered for every account, and sets the next run 12 hours later, or 15 minutes later when Autodarts could not be reached. The toolbar badge counts the accounts that have to sign in again, and when one run turns at least two accounts and all of them away, the popup suggests an update of the extension.">
</picture>

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

## Property-based tests

What reaches the extension from the network or from the storage can be anything, and a switch meets the page, Autodarts and the network in any order. So beside the tests of single cases, [fast-check](https://fast-check.dev/) checks properties of `src/` on generated inputs: 100 for each property in every test run, and when one fails, it shrinks the input to the smallest one that still fails and prints it with its seed. This is the fuzzing that [OpenSSF Scorecard](https://securityscorecards.dev/) looks for.

| File | What holds for every input |
| --- | --- |
| `autodarts.property.test.ts` | An answer of the sign-in service, of any status and body, is a session or an `AuthError`, and a refusal only for 400 and 401. Each request carries exactly the token, username and password it is given. Any access token is read as an account, in any language, or refused with an `AuthError`. |
| `state.property.test.ts` | After any changes, each account is stored once, in the order of the popup, and the active one never needs a sign-in. A stored password changes only when a person keeps or drops it. What the extension stores, it reads back the same; stored data of any shape is read without failing. The popup sees no session and no password. |
| `switch.property.test.ts` | The model test: over any evening at a shared display, the extension keeps the rule above and loses no session that an account could still use. |

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/diagrams/how-the-model-test-works.dark.svg">
  <img src="images/diagrams/how-the-model-test-works.svg" alt="How the model test of switching works: fast-check makes up an evening of up to 60 steps: actions of the extension and events in the page, at Autodarts and on the network, in any order. They run against a fake page whose requests can fail, a storage that keeps JSON and a fake Autodarts that rotates every refresh token. After every step the test checks its rules; when one breaks, fast-check shrinks the evening to the shortest one that breaks it and prints it with its seed.">
</picture>

The model test makes up evenings of up to 60 steps: taps on accounts, **Add account**, the background refresh and passwords kept, wrong or dropped, between a page that renews and loses its session, a tab that closes in the middle of a request, Autodarts ending sessions or going offline. A fake Autodarts rotates the refresh tokens as the real one does, so a token that the extension renews behind the page's back, or keeps for two accounts, makes a rule break.

To look further than a test run does:

```sh
FAST_CHECK_RUNS=10000 npm test
```

A failure prints its seed and path. Give both to replay exactly the failing input:

```sh
FAST_CHECK_SEED=1473600459 FAST_CHECK_PATH=42:3:1 npm test
```

The seed alone replays the same runs from the start and stops at the run count, so without the path give it the run count of the failing run too: `FAST_CHECK_RUNS=10000 FAST_CHECK_SEED=1473600459 npm test`.
