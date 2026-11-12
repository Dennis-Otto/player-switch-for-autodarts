/**
 * Switching accounts, with the side effects passed in. The extension provides the
 * real page, storage, clock and `fetch`; a test provides fakes. So every path here
 * runs without a browser.
 *
 * The one rule that shapes this file: Autodarts rotates the refresh token, so the
 * token in the page belongs to the page. The extension reads it only to park it
 * when switching away, and writes a token only when a different account takes over.
 * It never renews the token that is live in the page behind the page's back: only
 * when the token is about to leave the page anyway, to learn whose session it is, or
 * when a person saves the session, and the fresh token then goes straight back.
 *
 * Whose session a token holds, only Autodarts can say: someone may have signed in as
 * another account right in the page, so a session goes to the account that Autodarts
 * names, never simply to the account that played last.
 *
 * And because a token works only once, every operation here runs in the queue of
 * `deps.queue`, one at a time, and loads the accounts only when its turn has come:
 * a double tap or the background renewal can't spend a token twice or save over the
 * work of another.
 *
 * Adding an account needs no second visit to the popup: "Add account" opens a window
 * of ten minutes, and the first session that the page signs in with during it is
 * saved by itself, once. After the window, a sign-in on the page is never saved
 * without a tap.
 *
 * Removing an account ends its session at Autodarts before the extension forgets it,
 * so that no copy of its token, such as in a backup of the browser profile, keeps
 * working; "Forget all accounts" does so for every account and then deletes what else
 * the extension keeps.
 *
 * Joining a lobby seats a parked account at the board of the display with the session
 * that the extension keeps for it, while the page stays with the account that plays
 * there (decision 0016).
 */
import {
  type AuthError,
  type Fetch,
  type Identity,
  type Join,
  joinLobby,
  readIdentity,
  refreshSession,
  revokeSession,
  type Session,
  signIn,
} from "./autodarts.ts";
import type { RunCounts } from "./health.ts";
import type { Queue } from "./queue.ts";
import {
  activate,
  type Credentials,
  deactivate,
  EMPTY,
  endSession,
  failRenewal,
  find,
  forget,
  isAdding,
  loseSession,
  type Profile,
  park,
  rememberCredentials,
  renewable,
  type State,
  startAdding,
  stash,
  stopAdding,
  toView,
  type View,
} from "./state.ts";

/** How long after "Add account" a new sign-in on the page is saved by itself. */
export const ADD_WINDOW_MS = 10 * 60 * 1000;

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
    return (error as AuthError).kind === "unreachable"
      ? { kind: "unreachable" }
      : null;
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
      signIn(
        deps.fetcher,
        profile.credentials.username,
        profile.credentials.password,
      ),
    );
    if (result?.kind === "ok") {
      return ownSession(deps, profile.id, result.session);
    }
    if (result !== null) {
      return result;
    }
  }
  return { kind: "rejected" };
}

/**
 * Lets the session of a stored sign-in count only for the account that stored it. The
 * form takes any username or email, so a sign-in remembered for one tile may belong to
 * another account; kept under the tile, its token would bring the wrong player onto the
 * page or into a lobby, and the next renewal would spend it twice. Such a session ends at
 * once, and the account has to sign in again, as after a refused password.
 */
async function ownSession(
  deps: Deps,
  id: string,
  session: Session,
): Promise<Renewal> {
  const identity = await whose(deps, session);
  if (identity === null) {
    return { kind: "unreachable" };
  }
  if (identity.id !== id) {
    await revokeSession(deps.fetcher, session.refreshToken);
    return { kind: "rejected" };
  }
  return { kind: "ok", session };
}

/**
 * The account of a session that a sign-in just made, or null when Autodarts sent claims
 * that the extension can't read, which may pass with an update. Nobody keeps such a
 * session, so it ends at once.
 */
async function whose(deps: Deps, session: Session): Promise<Identity | null> {
  try {
    return readIdentity(session.accessToken);
  } catch {
    await revokeSession(deps.fetcher, session.refreshToken);
    return null;
  }
}

