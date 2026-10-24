/**
 * The accounts the extension keeps and which of them plays: plain data and the
 * changes to it, without the browser. Nothing here reaches the network or storage.
 *
 * The extension stores the accounts with the version of their format. A value of a
 * version it doesn't know holds parked sessions that can't be made again, since
 * Autodarts rotates its tokens, so `readStored` tells it apart and the store never
 * saves over it (see `storage.ts`).
 */
import type { Identity } from "./autodarts.ts";

/** A username and password a person asked the extension to keep for an account. */
export interface Credentials {
  username: string;
  password: string;
}

export interface Profile extends Identity {
  /**
   * The parked session of the account, or null while the account is signed in on
   * the page (the page then keeps and renews the session) or while it has none.
   */
  token: string | null;
  /** The account has no working session and no way to make one on its own. */
  needsSignIn: boolean;
  /** When the extension last renewed the parked session, in milliseconds, or null. */
  refreshedAt: number | null;
  /**
   * Since when the renewal of the parked session fails because Autodarts can't be
   * reached: the first failure of a row, in milliseconds, or null while it works.
   */
  renewalFailedAt: number | null;
  /** The sign-in the extension may use when a token no longer works, or null. */
  credentials: Credentials | null;
}

export interface State {
  profiles: Profile[];
  /** The account signed in on the page, as far as the extension knows. */
  activeId: string | null;
  /**
   * Until when, in milliseconds, a new sign-in on the page is saved by itself, after
   * "Add account" or the install; null when no account is being added. Only while no
   * account of the extension plays: an account that comes on ends it.
   */
  addingUntil: number | null;
}

/** What the popup shows of an account: everything but its session and password. */
export interface ProfileView extends Identity {
  active: boolean;
  needsSignIn: boolean;
  remembersPassword: boolean;
  /** When the extension last renewed the parked session, or null while none is parked. */
  renewedAt: number | null;
  /** Since when the renewal of the parked session fails, or null while it works or none is parked. */
  renewalFailingSince: number | null;
}

export interface View {
  profiles: ProfileView[];
  /** The page has a session that belongs to no account of the extension yet. */
  unsaved: boolean;
  /** A new sign-in on the page is saved by itself, because an account is being added. */
  adding: boolean;
}

export const EMPTY: State = { profiles: [], activeId: null, addingUntil: null };

/**
 * The version of the format in which the extension stores the accounts. The releases
 * up to 0.2.0 stored the same fields without a version; they count as version 1.
 */
export const STATE_VERSION = 1;

/** The accounts as the extension stores them: the state, with the version of its format. */
export interface StoredState extends State {
  version: typeof STATE_VERSION;
}

/**
 * What a stored value is to this version of the extension: accounts it can read, of
 * which `outdated` says that they are in the format of an earlier version, which the
 * next save brings up to date, or a value it doesn't know, which it must not save over.
 */
export type Stored = { kind: "accounts"; state: State; outdated: boolean } | { kind: "unknown" };

/**
 * Reads the stored value of the accounts. Nothing stored yet is no account; a value of
 * a newer version, or one that is no state at all, is unknown and kept as it is.
 */
export function readStored(stored: unknown): Stored {
  if (stored === undefined) {
    return { kind: "accounts", state: EMPTY, outdated: false };
  }
  if (typeof stored !== "object" || stored === null || !Array.isArray((stored as Record<string, unknown>).profiles)) {
    return { kind: "unknown" };
  }
  const { version } = stored as Record<string, unknown>;
  if (version !== undefined && version !== STATE_VERSION) {
    return { kind: "unknown" };
  }
  return { kind: "accounts", state: parseState(stored), outdated: version === undefined };
}

/** What the extension stores of the accounts: the state, with the version of its format. */
export function toStored(state: State): StoredState {
  return { version: STATE_VERSION, ...state };
}

