import assert from "node:assert/strict";
import { test } from "node:test";

import { IDBFactory as FakeIDBFactory } from "fake-indexeddb";

import {
  ACCOUNTS_KEY_NAME,
  createVault,
  IV_BYTES,
  KEY_DATABASE,
  KEY_TABLE,
  type KeyStore,
  keyStoreIn,
} from "../src/vault.ts";

/** A key store in memory that counts how often it is asked. */
class MemoryKeys implements KeyStore {
  key: CryptoKey | undefined;
  loads = 0;
  adds = 0;
  fail = false;

  load(): Promise<CryptoKey | undefined> {
    this.loads += 1;
    return this.fail
      ? Promise.reject(new Error("the key store is down"))
      : Promise.resolve(this.key);
  }

  add(key: CryptoKey): Promise<CryptoKey> {
    this.adds += 1;
    this.key ??= key;
    return Promise.resolve(this.key);
  }
}

/** A fresh, empty IndexedDB, as the extension has it after its install. */
const freshDatabase = () => new FakeIDBFactory() as unknown as IDBFactory;

const PARKED = "rt-a";
const PLACE = "token/a";

test("a sealed secret opens again at its place, and the storage never sees it", async () => {
  const vault = createVault(new MemoryKeys());
  const sealed = await vault.seal(PARKED, PLACE);
  assert.equal(await vault.open(sealed, PLACE), PARKED);
  assert.ok(!JSON.stringify(sealed).includes(PARKED));
  assert.equal(atob(sealed.iv).length, IV_BYTES);
  // Each sealing takes a nonce of its own, so the same secret never looks the same twice.
  const again = await vault.seal(PARKED, PLACE);
  assert.notEqual(again.iv, sealed.iv);
  assert.notEqual(again.data, sealed.data);
  assert.equal(await vault.open(again, PLACE), PARKED);
  assert.equal(await vault.open(await vault.seal("", PLACE), PLACE), "");
});

test("a sealed secret doesn't open at another place, so it can't be moved to another account", async () => {
  const vault = createVault(new MemoryKeys());
  const sealed = await vault.seal(PARKED, PLACE);
  assert.equal(await vault.open(sealed, "token/b"), null);
  assert.equal(await vault.open(sealed, "credentials/a"), null);
});

test("a sealed secret that was changed, or isn't one, opens to nothing", async () => {
  const vault = createVault(new MemoryKeys());
  const sealed = await vault.seal(PARKED, PLACE);
  const bytes = Uint8Array.from(atob(sealed.data), (char) =>
    char.charCodeAt(0),
  );
  bytes[0] = (bytes[0] as number) ^ 1;
  const flipped = btoa(String.fromCharCode(...bytes));
  for (const broken of [
    { ...sealed, data: flipped },
    { ...sealed, data: "not base64!" },
    { ...sealed, iv: "not base64!" },
    { ...sealed, iv: btoa("short") },
    { ...sealed, data: btoa("short") },
  ]) {
    assert.equal(await vault.open(broken, PLACE), null, JSON.stringify(broken));
  }
});

test("a secret sealed under a key that is gone opens to nothing", async () => {
  const sealed = await createVault(new MemoryKeys()).seal(PARKED, PLACE);
  assert.equal(await createVault(new MemoryKeys()).open(sealed, PLACE), null);
});

test("the vault makes its key once, keeps it and can't export it", async () => {
  const keys = new MemoryKeys();
  const vault = createVault(keys);
  // Many uses at once share the one key that the first one makes.
  const sealed = await Promise.all(
    ["a", "b", "c"].map((id) => vault.seal(PARKED, `token/${id}`)),
  );
  assert.equal(await vault.open(sealed[2] as never, "token/c"), PARKED);
  assert.equal(keys.loads, 1);
  assert.equal(keys.adds, 1);
  const key = keys.key as CryptoKey;
  assert.equal(key.extractable, false);
  assert.deepEqual(key.algorithm, { name: "AES-GCM", length: 256 });
  assert.deepEqual([...key.usages].sort(), ["decrypt", "encrypt"]);
  await assert.rejects(globalThis.crypto.subtle.exportKey("raw", key));
  // A worker that starts again finds the key in the store and opens what it sealed.
  const restarted = createVault(keys);
  assert.equal(await restarted.open(sealed[0] as never, "token/a"), PARKED);
  assert.equal(keys.adds, 1);
});