/**
 * How "Remember password" ended: the sign-in is kept, or Autodarts refused the username
 * or the password ("password"), they sign in another account than the tile's
 * ("otherAccount"), or Autodarts couldn't be reached to check them ("unreachable"). A
 * sign-in that isn't kept changes nothing.
 */
export type Remembering =
  | { state: State; ok: true; reason?: undefined }
  | {
      state: State;
      ok: false;
      reason: "password" | "otherAccount" | "unreachable";
    };

/**
 * Remembers the sign-in of an account after signing in with it once, so that a typo
 * shows now and not weeks later, when the session has ended and the sign-in is needed.
 * The session of that sign-in isn't wasted: an account that waits keeps it as its fresh
 * session, which also ends "Sign in again", and the session that it held before ends at
 * Autodarts. The account that plays has its session in the page, so the new one ends.
 */
export function rememberPassword(
  deps: Deps,
  id: string,
  credentials: Credentials,
): Promise<Remembering> {
  return deps.queue(async () => {
    const state = await deps.store.load();
    const profile = find(state, id);
    if (profile === undefined) {
      return { state, ok: true };
    }
    let session: Session;
    try {
      session = await signIn(
        deps.fetcher,
        credentials.username,
        credentials.password,
      );
    } catch (error) {
      // signIn throws nothing but AuthError.
      return {
        state,
        ok: false,
        reason:
          (error as AuthError).kind === "rejected" ? "password" : "unreachable",
      };
    }
    const identity = await whose(deps, session);
    if (identity === null) {
      return { state, ok: false, reason: "unreachable" };
    }
    if (identity.id !== id) {
      await revokeSession(deps.fetcher, session.refreshToken);
      return { state, ok: false, reason: "otherAccount" };
    }
    const remembered = rememberCredentials(state, id, credentials);
    if (state.activeId === id) {
      const saved = await commit(deps, remembered);
      await revokeSession(deps.fetcher, session.refreshToken);
      return { state: saved, ok: true };
    }
    // The new session is kept before the old one ends, so the account always has one.
    const saved = await commit(
      deps,
      park(remembered, identity, session.refreshToken, deps.now()),
    );
    if (profile.token !== null) {
      await revokeSession(deps.fetcher, profile.token);
    }
    return { state: saved, ok: true };
  });
}

/**
 * Reflects, without the network, whether a session is in the page. When the active
 * account's session has vanished (a sign-out in the page), it no longer plays: an
 * account that remembers its password stays ready, since the next renewal or tap signs
 * it in with it, and one without is marked as needing a new sign-in.
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
    return commit(deps, loseSession(state, state.activeId));
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
    return toView(state, hasSession, deps.now());
  });
}

/**
 * Changes the saved accounts without the page or the network, such as remembering a
 * password or removing an account.
 */
export function edit(
  deps: Deps,
  change: (state: State) => State,
): Promise<State> {
  return deps.queue(async () => commit(deps, change(await deps.store.load())));
}

/**
 * Claims the session currently signed in on the page as an account of the
 * extension. Because reading who it is rotates the token, the fresh token is
 * written straight back, so the page stays signed in.
 */
export function adoptCurrentSession(deps: Deps): Promise<State> {
  return deps.queue(async () => {
    const state = await deps.store.load();
    const token = await deps.page.readToken();
    if (token === null) {
      return commit(deps, deactivate(state));
    }
    return (await claim(deps, state, token)).state;
  });
}

/**
 * Saves the account of a session in the page and lets it play on. Because reading who
 * it is rotates the token, the fresh token is written straight back. A session that
 * Autodarts turns away leaves the page; `identity` is then null.
 */
async function claim(
  deps: Deps,
  loaded: State,
  token: string,
): Promise<{ state: State; identity: Identity | null }> {
  let session: Session;
  try {
    session = await refreshSession(deps.fetcher, token);
  } catch (error) {
    if ((error as AuthError).kind === "rejected") {
      if ((await deps.page.readToken()) !== token) {
        // The page renewed the token while it was read, so Autodarts turned the old one
        // away: the page holds a fresh session, which must stay.
        return { state: loaded, identity: null };
      }
      await deps.page.clearToken();
      return { state: await commit(deps, deactivate(loaded)), identity: null };
    }
    throw error;
  }
  // The page's token is spent now: keep the fresh one before the page can fail.
  const identity = readIdentity(session.accessToken);
  const state = await commit(
    deps,
    park(loaded, identity, session.refreshToken, deps.now()),
  );
  await deps.page.writeToken(session.refreshToken);
  return { state: await commit(deps, activate(state, identity.id)), identity };
}

