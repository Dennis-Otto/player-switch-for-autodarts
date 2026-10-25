import assert from "node:assert/strict";
import { test } from "node:test";

import { platformOf } from "../src/worker.ts";
import { FakeBrowser } from "./browser.ts";

test("the service worker of the manifest starts the worker on the browser of its global scope", async () => {
  const fake = new FakeBrowser();
  const scope = globalThis as { chrome?: unknown; indexedDB?: unknown };
  scope.chrome = fake;
  scope.indexedDB = fake.idb;
  await import("../src/background.ts");
  assert.equal(fake.runtime.onMessage.listeners.length, 1);
  assert.equal(fake.runtime.onInstalled.listeners.length, 1);
  assert.equal(fake.local.accessLevel, "TRUSTED_CONTEXTS");
});

test("the platform of the worker is the IndexedDB, fetch, clock, timers and console of its scope", async () => {
  const calls: unknown[][] = [];
  const indexedDB = {} as IDBFactory;
  const response = new Response("ok");
  const platform = platformOf({
    indexedDB,
    fetch: (url, init) => {
      calls.push(["fetch", url, init.method]);
      return Promise.resolve(response);
    },
    setTimeout: (task, ms) => {
      calls.push(["setTimeout", ms]);
      task();
    },
    console: { error: (...data) => calls.push(["error", ...data]) },
    Date: { now: () => 42 },
  });

  assert.equal(platform.indexedDB, indexedDB);
  assert.equal(
    await platform.fetch("https://example.com/", { method: "POST" }),
    response,
  );
  assert.equal(platform.now(), 42);
  await platform.wait(250);
  let ran = false;
  platform.later(4000, () => {
    ran = true;
  });
  platform.log("Player Switch: a test failed.", "why");
  assert.equal(ran, true);
  assert.deepEqual(calls, [
    ["fetch", "https://example.com/", "POST"],
    ["setTimeout", 250],
    ["setTimeout", 4000],
    ["error", "Player Switch: a test failed.", "why"],
  ]);
});
