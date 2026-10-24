/**
 * Switching accounts, with the side effects passed in. The extension provides the
 * real page, storage, clock and `fetch`; a test provides fakes. So every path here
 * runs without a browser.
 *
 * The one rule that shapes this file: Autodarts rotates the refresh token, so the
 * token in the page belongs to the page. The extension reads it only to park it
 * when switching away, and writes a token only when a different account takes over.
 * It never renews the token that is live in the page behind the page's back.
 *
 * And because a token works only once, every operation here runs in the queue of
 * `deps.queue`, one at a time, and loads the accounts only when its turn has come:
 * a double tap or the background renewal can't spend a token twice or save over the
 * work of another.
 */
import {
  type AuthError,
  type Fetch,
  type Session,
  readIdentity,
  refreshSession,
  signIn,
} from "./autodarts.ts";
import type { Queue } from "./queue.ts";
import {
  activate,
  deactivate,
  endSession,
  find,
  park,
  parked,
  type Profile,
  type State,
  stash,
  toView,
  type View,
} from "./state.ts";

/** The session in the page, where the Autodarts app reads and writes it. */
export interface PagePort {
  readToken(): Promise<string | null>;
  writeToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
}

/** Where the extension keeps the accounts between sessions. */
export interface Store {
  load(): Promise<State>;
  save(state: State): Promise<void>;
}

export interface Deps {
  fetcher: Fetch;
  page: PagePort;
  store: Store;
  now: () => number;
  /** Runs the operations that read or change the accounts one at a time. */
  queue: Queue;
}

/**
 * The outcome of trying to make a session for an account: a fresh one, a refusal
 * that won't pass (the account must sign in again), or a problem that may pass.
 */
type Renewal =
  | { kind: "ok"; session: Session }
  | { kind: "rejected" }
  | { kind: "unreachable" };

async function commit(deps: Deps, state: State): Promise<State> {
  await deps.store.save(state);
  return state;
}

/** Turns a sign-in request into a renewal outcome. Only AuthError is ever thrown here. */
async function attempt(request: Promise<Session>): Promise<Renewal | null> {
  try {
    return { kind: "ok", session: await request };
  } catch (error) {
    // A problem that may pass is reported as such; a refusal falls through so the
    // next way of signing in can be tried.
    return (error as AuthError).kind === "unreachable" ? { kind: "unreachable" } : null;
  }
}

/**
 * Makes a fresh session for an account: from its parked token, or, when that no
 * longer works, from its stored sign-in.
 */
async function renew(deps: Deps, profile: Profile): Promise<Renewal> {
  if (profile.token !== null) {
    const result = await attempt(refreshSession(deps.fetcher, profile.token));
    if (result !== null) {
      return result;
    }
  }
  if (profile.credentials !== null) {
    const result = await attempt(
      signIn(deps.fetcher, profile.credentials.username, profile.credentials.password),
    );
    if (result !== null) {
      return result;
    }
  }
  return { kind: "rejected" };
}

/**
 * Reflects, without the network, whether a session is in the page. When the active
 * account's session has vanished (a sign-out in the page), it is marked as needing
 * a new one.
 */
export function syncFromPage(deps: Deps): Promise<State> {
  return deps.queue(async () => {
    const state = await deps.store.load();
    const token = await deps.page.readToken();
    if (token !== null) {
      return state;
    }
    if (state.activeId === null) {
      return state;
    }
    return commit(deps, endSession(state, state.activeId));
  });
}

/**
 * What the popup shows: the saved accounts, and whether a session is in the page. A
 * missing page simply counts as no session there.
 */
export function readView(deps: Deps): Promise<View> {
  return deps.queue(async () => {
    const state = await deps.store.load();
    const hasSession = await deps.page.readToken().then(
      (token) => token !== null,
      () => false,
    );
    return toView(state, hasSession);
  });
}

/**
 * Changes the saved accounts without the page or the network, such as remembering a
 * password or removing an account.
 */
export function edit(deps: Deps, change: (state: State) => State): Promise<State> {
  return deps.queue(async () => commit(deps, change(await deps.store.load())));
}

/**
 * Claims the session currently signed in on the page as an account of the
 * extension. Because reading who it is rotates the token, the fresh token is
 * written straight back, so the page stays signed in.
 */
export function adoptCurrentSession(deps: Deps): Promise<State> {
  return deps.queue(() => adopt(deps));
}