/** Reads a stored state, and starts empty from anything it doesn't recognise. */
export function parseState(stored: unknown): State {
  if (typeof stored !== "object" || stored === null) {
    return EMPTY;
  }
  const { profiles, activeId, addingUntil } = stored as Record<string, unknown>;
  if (!Array.isArray(profiles)) {
    return EMPTY;
  }
  // Each account once: of two stored profiles with the same id, the first one counts.
  const seen = new Set<string>();
  const parsed = profiles.flatMap((entry: unknown) => {
    const profile = parseProfile(entry);
    if (profile === null || seen.has(profile.id)) {
      return [];
    }
    seen.add(profile.id);
    return [profile];
  });
  const active = typeof activeId === "string" && parsed.some((profile) => profile.id === activeId);
  // Adding an account ends once one plays, so a stored window beside a player is stale.
  const adding = !active && typeof addingUntil === "number" && Number.isFinite(addingUntil);
  return {
    profiles: parsed,
    activeId: active ? (activeId as string) : null,
    addingUntil: adding ? (addingUntil as number) : null,
  };
}

function parseProfile(entry: unknown): Profile | null {
  if (typeof entry !== "object" || entry === null) {
    return null;
  }
  const value = entry as Record<string, unknown>;
  const { id, username, name } = value;
  if (typeof id !== "string" || id === "" || typeof username !== "string" || typeof name !== "string") {
    return null;
  }
  return {
    id,
    username,
    name,
    picture: typeof value.picture === "string" ? value.picture : null,
    token: typeof value.token === "string" && value.token !== "" ? value.token : null,
    needsSignIn: value.needsSignIn === true,
    refreshedAt: typeof value.refreshedAt === "number" ? value.refreshedAt : null,
    renewalFailedAt: typeof value.renewalFailedAt === "number" ? value.renewalFailedAt : null,
    credentials: parseCredentials(value.credentials),
  };
}

function parseCredentials(value: unknown): Credentials | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { username, password } = value as Record<string, unknown>;
  if (typeof username !== "string" || username === "" || typeof password !== "string" || password === "") {
    return null;
  }
  return { username, password };
}

export function find(state: State, id: string): Profile | undefined {
  return state.profiles.find((profile) => profile.id === id);
}

function write(state: State, profile: Profile): State["profiles"] {
  const others = state.profiles.filter((existing) => existing.id !== profile.id);
  return [...others, profile].sort(
    (a, b) => a.username.localeCompare(b.username) || a.id.localeCompare(b.id),
  );
}

/** Updates the account's name and picture, keeping its session and credentials. */
function merge(state: State, identity: Identity): Profile {
  const existing = find(state, identity.id);
  return {
    ...identity,
    token: existing?.token ?? null,
    needsSignIn: existing?.needsSignIn ?? false,
    refreshedAt: existing?.refreshedAt ?? null,
    renewalFailedAt: existing?.renewalFailedAt ?? null,
    credentials: existing?.credentials ?? null,
  };
}

/** Parks a renewed session with its account, which joins the extension if it is new. */
export function park(state: State, identity: Identity, token: string, now: number): State {
  const profile = fresh(merge(state, identity), token, now);
  return {
    ...state,
    profiles: write(state, profile),
    activeId: state.activeId === identity.id ? null : state.activeId,
  };
}

/** Parks a raw token the extension already holds, under an account it already knows. */
export function stash(state: State, id: string, token: string, now: number): State {
  const profile = find(state, id);
  if (profile === undefined) {
    return state;
  }
  return {
    ...state,
    profiles: write(state, fresh(profile, token, now)),
  };
}

/** The account with a session that was just made, so its renewal works again. */
function fresh(profile: Profile, token: string, now: number): Profile {
  return { ...profile, token, needsSignIn: false, refreshedAt: now, renewalFailedAt: null };
}

/**
 * The renewal of the account's parked session could not reach Autodarts. The session
 * stays parked for the next try; the account keeps when the failures began.
 */
