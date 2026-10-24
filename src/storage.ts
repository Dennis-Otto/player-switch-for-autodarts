/**
 * Where the extension keeps the accounts: one value in the storage of the browser,
 * in the format of `state.ts`, with its version. The service worker passes in
 * `chrome.storage.local`, a test a fake.
 *
 * Autodarts rotates its tokens, so a parked session that is lost can't be made again.
 * A stored value that this version doesn't know, such as one that a newer version
 * wrote before the extension went back to an older one, is therefore never saved
 * over: the store keeps a copy of it under BACKUP_KEY, and every reading and change of
 * the accounts fails with UnknownStateError, until a version that knows it is back.
 */
import { EMPTY, readStored, type State, toStored } from "./state.ts";
import type { Store } from "./switch.ts";

/** The key of the accounts in the storage of the browser. */
export const ACCOUNTS_KEY = "accounts";
/** The key of the copy of a stored value of the accounts that this version doesn't know. */
export const BACKUP_KEY = "accounts.backup";

/** What the store needs of `chrome.storage.local`. */
export interface StorageArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

/** The stored accounts are in a format that this version of the extension doesn't know. */
export class UnknownStateError extends Error {
  constructor() {
    super("The saved accounts are in a format that this version of the extension doesn't know.");
    this.name = "UnknownStateError";
  }
}

export interface AccountStore extends Store {
  /** Brings accounts of an earlier format up to date; true when it stored them anew. */
  migrate(): Promise<boolean>;
}

export function createStore(area: StorageArea): AccountStore {
  /** The stored accounts, or UnknownStateError, after it kept a copy of the value. */
  async function read(): Promise<{ state: State; outdated: boolean }> {
    const data = await area.get([ACCOUNTS_KEY, BACKUP_KEY]);
    const stored = readStored(data[ACCOUNTS_KEY]);
    if (stored.kind === "unknown") {
      // The copy is written once, and again only when the value changed since.
      if (JSON.stringify(data[ACCOUNTS_KEY]) !== JSON.stringify(data[BACKUP_KEY])) {
        await area.set({ [BACKUP_KEY]: data[ACCOUNTS_KEY] });
      }
      throw new UnknownStateError();
    }
    return stored;
  }

  return {
    async load() {
      return (await read()).state;
    },
    async save(state) {
      // Never over a value that this version doesn't know.
      await read();
      await area.set({ [ACCOUNTS_KEY]: toStored(state) });
    },
    async migrate() {
      const { state, outdated } = await read();
      if (outdated) {
        await area.set({ [ACCOUNTS_KEY]: toStored(state) });
      }
      return outdated;
    },
  };
}

/**
 * The accounts in what the storage of the browser holds, only to show them, as the
 * button in the page does: none while their format is unknown.
 */
export function accountsIn(data: Record<string, unknown>): State {
  const stored = readStored(data[ACCOUNTS_KEY]);
  return stored.kind === "accounts" ? stored.state : EMPTY;
}
