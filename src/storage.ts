/**
 * Where the extension keeps the accounts: one value in the storage of the browser,
 * in the format of `state.ts`, with its version, and each session and password in it
 * sealed by the vault. The service worker passes in `chrome.storage.local` and the
 * vault, a test fakes of the storage and of the key store.
 *
 * Autodarts rotates its tokens, so a parked session that is lost can't be made again.
 * A stored value that this version doesn't know, such as one that a newer version
 * wrote before the extension went back to an older one, is therefore never saved
 * over: the store keeps a copy of it under BACKUP_KEY, and every reading and change of
 * the accounts fails with UnknownStateError, until a version that knows it is back.
 * As soon as the stored value is one this version reads again, the copy is deleted.
 *
 * Accounts of the format before, with the secrets in plain text, are sealed at the
 * first reading, and so are accounts whose secrets no longer open, because the key of
 * the vault is gone: those need to sign in again, and the next reading finds them so.
 * A reading runs in the queue of `switch.ts` like every change, so it may save.
 */
import {
  EMPTY,
  endSession,
  type Profile,
  parseCredentials,
  readStored,
  type SealedSecrets,
  type State,
  type Stored,
  toStored,
} from "./state.ts";
import type { Store } from "./switch.ts";
import type { Vault } from "./vault.ts";

/** The key of the accounts in the storage of the browser. */
export const ACCOUNTS_KEY = "accounts";
/** The key of the copy of a stored value of the accounts that this version doesn't know. */
export const BACKUP_KEY = "accounts.backup";

/** What the store needs of `chrome.storage.local`. */
export interface StorageArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

/** The stored accounts are in a format that this version of the extension doesn't know. */
export class UnknownStateError extends Error {
  constructor() {
    super(
      "The saved accounts are in a format that this version of the extension doesn't know.",
    );
    this.name = "UnknownStateError";
  }
}

export interface AccountStore extends Store {
  /** Brings accounts of an earlier format up to date; true when it stored them anew. */
  migrate(): Promise<boolean>;
}

/** Where a secret of an account is sealed: its field and the id of the account. */
export function placeOf(field: keyof SealedSecrets, id: string): string {
  return `${field}/${id}`;
}

export function createStore(area: StorageArea, vault: Vault): AccountStore {
  /** The stored value, or UnknownStateError, after it kept a copy of the value. */
  async function readKnown(): Promise<Exclude<Stored, { kind: "unknown" }>> {
    const data = await area.get([ACCOUNTS_KEY, BACKUP_KEY]);
    const stored = readStored(data[ACCOUNTS_KEY]);
    if (stored.kind === "unknown") {
      // The copy is written once, and again only when the value changed since.
      if (
        JSON.stringify(data[ACCOUNTS_KEY]) !== JSON.stringify(data[BACKUP_KEY])
      ) {
        await area.set({ [BACKUP_KEY]: data[ACCOUNTS_KEY] });
      }
      throw new UnknownStateError();
    }
    if (BACKUP_KEY in data) {
      // A value that this version reads was saved after the copy, so it supersedes the
      // copy. The copy may hold tokens and passwords of accounts removed since, so it
      // goes: a removed account leaves nothing behind. Every later version keeps this rule.
      await area.remove([BACKUP_KEY]);
    }
    return stored;
  }

  /** The stored accounts with their secrets, and whether they must be stored anew. */
  async function read(): Promise<{ state: State; outdated: boolean }> {
    const stored = await readKnown();
    if (stored.kind === "plain") {
      return { state: stored.state, outdated: true };
    }
    const profiles: Profile[] = [];
    const ended: string[] = [];
    let outdated = false;
    for (const profile of stored.state.profiles) {
      const sealed = stored.secrets.get(profile.id) as SealedSecrets;
      const token =
        sealed.token === null
          ? null
          : await vault.open(sealed.token, placeOf("token", profile.id));
      const credentials =
        sealed.credentials === null
          ? null
          : parseCredentials(
              parseJson(
                await vault.open(
                  sealed.credentials,
                  placeOf("credentials", profile.id),
                ),
              ),
            );
      profiles.push({ ...profile, token, credentials });
      // A secret that doesn't open is gone: a session that is lost has ended, so the
      // account has to sign in again; a password that is lost is no longer remembered.
      const sessionLost = sealed.token !== null && token === null;
      const passwordLost = sealed.credentials !== null && credentials === null;
      if (sessionLost) {
        ended.push(profile.id);
      }
      outdated ||= sessionLost || passwordLost;
    }
    let state: State = { ...stored.state, profiles };
    for (const id of ended) {
      state = endSession(state, id);
    }
    return { state, outdated };
  }

  /** Seals the secrets of every account and stores the accounts. */
  async function write(state: State): Promise<void> {
    const secrets = new Map<string, SealedSecrets>();
    for (const profile of state.profiles) {
      secrets.set(profile.id, {
        token:
          profile.token === null
            ? null
            : await vault.seal(profile.token, placeOf("token", profile.id)),
        credentials:
          profile.credentials === null
            ? null
            : await vault.seal(
                JSON.stringify(profile.credentials),
                placeOf("credentials", profile.id),
              ),
      });
    }
    await area.set({ [ACCOUNTS_KEY]: toStored(state, secrets) });
  }

  /** Reads the accounts, and stores them anew when they are outdated. */
  async function bringUpToDate(): Promise<{
    state: State;
    outdated: boolean;
  }> {
    const current = await read();
    if (current.outdated) {
      await write(current.state);
    }
    return current;
  }

  return {
    async load() {
      return (await bringUpToDate()).state;
    },
    async save(state) {
      // Never over a value that this version doesn't know.
      await readKnown();
      await write(state);
    },
    async migrate() {
      return (await bringUpToDate()).outdated;
    },
  };
}

/** The value of a JSON text, or null when there is none or it is no JSON. */
function parseJson(text: string | null): unknown {
  if (text === null) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * The accounts in what the storage of the browser holds, only to show them, as the
 * button in the page does: without their sessions and passwords, which stay sealed,
 * and none while their format is unknown.
 */
export function accountsIn(data: Record<string, unknown>): State {
  const stored = readStored(data[ACCOUNTS_KEY]);
  if (stored.kind === "unknown") {
    return EMPTY;
  }
  return {
    ...stored.state,
    profiles: stored.state.profiles.map((profile) => ({
      ...profile,
      token: null,
      credentials: null,
    })),
  };
}