async function adopt(deps: Deps): Promise<State> {
  let state = await deps.store.load();
  const token = await deps.page.readToken();
  if (token === null) {
    return commit(deps, deactivate(state));
  }
  let session: Session;
  try {
    session = await refreshSession(deps.fetcher, token);
  } catch (error) {
    if ((error as AuthError).kind === "rejected") {
      await deps.page.clearToken();
      return commit(deps, deactivate(state));
    }
    throw error;
  }
  // The page's token is spent now: keep the fresh one before the page can fail.
  const identity = readIdentity(session.accessToken);
  state = await commit(deps, park(state, identity, session.refreshToken, deps.now()));
  await deps.page.writeToken(session.refreshToken);
  return commit(deps, activate(state, identity.id));
}

/** How a switch ended, for the popup to show. */
export interface SwitchResult {
  state: State;
  /** False when the account could not be brought onto the page. */
  ok: boolean;
  /** Why it failed: the account must sign in again, or Autodarts was unreachable. */
  reason?: "signin" | "unreachable";
}

/**
 * Brings an account onto the page. The account playing now, if any, keeps its
 * session parked, so a tap can bring it back without a new sign-in. A second tap on
 * the same account waits for the first and then finds it playing, so it spends no
 * token.
 */
export function switchTo(deps: Deps, id: string): Promise<SwitchResult> {
  return deps.queue(() => bringOn(deps, id));
}

async function bringOn(deps: Deps, id: string): Promise<SwitchResult> {
  let state = await deps.store.load();
  const target = find(state, id);
  if (target === undefined || state.activeId === id) {
    return { state, ok: true };
  }
  // Reading the page first: without a page, the switch fails before a token is spent.
  const outgoing = await deps.page.readToken();
  const renewal = await renew(deps, target);
  if (renewal.kind === "unreachable") {
    return { state, ok: false, reason: "unreachable" };
  }
  if (renewal.kind === "rejected") {
    return { state: await commit(deps, endSession(state, id)), ok: false, reason: "signin" };
  }
  // The old token is spent now: keep the fresh one before the page can fail.
  const identity = readIdentity(renewal.session.accessToken);
  state = await commit(deps, park(state, identity, renewal.session.refreshToken, deps.now()));
  if (outgoing !== null && state.activeId !== null) {
    state = stash(state, state.activeId, outgoing, deps.now());
  }
  await deps.page.writeToken(renewal.session.refreshToken);
  return { state: await commit(deps, activate(state, identity.id)), ok: true };
}

/**
 * Signs the page out so that a new account can sign in. The account playing now
 * keeps its session parked first, so it is not lost.
 */
export function signOutForNewAccount(deps: Deps): Promise<State> {
  return deps.queue(() => signOut(deps));
}

async function signOut(deps: Deps): Promise<State> {
  let state = await deps.store.load();
  const outgoing = await deps.page.readToken();
  if (outgoing !== null && state.activeId !== null) {
    // Keep the session before the page lets go of it.
    state = await commit(deps, stash(state, state.activeId, outgoing, deps.now()));
  }
  await deps.page.clearToken();
  return commit(deps, deactivate(state));
}

/**
 * Keeps every parked session fresh, so a stored account can play at any time. An
 * account whose token has died and that has no stored sign-in is marked as needing
 * one; a temporary problem leaves the account untouched for the next run.
 *
 * Each account takes a turn of its own in the queue, so a tap waits for one renewal at
 * most, and each fresh token is saved as soon as it arrives.
 */
export async function refreshParked(deps: Deps): Promise<State> {
  let state = await deps.queue(() => deps.store.load());
  for (const { id } of parked(state)) {
    state = await deps.queue(() => refreshOne(deps, id));
  }
  return state;
}

async function refreshOne(deps: Deps, id: string): Promise<State> {
  const state = await deps.store.load();
  // A switch may have run since the list was made: renew only what is still parked.
  const profile = parked(state).find((candidate) => candidate.id === id);
  if (profile === undefined) {
    return state;
  }
  const renewal = await renew(deps, profile);
  if (renewal.kind === "ok") {
    return commit(deps, stash(state, id, renewal.session.refreshToken, deps.now()));
  }
  if (renewal.kind === "rejected") {
    return commit(deps, endSession(state, id));
  }
  return state;
}
