/**
 * Seals the secrets of the saved accounts: the parked session of each player and a
 * remembered password. Each is encrypted with AES-GCM under a key of 256 bits that the
 * service worker makes once and keeps in the IndexedDB of the extension, as a
 * `CryptoKey` that can't be exported: the browser uses it, but no script ever sees its
 * bytes, and neither a content script nor a page of another origin reaches that
 * database. `chrome.storage.local` then holds only the sealed text.
 *
 * Each secret is bound to its account and its field (the additional data of AES-GCM),
 * so a sealed value moved to another account or field no longer opens. A value sealed
 * under a key that is gone, such as after the data of the extension was cleared, opens
 * to nothing: the account then has to sign in again, and nothing fails. A key store
 * that can't be read, though, fails the request, so that a passing fault never costs a
 * session.
 *
 * It is defense in depth, not a password manager: someone who can read the profile of
 * the browser on the disk can read the key as well (see docs/security.md).
 *
 * The service worker passes in the key store of `keyStoreIn(indexedDB)`, a test a fake;
 * the encryption is WebCrypto, `globalThis.crypto`, in the browser and in Node alike.
 */
import type { Sealed } from "./state.ts";

/** The key: AES-GCM with 256 bits. */
export const KEY_ALGORITHM = { name: "AES-GCM", length: 256 } as const;
/** The bytes of the random nonce of each sealing, as AES-GCM recommends. */
export const IV_BYTES = 12;

/** Where the vault keeps its key. */
export interface KeyStore {
  /** The stored key, or undefined while there is none. */
  load(): Promise<CryptoKey | undefined>;
  /**
   * Stores the key unless one is stored already, and returns the one stored, so that
   * a key is never replaced and nothing sealed with it is lost.
   */
  add(key: CryptoKey): Promise<CryptoKey>;
}

export interface Vault {
  /** Seals a secret for its place, such as `token/<id>`. */
  seal(secret: string, place: string): Promise<Sealed>;
  /**
   * Opens a sealed secret of the place it was sealed for; null when it doesn't open,
   * because the key that sealed it is gone or the value was changed. Fails only when
   * the key store fails.
   */
  open(sealed: Sealed, place: string): Promise<string | null>;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function createVault(
  keys: KeyStore,
  crypto: Crypto = globalThis.crypto,
): Vault {
  let pending: Promise<CryptoKey> | null = null;

  /** The key, made and stored at the first use; one for every caller at once. */
  function key(): Promise<CryptoKey> {
    if (pending === null) {
      const loading = (async () => {
        const stored = await keys.load();
        if (stored !== undefined) {
          return stored;
        }
        const made = await crypto.subtle.generateKey(KEY_ALGORITHM, false, [
          "encrypt",
          "decrypt",
        ]);
        return keys.add(made);
      })();
      pending = loading;
      // A key store that failed is asked again at the next use.
      loading.catch(() => {
        if (pending === loading) {
          pending = null;
        }
      });
    }
    return pending;
  }

  return {
    async seal(secret, place) {
      const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
      const data = await crypto.subtle.encrypt(
        { name: KEY_ALGORITHM.name, iv, additionalData: encoder.encode(place) },
        await key(),
        encoder.encode(secret),
      );
      return { iv: toBase64(iv), data: toBase64(new Uint8Array(data)) };
    },
    async open(sealed, place) {
      const current = await key();
      const iv = fromBase64(sealed.iv);
      const data = fromBase64(sealed.data);
      if (iv?.length !== IV_BYTES || data === null) {
        return null;
      }
      try {
        const plain = await crypto.subtle.decrypt(
          {
            name: KEY_ALGORITHM.name,
            iv,
            additionalData: encoder.encode(place),
          },
          current,
          data,
        );
        return decoder.decode(plain);
      } catch {
        // Another key, another place or a changed value: AES-GCM refuses all three alike.
        return null;
      }
    },
  };
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** The bytes of a text in base64, or null when it is none. */
function fromBase64(text: string): Uint8Array<ArrayBuffer> | null {
  let binary: string;
  try {
    binary = atob(text);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** The database of the extension that holds the key, and its one table. */
export const KEY_DATABASE = "vault";
export const KEY_TABLE = "keys";
/** The name of the key of the saved accounts in that table. */
export const ACCOUNTS_KEY_NAME = "accounts";

/**
 * The key store in the IndexedDB of the extension's origin, which the service worker
 * passes in as `indexedDB`. Each use opens the database and closes it again, so an
 * upgrade of a later version is never blocked by a connection left open.
 */
export function keyStoreIn(factory: IDBFactory): KeyStore {
  /** Runs one transaction on the table of the keys, and gives what `use` found. */
  function inTable<T>(
    mode: IDBTransactionMode,
    use: (table: IDBObjectStore, found: (value: T) => void) => void,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const request = factory.open(KEY_DATABASE, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(KEY_TABLE);
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        let result: T;
        try {
          const transaction = database.transaction(KEY_TABLE, mode);
          transaction.oncomplete = () => {
            database.close();
            resolve(result);
          };
          // An error aborts the transaction, and its abort says why.
          transaction.onabort = () => {
            database.close();
            reject(transaction.error);
          };
          use(transaction.objectStore(KEY_TABLE), (value) => {
            result = value;
          });
        } catch (error) {
          database.close();
          reject(error);
        }
      };
    });
  }

  return {
    load: () =>
      inTable<CryptoKey | undefined>("readonly", (table, found) => {
        const read = table.get(ACCOUNTS_KEY_NAME);
        read.onsuccess = () => {
          found(read.result instanceof CryptoKey ? read.result : undefined);
        };
      }),
    add: (key) =>
      // One transaction reads and writes, so two that start at once keep one key.
      inTable<CryptoKey>("readwrite", (table, found) => {
        const read = table.get(ACCOUNTS_KEY_NAME);
        read.onsuccess = () => {
          if (read.result instanceof CryptoKey) {
            found(read.result);
            return;
          }
          table.put(key, ACCOUNTS_KEY_NAME);
          found(key);
        };
      }),
  };
}
