import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EMPTY,
  park,
  rememberCredentials,
  STATE_VERSION,
  type State,
  setActive,
} from "../src/state.ts";
import {
  ACCOUNTS_KEY,
  accountsIn,
  BACKUP_KEY,
  createStore,
  placeOf,
  type StorageArea,
  UnknownStateError,
} from "../src/storage.ts";
import { createVault, type KeyStore, type Vault } from "../src/vault.ts";

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

  /** Everything stored, as a tool that reads the storage of the browser shows it. */
  dump(): string {
    return JSON.stringify(Object.fromEntries(this.data));
  }
}

/** The key store of one browser profile, in memory; `fail` makes it unreadable. */
class MemoryKeys implements KeyStore {
  key: CryptoKey | undefined;
  fail = false;

  load(): Promise<CryptoKey | undefined> {
    return this.fail
      ? Promise.reject(new Error("the key store is down"))
      : Promise.resolve(this.key);
  }

  add(key: CryptoKey): Promise<CryptoKey> {
    this.key ??= key;
    return Promise.resolve(this.key);
  }
}

/** The vault of a browser profile with a key of its own. */
const newVault = (): Vault => createVault(new MemoryKeys());

const ada = { id: "a", username: "ada", name: "Ada", picture: null };
const bob = { id: "b", username: "bob", name: "Bob", picture: null };
const parkedAda: State = park(EMPTY, ada, "rt-a", 10);
/** Bob plays, with his password remembered; Ada is parked with hers. */
const shared: State = rememberCredentials(
  rememberCredentials(park(setActive(EMPTY, bob), ada, "rt-a", 10), "a", {
    username: "ada@example.org",
    password: "pw-ada",
  }),
  "b",
  { username: "bob@example.org", password: "pw-bob" },
);
/** What must never be readable in the storage once the accounts are sealed. */
const SECRETS = ["rt-a", "pw-ada", "pw-bob"];

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
/** The accounts as the versions before the sealed secrets stored them, in plain text. */
const PLAIN = { version: 1, ...shared };
/** The accounts as a newer version of the extension might store them. */
const NEWER = {
  version: STATE_VERSION + 1,
  profiles: [{ id: "a", sessions: { refresh: "rt-a" } }],
};

function assertSealed(area: FakeArea): void {
  const dump = area.dump();
  for (const secret of SECRETS) {
    assert.ok(!dump.includes(secret), `${secret} is in the storage: ${dump}`);
  }
}

test("a store with nothing stored yet has no account", async () => {
  const area = new FakeArea();
  const store = createStore(area, newVault());
  assert.deepEqual(await store.load(), EMPTY);
  assert.equal(area.writes, 0);
});

test("the store saves the accounts sealed, with the version of their format, and reads them back", async () => {
  const area = new FakeArea();
  const store = createStore(area, newVault());
  await store.save(shared);
  const stored = area.data.get(ACCOUNTS_KEY) as {
    version: number;
    profiles: { token: unknown; credentials: unknown }[];
  };
  assert.equal(stored.version, STATE_VERSION);
  assertSealed(area);
  // The names, the pictures and who plays stay readable; the secrets are sealed.
  const fields = (value: unknown) =>
    value === null ? null : Object.keys(value as object).sort();
  assert.deepEqual(
    stored.profiles.map(({ token, credentials }) => [
      fields(token),
      fields(credentials),
    ]),
    [
      [
        ["data", "iv"],
        ["data", "iv"],
      ],
      [null, ["data", "iv"]],
    ],
  );
  const writes = area.writes;
  assert.deepEqual(await store.load(), shared);
  assert.equal(area.writes, writes, "sealed accounts are read without a write");
});

test("the store seals the accounts of the plain format at the first reading", async () => {
  for (const [plain, expected] of [
    [UNVERSIONED, parkedAda],
    [PLAIN, shared],
  ] as const) {
    const area = new FakeArea({ [ACCOUNTS_KEY]: plain });
    const store = createStore(area, newVault());
    assert.deepEqual(await store.load(), expected);
    assert.equal(
      (area.data.get(ACCOUNTS_KEY) as { version: number }).version,
      STATE_VERSION,
    );
    assertSealed(area);
    assert.deepEqual(await store.load(), expected);
  }
});

test("migrate seals the accounts of the plain format, once, and loses none", async () => {
  const area = new FakeArea({ [ACCOUNTS_KEY]: PLAIN });
  const store = createStore(area, newVault());
  assert.ok(area.dump().includes("pw-bob"), "the fixture is in plain text");
  assert.equal(await store.migrate(), true);
  assertSealed(area);
  assert.deepEqual(await store.load(), shared);
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
  assert.equal(await createStore(area, newVault()).migrate(), false);
  assert.equal(area.data.has(ACCOUNTS_KEY), false);
});

