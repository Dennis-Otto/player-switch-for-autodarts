/**
 * The accounts the extension keeps and which of them plays: plain data and the
 * changes to it, without the browser. Nothing here reaches the network or storage.
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
  /** The sign-in the extension may use when a token no longer works, or null. */
  credentials: Credentials | null;
}

export interface State {
  profiles: Profile[];
  /** The account signed in on the page, as far as the extension knows. */
  activeId: string | null;
}

/** What the popup shows of an account: everything but its session and password. */
export interface ProfileView extends Identity {
  active: boolean;
  needsSignIn: boolean;
  remembersPassword: boolean;
}

export interface View {
  profiles: ProfileView[];
  /** The page has a session that belongs to no account of the extension yet. */
  unsaved: boolean;
}

export const EMPTY: State = { profiles: [], activeId: null };

/** Reads a stored state, and starts empty from anything it doesn't recognise. */
export function parseState(stored: unknown): State {
  if (typeof stored !== "object" || stored === null) {
    return EMPTY;
  }
  const { profiles, activeId } = stored as Record<string, unknown>;
  if (!Array.isArray(profiles)) {
    return EMPTY;
  }
  const parsed = profiles.flatMap((entry: unknown) => {
    const profile = parseProfile(entry);
    return profile === null ? [] : [profile];
  });
  const active = typeof activeId === "string" && parsed.some((profile) => profile.id === activeId);
  return { profiles: parsed, activeId: active ? (activeId as string) : null };
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
    credentials: existing?.credentials ?? null,
  };
}

/** Parks a renewed session with its account, which joins the extension if it is new. */
export function park(state: State, identity: Identity, token: string, now: number): State {
  const profile: Profile = { ...merge(state, identity), token, needsSignIn: false, refreshedAt: now };
  return { profiles: write(state, profile), activeId: state.activeId === identity.id ? null : state.activeId };
}

/** Parks a raw token the extension already holds, under an account it already knows. */
export function stash(state: State, id: string, token: string, now: number): State {
  const profile = find(state, id);
  if (profile === undefined) {
    return state;
  }
  return {
    ...state,
    profiles: write(state, { ...profile, token, needsSignIn: false, refreshedAt: now }),
  };
}

/** Records the account, with no session of its own, as the one signed in on the page. */
export function setActive(state: State, identity: Identity): State {
  const profile: Profile = { ...merge(state, identity), token: null, needsSignIn: false };
  return { profiles: write(state, profile), activeId: identity.id };
}

/** The account plays: its parked session moves to the page, which keeps it from now on. */
export function activate(state: State, id: string): State {
  const profile = find(state, id);
  if (profile === undefined) {
    return state;
  }
  return { profiles: write(state, { ...profile, token: null, needsSignIn: false }), activeId: id };
}

/** The session of the account has ended, and it needs a new one before it can play. */
export function endSession(state: State, id: string): State {
  const profile = find(state, id);
  if (profile === undefined) {
    return state;
  }
  return {
    profiles: write(state, { ...profile, token: null, needsSignIn: true, refreshedAt: null }),
    activeId: state.activeId === id ? null : state.activeId,
  };
}

/** No account of the extension is signed in on the page. */
export function deactivate(state: State): State {
  return { ...state, activeId: null };
}

export function forget(state: State, id: string): State {
  return {
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

export function toView(state: State, pageHasSession: boolean): View {
  return {
    profiles: state.profiles.map((profile) => ({
      id: profile.id,
      username: profile.username,
      name: profile.name,
      picture: profile.picture,
      needsSignIn: profile.needsSignIn,
      remembersPassword: profile.credentials !== null,
      active: profile.id === state.activeId,
    })),
    unsaved: pageHasSession && state.activeId === null,
  };
}