/**
 * What became of a page that finished loading: the new account it signed in with was
 * saved, an account is being added but no session is there to save yet, or no account
 * is being added.
 */
export type PickUp =
  | { kind: "saved"; state: State; identity: Identity }
  | { kind: "waiting"; state: State }
  | { kind: "idle"; state: State };

/**
 * Saves the session that a new account signed in with on the page, while an account is
 * being added: the service worker asks each time an Autodarts page has finished
 * loading. Outside the window it changes nothing and spends no token, so a sign-in
 * later on is never saved by itself; a window that has run out is closed for good.
 *
 * Inside the window, `ready` runs first and says whether the page may be read now: the
 * service worker waits there until a page that just loaded has renewed the session it
 * started with, since a token sent a second time ends the session, and answers false
 * while a match runs, which saving the session would end with a reload.
 */
export function adoptNewSignIn(
  deps: Deps,
  ready: () => Promise<boolean> = () => Promise.resolve(true),
): Promise<PickUp> {
  return deps.queue(async (): Promise<PickUp> => {
    const state = await deps.store.load();
    if (!isAdding(state, deps.now())) {
      return {
        kind: "idle",
        state:
          state.addingUntil === null
            ? state
            : await commit(deps, stopAdding(state)),
      };
    }
    if (!(await ready())) {
      return { kind: "waiting", state };
    }
    // A page that is still loading, or on the sign-in form, has no session yet.
    const token = await deps.page.readToken().catch(() => null);
    if (token === null) {
      return { kind: "waiting", state };
    }
    try {
      const claimed = await claim(deps, state, token);
      return claimed.identity === null
        ? { kind: "waiting", state: claimed.state }
        : { kind: "saved", state: claimed.state, identity: claimed.identity };
    } catch (error) {
      // Autodarts can't be reached for now: the next load of the page tries again.
      if ((error as AuthError).kind === "unreachable") {
        return { kind: "waiting", state };
      }
      throw error;
    }
  });
}

/**
 * Waits for a new account from now on, as after the install, without signing anyone
 * out: the next session that the page signs in with is saved by itself.
 */
export function startAddingAccount(deps: Deps): Promise<State> {
  return edit(deps, (state) => startAdding(state, deps.now() + ADD_WINDOW_MS));
}

/** No longer waits for a new account, as when the person cancels "Add account". */
export function stopAddingAccount(deps: Deps): Promise<State> {
  return edit(deps, stopAdding);
}

/**
 * How a switch or a sign-out ended, for the popup to show: done in the page, or not,
 * and then why: the account must sign in again, or Autodarts was unreachable.
 */
export type SwitchResult =
  | { state: State; ok: true; reason?: undefined }
  | { state: State; ok: false; reason: "signin" | "unreachable" };

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
  await deps.page.readToken();
  const renewal = await renew(deps, target);
  if (renewal.kind === "unreachable") {
    return { state, ok: false, reason: "unreachable" };
  }
  if (renewal.kind === "rejected") {
    return {
      state: await commit(deps, endSession(state, id)),
      ok: false,
      reason: "signin",
    };
  }
  // The old token is spent now: keep the fresh one before the page can fail.
  const identity = readIdentity(renewal.session.accessToken);
  state = await commit(
    deps,
    park(state, identity, renewal.session.refreshToken, deps.now()),
  );
  const kept = await keepOutgoing(deps, state);
  if (kept === null) {
    return { state, ok: false, reason: "unreachable" };
  }
  await deps.page.writeToken(renewal.session.refreshToken);
  return { state: await commit(deps, activate(kept, identity.id)), ok: true };
}