test("accounts whose key is gone have to sign in again, and nothing fails", async () => {
  const area = new FakeArea();
  await createStore(area, newVault()).save(shared);
  // The data of the extension was cleared, and with it the key; the accounts stayed.
  const store = createStore(area, newVault());
  const after = await store.load();
  assert.deepEqual(after, {
    profiles: [
      {
        ...ada,
        token: null,
        needsSignIn: true,
        refreshedAt: null,
        renewalFailedAt: null,
        credentials: null,
      },
      // Bob plays on: the page keeps his session. Only his password is forgotten.
      {
        ...bob,
        token: null,
        needsSignIn: false,
        refreshedAt: null,
        renewalFailedAt: null,
        credentials: null,
      },
    ],
    activeId: "b",
    addingUntil: null,
  });
  // The accounts are stored so at once, and the next reading finds them so.
  const writes = area.writes;
  assert.deepEqual(await store.load(), after);
  assert.equal(area.writes, writes);
  assert.equal(await store.migrate(), false);
});

test("a key store that can't be read fails the reading and changes nothing", async () => {
  const keys = new MemoryKeys();
  const area = new FakeArea();
  await createStore(area, createVault(keys)).save(shared);
  const before = area.dump();
  keys.fail = true;
  const store = createStore(area, createVault(keys));
  await assert.rejects(store.load(), /the key store is down/);
  await assert.rejects(store.save(shared), /the key store is down/);
  await assert.rejects(store.migrate(), /the key store is down/);
  assert.equal(
    area.dump(),
    before,
    "no session is given up for a passing fault",
  );
  keys.fail = false;
  assert.deepEqual(await store.load(), shared);
});

test("a sealed session moved to another account doesn't open there", async () => {
  const area = new FakeArea();
  const store = createStore(area, newVault());
  await store.save(park(parkedAda, bob, "rt-b", 20));
  const stored = area.data.get(ACCOUNTS_KEY) as {
    profiles: [{ token: unknown }, { token: unknown }];
  };
  const [first, second] = stored.profiles;
  // Someone who can write the storage swaps the sessions of Ada and Bob.
  [first.token, second.token] = [second.token, first.token];
  area.data.set(ACCOUNTS_KEY, stored);
  const after = await store.load();
  assert.deepEqual(
    after.profiles.map(({ id, token, needsSignIn }) => [
      id,
      token,
      needsSignIn,
    ]),
    [
      ["a", null, true],
      ["b", null, true],
    ],
  );
});

test("a remembered password that doesn't open is forgotten, and the session stays", async () => {
  const vault = newVault();
  const area = new FakeArea();
  const store = createStore(area, vault);
  await store.save(parkedAda);
  const stored = area.data.get(ACCOUNTS_KEY) as {
    profiles: [Record<string, unknown>];
  };
  for (const garbled of ["no JSON", JSON.stringify({ username: "ada" })]) {
    stored.profiles[0].credentials = await vault.seal(
      garbled,
      placeOf("credentials", "a"),
    );
    area.data.set(ACCOUNTS_KEY, stored);
    assert.deepEqual(await store.load(), parkedAda);
    assert.equal(
      (area.data.get(ACCOUNTS_KEY) as typeof stored).profiles[0].credentials,
      null,
    );
  }
});

test("a session or a password in plain text in the sealed format counts as none", async () => {
  const area = new FakeArea({
    [ACCOUNTS_KEY]: { ...PLAIN, version: STATE_VERSION },
  });
  const after = await createStore(area, newVault()).load();
  assert.deepEqual(
    after.profiles.map(({ token, credentials }) => [token, credentials]),
    [
      [null, null],
      [null, null],
    ],
  );
});

test("accounts of a newer version are never saved over, and a copy of them is kept", async () => {
  const area = new FakeArea({ [ACCOUNTS_KEY]: NEWER });
  const store = createStore(area, newVault());
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
  const error = await createStore(area, newVault())
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
  const vault = newVault();
  const store = createStore(area, vault);
  await assert.rejects(store.load(), UnknownStateError);
  assert.equal(area.data.has(BACKUP_KEY), true);
  // A version that reads both formats wrote the accounts back in this one.
  const sealed = new FakeArea();
  await createStore(sealed, vault).save(parkedAda);
  area.data.set(ACCOUNTS_KEY, sealed.data.get(ACCOUNTS_KEY));
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

test("accountsIn shows the stored accounts without their secrets, and none while their format is unknown", async () => {
  const withoutSecrets = (state: State): State => ({
    ...state,
    profiles: state.profiles.map((profile) => ({
      ...profile,
      token: null,
      credentials: null,
    })),
  });
  assert.deepEqual(
    accountsIn({ [ACCOUNTS_KEY]: UNVERSIONED, settings: {} }),
    withoutSecrets(parkedAda),
  );
  const area = new FakeArea();
  await createStore(area, newVault()).save(shared);
  assert.deepEqual(
    accountsIn({ [ACCOUNTS_KEY]: area.data.get(ACCOUNTS_KEY) }),
    withoutSecrets(shared),
  );
  assert.deepEqual(accountsIn({}), EMPTY);
  assert.deepEqual(accountsIn({ [ACCOUNTS_KEY]: NEWER }), EMPTY);
});
