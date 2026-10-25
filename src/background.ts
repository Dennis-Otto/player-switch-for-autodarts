/**
 * The service worker of the manifest, `lib/background.js`: it starts the worker of
 * `worker.ts` on the real browser, with the IndexedDB, fetch, clock and timers of its
 * global scope. Everything else is in `worker.ts`, which a test runs on a fake browser.
 */
import { platformOf, startWorker } from "./worker.ts";

startWorker(chrome, platformOf(globalThis));