/**
 * Keeps the session of the page with the account it belongs to, as the page is about
 * to let go of it. Renewing it is the only way to learn whose it is, and no renewal
 * behind the page's back: the page gets another token, or none, right after. So this
 * runs last, once nothing can stop the change any more, and reads the token as late
 * as it can, since a token that the page renewed in the meantime would count as stolen
 * when it comes a second time.
 *
 * The account that played last needs a new session when this one isn't its own: it
 * was signed out in the page. Its remembered password isn't tried here, so an account
 * with one stays ready for the next renewal or tap (`loseSession`). A session of an account without a tile leaves with the
 * page: a sign-in is saved only with a tap, and nobody holds its token any more. While
 * no account plays, the session in the page is nobody's that the extension knows, and
 * it stays unspent.
 *
 * Answers with the accounts, of which none plays when a session was there to keep, or
 * with null when Autodarts can't be reached: then nothing changed and the page stays.
 */
async function keepOutgoing(deps: Deps, state: State): Promise<State | null> {
  const { activeId } = state;
  const token = activeId === null ? null : await deps.page.readToken();
  if (activeId === null || token === null) {
    return state;
  }
  const renewal = await renewOutgoing(deps, token);
  if (renewal.kind === "unreachable") {
    return null;
  }
  if (renewal.kind === "rejected") {
    return commit(deps, loseSession(state, activeId));
  }
  // The page's token is spent now: keep the fresh one before the page can fail.
  const identity = readIdentity(renewal.session.accessToken);
  const left = identity.id === activeId ? state : loseSession(state, activeId);
  return commit(
    deps,
    find(left, identity.id) === undefined
      ? left
      : park(left, identity, renewal.session.refreshToken, deps.now()),
  );
}

/**
 * Renews the session of the page. A token that Autodarts refuses may be one that the
 * page renewed while it was on its way, so it counts as refused only when the page
 * still holds it or holds none.
 */
async function renewOutgoing(deps: Deps, token: string): Promise<Renewal> {
  const result = await attempt(refreshSession(deps.fetcher, token));
  if (result !== null) {
    return result;
  }
  const current = await deps.page.readToken();
  return current === null || current === token
    ? { kind: "rejected" }
    : renewOutgoing(deps, current);
}

/**
 * Signs the page out so that a new account can sign in, and waits for it: the session
 * that the page signs in with next, within the window, is saved by itself. The account
 * playing now keeps its session parked first, so it is not lost; while Autodarts can't
 * say whose the session in the page is, the page stays as it is.
 */
export function signOutForNewAccount(deps: Deps): Promise<SwitchResult> {
  return deps.queue(() => signOut(deps, true));
}

/**
 * Signs the page out after a break on the display of a venue, so that the next games
 * count for nobody: the account that played keeps its session parked, as at a switch,
 * and no new account is waited for, not even after an "Add account" that nobody
 * finished, so the next sign-in on the page is no account of the extension until a
 * person saves it. While Autodarts can't say whose the session in the page is, the
 * page stays as it is, and the next look tries again.
 */
export function leaveDisplay(deps: Deps): Promise<SwitchResult> {
  return deps.queue(() => signOut(deps, false));
}

async function signOut(deps: Deps, waitForNew: boolean): Promise<SwitchResult> {
  const state = await deps.store.load();
  // Keep the session before the page lets go of it.
  const kept = await keepOutgoing(deps, state);
  if (kept === null) {
    return { state, ok: false, reason: "unreachable" };
  }
  await deps.page.clearToken();
  const signedOut = deactivate(kept);
  return {
    state: await commit(
      deps,
      waitForNew
        ? startAdding(signedOut, deps.now() + ADD_WINDOW_MS)
        : stopAdding(signedOut),
    ),
    ok: true,
  };
}

/**
 * Why a parked account took no seat in a lobby: it plays on the page, it has to sign
 * in again, Autodarts couldn't be reached, or Autodarts refused the seat, because the
 * lobby is gone, full or started, or has no board.
 */
export type JoinFailure = "playing" | "signin" | "unreachable" | "refused";

/**
 * How a join ended: the account that sits in the lobby now, or null for an account
 * that the extension doesn't know (any more), and whether it had that seat already,
 * so that nothing was sent; or why it took none.
 */
export type JoinResult =
  | { state: State; ok: true; seated: Identity | null; kept: boolean }
  | { state: State; ok: false; reason: JoinFailure };

