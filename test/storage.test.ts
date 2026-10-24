import assert from "node:assert/strict";
import { test } from "node:test";

import { EMPTY, park, STATE_VERSION, type State } from "../src/state.ts";
import {
  ACCOUNTS_KEY,
  accountsIn,
  BACKUP_KEY,
  createStore,
  type StorageArea,
  UnknownStateError,
} from "../src/storage.ts";

/** The storage of the browser, which keeps a copy of JSON values, as chrome.storage does. */
class FakeArea implements StorageArea {
  readonly data = new Map<string, unknown>();
  writes = 0;

  constructor(entries: Record<string, unknown> = {}) {
    for (const [key, value] of Object.entries(entries)) {
      this.data.set(key, structuredClone(value));
    }
  }

  get(keys: string[]): Promise<Record<string, unknown>> {
    const found: Record<string, unknown> = {};
    for (const key of keys) {
      if (this.data.has(key)) {
        found[key] = structuredClone(this.data.get(key));
      }
    }
    return Promise.resolve(found);
  }

  set(items: Record<string, unknown>): Promise<void> {
    this.writes += 1;
    for (const [key, value] of Object.entries(items)) {
      this.data.set(key, JSON.parse(JSON.stringify(value)));
    }
    return Promise.resolve();
  }

  remove(keys: string[]): Promise<void> {
    this.writes += 1;
    for (const key of keys) {
      this.data.delete(key);
    }
    return Promise.resolve();
  }
}

const ada = { id: "a", username: "ada", name: "Ada", picture: null };
const parkedAda: State = park(EMPTY, ada, "rt-a", 10);
/** The accounts as the releases before the version stored them. */
const UNVERSIONED = {
  profiles: [
    {
      id: "a",
      username: "ada",
      name: "Ada",
      picture: null,
      token: "rt-a",
      needsSignIn: false,
      refreshedAt: 10,
      credentials: null,
    },
  ],
  activeId: null,
};
/** The accounts as a newer version of the extension might store them. */
const NEWER = {
  version: 2,
  profiles: [{ id: "a", sessions: { refresh: "rt-a" } }],
};

test("a store with nothing stored yet has no account", async () => {
  const store = createStore(new FakeArea());
  assert.deepEqual(await store.load(), EMPTY);
});

test("the store saves the accounts with the version of their format and reads them back", async () => {
  const area = new FakeArea();
  const store = createStore(area);
  await store.save(parkedAda);
  assert.equal(
    (area.data.get(ACCOUNTS_KEY) as { version: number }).version,
    STATE_VERSION,
  );
  assert.deepEqual(await store.load(), parkedAda);
});

test("the store reads the accounts of a release before the version, and the next save brings them up to date", async () => {
  const area = new FakeArea({ [ACCOUNTS_KEY]: UNVERSIONED });
  const store = createStore(area);
  assert.deepEqual(await store.load(), parkedAda);
  await store.save(await store.load());
  assert.deepEqual(area.data.get(ACCOUNTS_KEY), {
    version: STATE_VERSION,
    ...parkedAda,
  });
});

test("migrate stores the accounts of an earlier format anew, once", async () => {
  const area = new FakeArea({ [ACCOUNTS_KEY]: UNVERSIONED });
  const store = createStore(area);
  assert.equal(await store.migrate(), true);
  assert.equal(
    (area.data.get(ACCOUNTS_KEY) as { version: number }).version,
    STATE_VERSION,
  );
  assert.deepEqual(await store.load(), parkedAda);
  const writes = area.writes;
  assert.equal(await store.migrate(), false);
  assert.equal(
    area.writes,
    writes,
    "accounts that are up to date are not written again",
  );
});

test("migrate leaves a store with nothing stored yet empty", async () => {
  const area = new FakeArea();
  assert.equal(await createStore(area).migrate(), false);
  assert.equal(area.data.has(ACCOUNTS_KEY), false);
});

test("accounts of a newer version are never saved over, and a copy of them is kept", async () => {
  const area = new FakeArea({ [ACCOUNTS_KEY]: NEWER });
  const store = createStore(area);
  await assert.rejects(store.load(), UnknownStateError);
  await assert.rejects(store.save(parkedAda), UnknownStateError);
  await assert.rejects(store.migrate(), UnknownStateError);
  assert.deepEqual(
    area.data.get(ACCOUNTS_KEY),
    NEWER,
    "the accounts stay as the newer version stored them",
  );
  assert.deepEqual(area.data.get(BACKUP_KEY), NEWER);
  // The copy is written once, not at every reading.
  assert.equal(area.writes, 1);
});

test("a changed value that the store doesn't know replaces the copy of the one before", async () => {
  const area = new FakeArea({ [ACCOUNTS_KEY]: "garbled", [BACKUP_KEY]: NEWER });
  const error = await createStore(area)
    .load()
    .catch((caught: unknown) => caught);
  assert.ok(error instanceof UnknownStateError);
  assert.equal(error.name, "UnknownStateError");
  assert.match(error.message, /doesn't know/);
  assert.equal(area.data.get(BACKUP_KEY), "garbled");
  assert.equal(area.data.get(ACCOUNTS_KEY), "garbled");
});

test("the copy goes once the stored accounts are in a format the store reads again", async () => {
  const area = new FakeArea({ [ACCOUNTS_KEY]: NEWER });
  const store = createStore(area);
  await assert.rejects(store.load(), UnknownStateError);
  assert.equal(area.data.has(BACKUP_KEY), true);
  // A version that reads both formats wrote the accounts back in this one.
  area.data.set(ACCOUNTS_KEY, { version: STATE_VERSION, ...parkedAda });
  assert.deepEqual(await store.load(), parkedAda);
  assert.equal(
    area.data.has(BACKUP_KEY),
    false,
    "no copy of a token or a password is left behind",
  );
  const writes = area.writes;
  await store.load();
  assert.equal(
    area.writes,
    writes,
    "with no copy left, a reading writes nothing",
  );
});

test("accountsIn shows the stored accounts, and none while their format is unknown", () => {
  assert.deepEqual(
    accountsIn({ [ACCOUNTS_KEY]: UNVERSIONED, settings: {} }),
    parkedAda,
  );
  assert.deepEqual(accountsIn({}), EMPTY);
  assert.deepEqual(accountsIn({ [ACCOUNTS_KEY]: NEWER }), EMPTY);
});