export function failRenewal(state: State, id: string, now: number): State {
  const profile = find(state, id);
  if (profile === undefined || profile.renewalFailedAt !== null) {
    return state;
  }
  return { ...state, profiles: write(state, { ...profile, renewalFailedAt: now }) };
}

/** Records the account, with no session of its own, as the one signed in on the page. */
export function setActive(state: State, identity: Identity): State {
  const profile: Profile = { ...merge(state, identity), token: null, needsSignIn: false, renewalFailedAt: null };
  return { profiles: write(state, profile), activeId: identity.id, addingUntil: null };
}

/**
 * The account plays: its parked session moves to the page, which keeps it from now on.
 * An account being added is then no longer waited for.
 */
export function activate(state: State, id: string): State {
  const profile = find(state, id);
  if (profile === undefined) {
    return state;
  }
  const playing: Profile = { ...profile, token: null, needsSignIn: false, renewalFailedAt: null };
  return { profiles: write(state, playing), activeId: id, addingUntil: null };
}

/** The session of the account has ended, and it needs a new one before it can play. */
export function endSession(state: State, id: string): State {
  const profile = find(state, id);
  if (profile === undefined) {
    return state;
  }
  return {
    ...state,
    profiles: write(state, { ...profile, token: null, needsSignIn: true, refreshedAt: null, renewalFailedAt: null }),
    activeId: state.activeId === id ? null : state.activeId,
  };
}

/** No account of the extension is signed in on the page. */
export function deactivate(state: State): State {
  return { ...state, activeId: null };
}

/**
 * Waits for a new account until the given time: the next session that the page signs in
 * with is then saved by itself. Only while no account of the extension plays.
 */
export function startAdding(state: State, until: number): State {
  return state.activeId === null ? { ...state, addingUntil: until } : state;
}

/** No longer waits for a new account. */
export function stopAdding(state: State): State {
  return { ...state, addingUntil: null };
}

/** Whether a new sign-in on the page is saved by itself at the given time. */
export function isAdding(state: State, now: number): boolean {
  return state.addingUntil !== null && now < state.addingUntil;
}

export function forget(state: State, id: string): State {
  return {
    ...state,
    profiles: state.profiles.filter((profile) => profile.id !== id),
    activeId: state.activeId === id ? null : state.activeId,
  };
}

/** Keeps a sign-in for the account, used when a token no longer works. */
export function rememberCredentials(state: State, id: string, credentials: Credentials): State {
  const profile = find(state, id);
  if (profile === undefined) {
    return state;
  }
  return { ...state, profiles: write(state, { ...profile, credentials }) };
}

/** Drops the stored sign-in of the account. */
export function forgetCredentials(state: State, id: string): State {
  const profile = find(state, id);
  if (profile === undefined) {
    return state;
  }
  return { ...state, profiles: write(state, { ...profile, credentials: null }) };
}

/** The accounts whose parked session the extension renews by itself. */
export function parked(state: State): Profile[] {
  return state.profiles.filter((profile) => profile.token !== null && profile.id !== state.activeId);
}

export function toView(state: State, pageHasSession: boolean, now: number): View {
  const renewing = new Set(parked(state).map((profile) => profile.id));
  return {
    profiles: state.profiles.map((profile) => ({
      id: profile.id,
      username: profile.username,
      name: profile.name,
      picture: profile.picture,
      needsSignIn: profile.needsSignIn,
      remembersPassword: profile.credentials !== null,
      active: profile.id === state.activeId,
      // The page renews the session of the account that plays; only a parked one is ours.
      renewedAt: renewing.has(profile.id) ? profile.refreshedAt : null,
      renewalFailingSince: renewing.has(profile.id) ? profile.renewalFailedAt : null,
    })),
    unsaved: pageHasSession && state.activeId === null,
    adding: isAdding(state, now),
  };
}