/**
 * Seats a parked account in a lobby at the board of the display, the one where the
 * account that plays on the page sits (or else the board of the host), as if the player had
 * joined from their phone, so the match counts for their own account too. The page
 * stays as it is: the account that plays there keeps playing, and the session of the
 * joined account stays parked. No token reaches the page.
 *
 * The renewal takes its turn in the queue, as every renewal does, and keeps the rotated
 * refresh token before anything else. The join needs only the access token of that
 * renewal and changes no account, so it runs after the turn, and a slow lobby doesn't
 * hold up a tap.
 *
 * The account that plays on the page has no parked session: its token belongs to the
 * page, which the extension never renews behind the page's back, so it isn't seated
 * this way.
 */
export async function joinLobbyAs(
  deps: Deps,
  id: string,
  lobbyId: string,
): Promise<JoinResult> {
  const turn = await deps.queue(() => sessionToJoin(deps, id));
  if (!("session" in turn)) {
    return turn;
  }
  const player = readIdentity(turn.session.accessToken);
  let join: Join;
  try {
    join = await joinLobby(
      deps.fetcher,
      turn.session.accessToken,
      lobbyId,
      player,
      turn.state.activeId,
    );
  } catch (error) {
    // joinLobby throws nothing but AuthError.
    return {
      state: turn.state,
      ok: false,
      reason:
        (error as AuthError).kind === "rejected" ? "refused" : "unreachable",
    };
  }
  // A player who still sits in the lobby, such as after a second tap, keeps that seat:
  // the lobby was read first, and no second seat was asked for.
  return {
    state: turn.state,
    ok: true,
    seated: player,
    kept: join === "seated",
  };
}

/** A fresh session of a parked account, which is saved first, or why there is none. */
async function sessionToJoin(
  deps: Deps,
  id: string,
): Promise<JoinResult | { state: State; session: Session }> {
  const state = await deps.store.load();
  const profile = find(state, id);
  if (profile === undefined) {
    return { state, ok: true, seated: null, kept: false };
  }
  if (state.activeId === id) {
    return { state, ok: false, reason: "playing" };
  }
  const renewal = await renew(deps, profile);
  if (renewal.kind === "unreachable") {
    return { state, ok: false, reason: "unreachable" };
  }
  if (renewal.kind === "rejected") {
    return {
      state: await commit(deps, endSession(state, id)),
      ok: false,
      reason: "signin",
    };
  }
  // The old token is spent now: keep the fresh one before the join can fail.
  return {
    state: await commit(
      deps,
      stash(state, id, renewal.session.refreshToken, deps.now()),
    ),
    session: renewal.session,
  };
}

/**
 * How a removal ended. "removed": the accounts are forgotten, and `ended` says whether
 * Autodarts ended every session of them; false when it couldn't be reached, and each
 * session it didn't end lasts until it expires by itself. "match": the account plays
 * on the page, which may not sign out now, as while a match runs; nothing changed.
 */
export type Removal =
  | { kind: "removed"; state: State; ended: boolean }
  | { kind: "match"; state: State };

/**
 * Removes an account and ends its session at Autodarts first: the parked one, or,
 * while the account plays, the one in the page, which signs out for it. `mayLeave`
 * runs only then and says whether the page may sign out now, which reloads it and
 * ends a match that runs there. Without a page that answers, it fails before anything
 * changes, so the service worker can open one and try again. The account is forgotten
 * also when Autodarts can't be reached: `ended` then says so.
 */
export function removeAccount(
  deps: Deps,
  id: string,
  mayLeave: () => Promise<boolean> = () => Promise.resolve(true),
): Promise<Removal> {
  return deps.queue(async (): Promise<Removal> => {
    const state = await deps.store.load();
    const profile = find(state, id);
    if (profile === undefined) {
      return { kind: "removed", state, ended: true };
    }
    const tokens = profile.token === null ? [] : [profile.token];
    if (state.activeId === id) {
      if (!(await mayLeave())) {
        return { kind: "match", state };
      }
      tokens.push(...(await leavePage(deps)));
    }
    const ended = await revokeAll(deps, tokens);
    return {
      kind: "removed",
      state: await commit(deps, forget(state, id)),
      ended,
    };
  });
}