test("the vault takes the key that the store already holds when another one was first", async () => {
  const keys = new MemoryKeys();
  const first = createVault(keys);
  const sealed = await first.seal(PARKED, PLACE);
  // A second vault found no key yet, made its own, and the store kept the first one.
  const late = createVault({
    load: () => Promise.resolve(undefined),
    add: (key) => keys.add(key),
  });
  assert.equal(await late.open(sealed, PLACE), PARKED);
});

test("a key store that fails fails the request, loses nothing and is asked again", async () => {
  const keys = new MemoryKeys();
  const sealed = await createVault(keys).seal(PARKED, PLACE);
  keys.fail = true;
  const vault = createVault(keys);
  await assert.rejects(vault.open(sealed, PLACE), /the key store is down/);
  await assert.rejects(vault.seal(PARKED, PLACE), /the key store is down/);
  assert.equal(
    keys.adds,
    1,
    "no key is made in place of one that can't be read",
  );
  keys.fail = false;
  assert.equal(await vault.open(sealed, PLACE), PARKED);
});

test("the key store in IndexedDB keeps one key across starts and never replaces it", async () => {
  const database = freshDatabase();
  const keys = keyStoreIn(database);
  assert.equal(await keys.load(), undefined);
  const vault = createVault(keys);
  const sealed = await vault.seal(PARKED, PLACE);
  const stored = (await keys.load()) as CryptoKey;
  assert.ok(stored instanceof CryptoKey);
  assert.equal(stored.extractable, false);
  // Another key is never stored over the one that sealed the accounts.
  const other = await globalThis.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  assert.notEqual(await keys.add(other), other);
  // The service worker starts again: a new connection finds the same key.
  const restarted = createVault(keyStoreIn(database));
  assert.equal(await restarted.open(sealed, PLACE), PARKED);
});

test("a value in the key table that is no key counts as none, and the next key replaces it", async () => {
  const database = freshDatabase();
  await keyStoreIn(database).load();
  await new Promise<void>((resolve) => {
    const request = database.open(KEY_DATABASE, 1);
    request.onsuccess = () => {
      const transaction = request.result.transaction(KEY_TABLE, "readwrite");
      transaction.objectStore(KEY_TABLE).put("garbled", ACCOUNTS_KEY_NAME);
      transaction.oncomplete = () => {
        request.result.close();
        resolve();
      };
    };
  });
  const keys = keyStoreIn(database);
  assert.equal(await keys.load(), undefined);
  const vault = createVault(keys);
  assert.equal(
    await vault.open(await vault.seal(PARKED, PLACE), PLACE),
    PARKED,
  );
  assert.ok((await keys.load()) instanceof CryptoKey);
});

test("the vault opens nothing after the IndexedDB of the extension was cleared", async () => {
  const sealed = await createVault(keyStoreIn(freshDatabase())).seal(
    PARKED,
    PLACE,
  );
  assert.equal(
    await createVault(keyStoreIn(freshDatabase())).open(sealed, PLACE),
    null,
  );
});

test("the key store in IndexedDB fails where the database can't be used", async () => {
  // A later version upgraded the database, and this one can't open it.
  const upgraded = freshDatabase();
  await new Promise<void>((resolve) => {
    const request = upgraded.open(KEY_DATABASE, 2);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(KEY_TABLE);
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
  });
  await assert.rejects(keyStoreIn(upgraded).load(), { name: "VersionError" });
  // A database of this name without the table of the keys.
  const empty = freshDatabase();
  await new Promise<void>((resolve) => {
    const request = empty.open(KEY_DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("other");
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
  });
  await assert.rejects(keyStoreIn(empty).load(), { name: "NotFoundError" });
  // A value that the database can't keep aborts the transaction.
  const keys = keyStoreIn(freshDatabase());
  await assert.rejects(keys.add((() => {}) as unknown as CryptoKey), {
    name: "AbortError",
  });
  assert.equal(await keys.load(), undefined);
});
