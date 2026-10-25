# Write every line that ships in TypeScript

- Status: accepted
- Date: 2026-10-25

## Context

The account logic in `src/` was TypeScript, checked by the compiler and covered by the tests line by line. The code that wires it to the browser was not: the service worker, the content script in the Autodarts page and the pages of the extension were plain JavaScript in `extension/`, about 2,500 lines with no types and no unit tests. The messages between them, `{ type: "popup", action, … }`, existed only by convention, so a renamed action or a missing field failed only on a display, and every fix of the service worker, such as the queue of the account changes or the PINs of the venue mode, went into code that no unit test ran. The key under which the content script reads the session of the page was written twice, in `autodarts.ts` and in `content.js`.

Two limits of Chrome shape the answer. A content script can't be a module, so it can't import the key or anything else. And the service worker reaches the browser only through `chrome`, which doesn't exist outside an extension.

## Options

1. Keep the JavaScript and lean on the end-to-end tests. They run the real extension, but they are slow, they can't reach most of the failures of the browser (a broken storage, a tab that refuses a script, an alarm that a restart cleared), and they leave the messages untyped.
2. Bundle every entry point with a bundler such as esbuild, so that the content script may import. That adds a build tool and a native binary to the supply chain of a project that needs neither elsewhere.
3. Move every line into `src/` and let the compiler build it as it builds the logic: the service worker behind a typed port of `chrome`, the content script as a file that imports and exports nothing, and the types of every message in one module.

## Decision

Option 3. `tsc` builds `extension/lib/` and checks every line that ships.

- **The service worker** is `worker.ts`, which reaches the browser only through `ChromeApi`, the members of `chrome` that it uses with the types it relies on. `background.ts`, the file that the manifest names, starts it on the real `chrome`, which the compiler checks against the port; a test starts it on a fake browser.
- **The content script** is `content.ts`, a classic script: it imports nothing and exports nothing, and takes the types of the messages with `import()` types alone, which the compiler leaves out. `moduleDetection: "legacy"` in `tsconfig.json` lets the compiler write such a file without the `export {}` that a content script can't run. Its test runs the script the way Chrome does, as a classic script in a world of its own beside a page of happy-dom, and checks its key against `SESSION_KEY`.
- **The messages** have one type each in `messages.ts`, which the pages, the worker and the content script share, and the worker reads each message with `readRequest` before it acts.
- **The pages** keep their decisions in `popup-model.ts` and `options-model.ts`, which the unit tests cover. What is left in `pages/` only draws and sends; it is type-checked, left out of the coverage of the unit tests, and run by the end-to-end tests and the check of the accessibility in a real browser.

## Consequences

- A renamed action, a missing field or a wrong path fails the type check, and the coverage gate of 100 % of the lines, branches and functions now holds for the service worker, the content script and the decisions of the pages too.
- `extension/` holds no code: only the manifest, the HTML, the styles, the icons and the texts. The manifest names `lib/background.js` and `lib/content.js`, and each page loads its script from `lib/pages/`; `scripts/check-pages.mjs` fails when one of them is missing.
- A new file in `src/` that imports and exports nothing becomes a classic script, as the content script is. Every other file imports something already, and a module that has nothing to import gets an `export`.
- The tests of the content script need happy-dom, a development dependency that never ships. Its own types need a newer `@types/node` than Node 24 has, so the test loads it without them and types its window as the DOM of the TypeScript lib, which happy-dom implements.