/**
 * Forgets every account, as before a display changes hands: ends the session of each
 * one at Autodarts, the one in the page too while an account of the extension plays
 * there, which signs the page out, and then runs `wipe`, which deletes what else the
 * extension keeps. A session in the page that no account keeps stays: it was never the
 * extension's. `mayLeave` and the outcome work as for `removeAccount`.
 */
export function forgetAll(
  deps: Deps,
  wipe: () => Promise<void>,
  mayLeave: () => Promise<boolean> = () => Promise.resolve(true),
): Promise<Removal> {
  return deps.queue(async (): Promise<Removal> => {
    const state = await deps.store.load();
    const tokens = state.profiles.flatMap((profile) =>
      profile.token === null ? [] : [profile.token],
    );
    if (state.activeId !== null) {
      if (!(await mayLeave())) {
        return { kind: "match", state };
      }
      tokens.push(...(await leavePage(deps)));
    }
    const ended = await revokeAll(deps, tokens);
    // The accounts go first, so that none is left over should the wipe fail.
    const cleared = await commit(deps, EMPTY);
    await wipe();
    return { kind: "removed", state: cleared, ended };
  });
}

/** Signs the page out and gives the session it held, for the caller to end at Autodarts. */
async function leavePage(deps: Deps): Promise<string[]> {
  const live = await deps.page.readToken();
  if (live === null) {
    return [];
  }
  await deps.page.clearToken();
  return [live];
}

/**
 * Ends sessions at Autodarts, all at once: each has a token of its own, so none waits
 * for another. True when every one is over.
 */
async function revokeAll(deps: Deps, tokens: string[]): Promise<boolean> {
  const results = await Promise.all(
    tokens.map((token) => revokeSession(deps.fetcher, token)),
  );
  return results.every(Boolean);
}

/** How a renewal of the parked sessions ended: the accounts, and how each one went. */
export interface RefreshRun extends RunCounts {
  state: State;
}

/** What became of one account in a renewal; "skipped" when a switch took it meanwhile. */
type Outcome = keyof RunCounts | "skipped";

/**
 * Keeps every parked session fresh, so a stored account can play at any time, and signs
 * in with its remembered password each account whose session is gone but whose password
 * nothing refused yet, such as after a sign-out on the page. An account whose token has
 * died and whose stored sign-in is refused, or that has none, is marked as needing one;
 * a temporary problem keeps its session for the next run and marks since when its
 * renewal fails, until a renewal works again.
 *
 * Each account takes a turn of its own in the queue, so a tap waits for one renewal at
 * most, and each fresh token is saved as soon as it arrives. The counts tell the
 * service worker whether to try again soon and whether Autodarts turned everyone away.
 */
export async function refreshParked(deps: Deps): Promise<RefreshRun> {
  const run: RefreshRun = {
    state: await deps.queue(() => deps.store.load()),
    renewed: 0,
    rejected: 0,
    unreachable: 0,
  };
  for (const { id } of renewable(run.state)) {
    const { state, outcome } = await deps.queue(() => refreshOne(deps, id));
    run.state = state;
    if (outcome !== "skipped") {
      run[outcome] += 1;
    }
  }
  return run;
}

async function refreshOne(
  deps: Deps,
  id: string,
): Promise<{ state: State; outcome: Outcome }> {
  const state = await deps.store.load();
  // A switch may have run since the list was made: renew only what still waits for it.
  const profile = renewable(state).find((candidate) => candidate.id === id);
  if (profile === undefined) {
    return { state, outcome: "skipped" };
  }
  const renewal = await renew(deps, profile);
  if (renewal.kind === "ok") {
    return {
      state: await commit(
        deps,
        stash(state, id, renewal.session.refreshToken, deps.now()),
      ),
      outcome: "renewed",
    };
  }
  if (renewal.kind === "rejected") {
    return {
      state: await commit(deps, endSession(state, id)),
      outcome: "rejected",
    };
  }
  // The session stays for the next try, and the account shows since when renewing fails.
  const failing = failRenewal(state, id, deps.now());
  return {
    state: failing === state ? state : await commit(deps, failing),
    outcome: "unreachable",
  };
}
