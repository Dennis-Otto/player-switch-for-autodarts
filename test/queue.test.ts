import assert from "node:assert/strict";
import { test } from "node:test";

import { createQueue } from "../src/queue.ts";

/** A task that records when it starts and ends, and waits a moment in between. */
function task(
  log: string[],
  name: string,
  result = name,
): () => Promise<string> {
  return async () => {
    log.push(`${name} starts`);
    await new Promise((resolve) => setTimeout(resolve, 1));
    log.push(`${name} ends`);
    return result;
  };
}

test("the queue runs its tasks one after another, in the order they came", async () => {
  const queue = createQueue();
  const log: string[] = [];
  const results = await Promise.all([
    queue(task(log, "a")),
    queue(task(log, "b")),
    queue(task(log, "c")),
  ]);
  assert.deepEqual(results, ["a", "b", "c"]);
  assert.deepEqual(log, [
    "a starts",
    "a ends",
    "b starts",
    "b ends",
    "c starts",
    "c ends",
  ]);
});

test("a task that fails reports it and lets the next one run", async () => {
  const queue = createQueue();
  const log: string[] = [];
  const failing = queue(async () => {
    log.push("a starts");
    throw new Error("a failed");
  });
  const next = queue(task(log, "b"));
  await assert.rejects(failing, /a failed/);
  assert.equal(await next, "b");
  assert.deepEqual(log, ["a starts", "b starts", "b ends"]);
});

test("a task added while another runs waits for it", async () => {
  const queue = createQueue();
  const log: string[] = [];
  let inner: Promise<string> = Promise.resolve("");
  await queue(async () => {
    log.push("a starts");
    // Not awaited here: a task that waited for a task behind it would wait forever.
    inner = queue(task(log, "b"));
    await new Promise((resolve) => setTimeout(resolve, 1));
    log.push("a ends");
  });
  assert.equal(await inner, "b");
  assert.deepEqual(log, ["a starts", "a ends", "b starts", "b ends"]);
});

test("each queue keeps its own turns", async () => {
  const first = createQueue();
  const second = createQueue();
  const log: string[] = [];
  await Promise.all([first(task(log, "a")), second(task(log, "b"))]);
  assert.deepEqual(log.slice(0, 2), ["a starts", "b starts"]);
});
