/**
 * The service worker: it wires the browser (storage, the Autodarts tabs, the clock and
 * fetch) to the logic of the other modules. It holds no account logic of its own, only
 * the wiring, and it reaches the browser only through the `ChromeApi` that
 * `background.ts` passes in, the real `chrome`, or a test a fake one.
 *
 * Every read and change of the accounts goes through `switch.ts`, which runs them one at
 * a time in the queue below, so a double tap or the background renewal can't spend a
 * token twice. When to renew, and what the toolbar icon says, `health.ts` decides; when
 * the welcome page opens, `onboarding.ts`. `storage.ts` keeps the accounts, and never
 * saves over accounts in a format that this version doesn't know; `vault.ts` seals their
 * sessions and passwords with a key that only this worker uses, kept in the IndexedDB of
 * the extension, so chrome.storage.local holds none in plain text.
 *
 * Removing an account ends its session at Autodarts before the worker forgets it, and
 * "Forget all accounts" does so for every account and then deletes all that the
 * extension keeps, the key of the vault as well, so that a display can change hands.
 *
 * The popup and the switcher in the Autodarts page (switcher.html) send it the same
 * requests (`messages.ts`); the content script asks it what the button in the page
 * shows, and it relays the keyboard shortcut and the close of the switcher to the page.
 * `trust.ts` decides who may send which request, and keeps the storage out of the reach
 * of the content script.
 *
 * The venue mode, which the options page turns on, comes from `venue.ts`: the worker
 * checks the PIN of every switch to an account that has one and of every change in
 * "Manage accounts" while a manager PIN is set, so neither the popup nor the switcher
 * can go around it, and it returns the display to the house account after a break that
 * the content script measures, never during a match.
 */
import {
  badge,
  nextRunAt,
  parseHealth,
  planStart,
  REFRESH_PERIOD_MINUTES,
  recordRun,
  suggestsUpdate,
} from "./health.ts";
import {
  type Outcome,
  type PageButtonView,
  type PageRequest,
  type PinKind,
  type PlayersReply,
  type PlayersRequest,
  type PlayersView,
  type Refusal,
  readRequest,
  type VenueOutcome,
  type VenueReply,
  type VenueRequest,
  type VenueStatus,
} from "./messages.ts";
import { welcomes } from "./onboarding.ts";
import {
  isPlayPage,
  mustConfirm,
  PLAY_ORIGINS,
  SETTINGS_KEY,
  toButtonView,
} from "./page.ts";
import { createQueue } from "./queue.ts";
import {
  EMPTY,
  forgetCredentials,
  rememberCredentials,
  toView,
} from "./state.ts";
import {
  ACCOUNTS_KEY,
  accountsIn,
  createStore,
  type StorageArea,
  UnknownStateError,
} from "./storage.ts";
import {
  adoptCurrentSession,
  adoptNewSignIn,
  type Deps,
  edit,
  forgetAll,
  leaveDisplay,
  type PagePort,
  type Removal,
  readView,
  refreshParked,
  removeAccount,
  signOutForNewAccount,
  startAddingAccount,
  stopAddingAccount,
  switchTo,
  syncFromPage,
} from "./switch.ts";
import {
  createPage,
  injectAll,
  NoPageError,
  rankTabs,
  reach,
  settleTab,
  showPage,
  type TabsPort,
  withPage,
} from "./tabs.ts";
import {
  fromExtension,
  fromExtensionPage,
  keepFromContentScripts,
  type RestrictableArea,
  type Sender,
} from "./trust.ts";
import { createVault, keyStoreIn } from "./vault.ts";
import {
  ACTIVITY_KEY,
  checkPin,
  forgetAccount,
  hashPin,
  idleTick,
  isPin,
  LOCKOUT_KEY,
  type PinCheck,
  type PinHash,
  parseActivity,
  parseLockout,
  parseVenue,
  pinOf,
  returnsAfterBreak,
  setIdle,
  setManagerPin,
  setPlayerPin,
  VENUE_KEY,
  type Venue,
  withPins,
} from "./venue.ts";

/** An event of the browser, as far as the worker listens to it. */
export interface BrowserEvent<Listener> {
  addListener(listener: Listener): void;
}

/** A tab, as the browser tells the worker of it. */
export interface BrowserTab {
  id?: number | undefined;
  windowId: number;
  active: boolean;
  lastAccessed?: number | undefined;
  url?: string | undefined;
}

/** Who sent a message, as `chrome.runtime.MessageSender` has it. */
export interface MessageSender extends Sender {
  tab?: BrowserTab | undefined;
}

/** A change of a stored value, as `chrome.storage.onChanged` tells of it. */
export interface StorageChange {
  newValue?: unknown;
  oldValue?: unknown;
}

/** An alarm of the browser. */
export interface Alarm {
  name: string;
}

/**
 * The browser, as far as the service worker uses it: the members of `chrome` that it
 * calls, with the types that it relies on. `background.ts` passes in the real `chrome`,
 * which the compiler checks against this; a test passes a fake one.
 */
export interface ChromeApi {
  readonly runtime: {
    readonly id: string;
    getURL(path: string): string;
    readonly onMessage: BrowserEvent<
      (
        message: unknown,
        sender: MessageSender,
        sendResponse: (response?: unknown) => void,
      ) => boolean
    >;
    readonly onStartup: BrowserEvent<() => void>;
    readonly onInstalled: BrowserEvent<(details: { reason: string }) => void>;
  };
  readonly storage: {
    readonly local: StorageArea & RestrictableArea & ClearableArea;
    /** Outlives a sleep of the worker, not a restart of the browser. */
    readonly session: Pick<StorageArea, "get" | "set"> & ClearableArea;
    readonly onChanged: BrowserEvent<
      (changes: Record<string, StorageChange>, area: string) => void
    >;
  };
  readonly tabs: {
    query(info: { url: string[] }): Promise<BrowserTab[]>;
    sendMessage(
      tabId: number,
      message: PageRequest,
      options: { frameId: number },
    ): Promise<unknown>;
    reload(tabId: number): Promise<void>;
    create(properties: { url: string; active?: boolean }): Promise<BrowserTab>;
    update(tabId: number, properties: { active: boolean }): Promise<unknown>;
    readonly onUpdated: BrowserEvent<
      (tabId: number, change: { status?: string }, tab: BrowserTab) => void
    >;
    readonly onRemoved: BrowserEvent<() => void>;
  };
  readonly windows: {
    getLastFocused(): Promise<{ id?: number | undefined }>;
    update(windowId: number, info: { focused: boolean }): Promise<unknown>;
  };
  readonly scripting: {
    executeScript(injection: {
      target: { tabId: number };
      files: string[];
    }): Promise<unknown>;
  };
  readonly alarms: {
    create(
      name: string,
      info: { when?: number; periodInMinutes?: number },
    ): Promise<void>;
    get(name: string): Promise<Alarm | undefined>;
    clear(name: string): Promise<boolean>;
    readonly onAlarm: BrowserEvent<(alarm: Alarm) => void>;
  };
  readonly action: {
    setBadgeText(details: { text: string }): Promise<void>;
    setBadgeBackgroundColor(details: { color: string }): Promise<void>;
    setTitle(details: { title: string }): Promise<void>;
    /** Since Chrome 110; an older one picks the color of the badge text itself. */
    setBadgeTextColor?:
      | ((details: { color: string }) => Promise<void>)
      | undefined;
  };
  readonly commands: {
    readonly onCommand: BrowserEvent<
      (command: string, tab?: BrowserTab) => void
    >;
  };
  readonly i18n: {
    getMessage(key: string, substitutions?: string | string[]): string;
  };
}

/** What the service worker takes from its global scope besides `chrome`. */
export interface Platform {
  readonly indexedDB: IDBFactory;
  fetch(url: string, init: RequestInit): Promise<Response>;
  now(): number;
  /** Waits; a test passes one that need not wait. */
  wait(ms: number): Promise<void>;
  /** Runs a task later, as `setTimeout` does. */
  later(ms: number, task: () => void): void;
  /** Writes a failure to the console of the worker, which `chrome://extensions` shows. */
  log(text: string, error: unknown): void;
}

/** What `platformOf` takes from the global scope of a service worker. */
export interface WorkerScope {
  readonly indexedDB: IDBFactory;
  fetch(url: string, init: RequestInit): Promise<Response>;
  setTimeout(task: () => void, ms: number): unknown;
  readonly console: { error(...data: unknown[]): void };
  readonly Date: { now(): number };
}

/** The platform of a service worker, from its global scope: `globalThis` in Chrome. */
export function platformOf(scope: WorkerScope): Platform {
  return {
    indexedDB: scope.indexedDB,
    fetch: (url, init) => scope.fetch(url, init),
    now: () => scope.Date.now(),
    wait: (ms) =>
      new Promise((resolve) => {
        scope.setTimeout(resolve, ms);
      }),
    later: (ms, task) => {
      scope.setTimeout(task, ms);
    },
    log: (text, error) => scope.console.error(text, error),
  };
}

/** The started worker: `ready` settles once the check of the renewal at its start has run. */
export interface StartedWorker {
  readonly ready: Promise<void>;
}

/** The file of the content script, which the worker runs again in a tab that needs it. */
export const CONTENT_SCRIPT = "lib/content.js";
const TAB_MATCHES = PLAY_ORIGINS.map((origin) => `${origin}/*`);
const STORAGE_KEY = ACCOUNTS_KEY;
/** How the renewal went, beside the accounts: see `health.ts`. */
export const HEALTH_KEY = "health";
export const REFRESH_ALARM = "refresh-parked";
/** The look, once a minute while the venue mode returns the display, whether a break is over. */
export const IDLE_ALARM = "venue-idle";
/**
 * The colors of the badge, each with white text at a contrast of at least 4.5:1: a dark
 * red for the accounts that have to sign in again, an indigo for a session on the page
 * that no account keeps yet, and a green for an account that was just saved.
 */
export const BADGE_COLORS = {
  signIn: "#b3261e",
  none: "#b3261e",
  unsaved: "#3949ab",
} as const;
export const SAVED_COLOR = "#1e7e34";
export const BADGE_TEXT_COLOR = "#ffffff";
/** How long the check mark of a saved account stays on the icon. */
export const SAVED_BADGE_MS = 4000;
/**
 * When to look for the session of a new sign-in after an Autodarts page has finished
 * loading: Autodarts stores it a moment after the page has loaded, so the extension
 * looks again a few times. Within 15 seconds, while the service worker is awake.
 */
export const PICK_UP_DELAYS_MS: readonly number[] = [0, 1000, 2000, 4000, 8000];
/**
 * How long a request to Autodarts may take. The account changes wait for each other,
 * so one request that never ends would hold up every tap after it.
 */
export const REQUEST_TIMEOUT_MS = 20_000;

/** A storage area that the browser can empty, as "Forget all accounts" does. */
export interface ClearableArea {
  clear(): Promise<void>;
}

/**
 * The answer to a removal: the sessions end at Autodarts first. While an account plays,
 * the page signs out for it, which needs a page that answers, so one opens when none
 * does, and asks first while a match runs. `ended` tells the popup whether Autodarts
 * ended every session or could not be reached.
 */
function removed(removal: Removal): Outcome {
  return removal.kind === "match"
    ? { ok: false, reason: "match" }
    : { ok: true, ended: removal.ended };
}

/**
 * The requests that change an account in "Manage accounts", and "unlock", with which
 * the popup or the switcher opens it: each needs the manager PIN while one is set.
 */
const MANAGER_ACTIONS: ReadonlySet<string> = new Set([
  "unlock",
  "remember",
  "forgetPassword",
  "removeAccount",
  "forgetAll",
]);

/**
 * Starts the service worker on a browser: it listens to the events of the browser and
 * makes sure that the renewal of the parked sessions keeps running.
 */
export function startWorker(api: ChromeApi, platform: Platform): StartedWorker {
  const t = (key: string, substitution?: string) =>
    api.i18n.getMessage(key, substitution);

  /**
   * Writes a failure of the service worker to its console, instead of dropping it, so
   * that a renewal that keeps failing leaves a trace.
   */
  const logFailure = (what: string) => (error: unknown) =>
    platform.log(`Player Switch: ${what} failed.`, error);

  // The key of the vault never leaves the browser: it can't be exported, and neither the
  // content script nor a page of another origin reaches the IndexedDB of the extension.
  const store = createStore(
    api.storage.local,
    createVault(keyStoreIn(platform.indexedDB)),
  );

  // The saved accounts hold tokens and remembered passwords: only the service worker and
  // the pages of the extension may read them, not the content script in the Autodarts
  // page.
  keepFromContentScripts(api.storage.local).catch(
    logFailure("keeping the saved accounts from the Autodarts page"),
  );

  // The Autodarts tabs. The host access of the manifest lets the query filter tabs by
  // their address, so the extension needs no "tabs" permission, which would let it read
  // the address of every tab. It also lets "scripting" run the content script, the
  // extension's own file and no other code, in an Autodarts tab whose content script
  // doesn't answer.
  const tabs: TabsPort = {
    query: () => api.tabs.query({ url: TAB_MATCHES }),
    focusedWindow: () =>
      api.windows.getLastFocused().then(
        (window) => window.id,
        () => undefined,
      ),
    send: (tabId, request) =>
      api.tabs.sendMessage(tabId, request, { frameId: 0 }),
    inject: async (tabId) => {
      await api.scripting.executeScript({
        target: { tabId },
        files: [CONTENT_SCRIPT],
      });
    },
    reload: (tabId) => api.tabs.reload(tabId),
    open: (url, active) => api.tabs.create({ url, active }),
    async focus(tab) {
      await api.tabs.update(tab.id, { active: true });
      await api.windows.update(tab.windowId, { focused: true });
    },
    wait: (ms) => platform.wait(ms),
  };

  /** Every Autodarts tab; none when the browser can't say. */
  const playTabs = () => api.tabs.query({ url: TAB_MATCHES });

  /**
   * The Autodarts tab that a request of the toolbar popup is for: the one that
   * `tabs.ts` sends a switch to first, the tab in front in the window used last.
   */
  async function findTab(): Promise<BrowserTab | undefined> {
    const [all, focused] = await Promise.all([
      tabs.query(),
      tabs.focusedWindow(),
    ]);
    return rankTabs(all, focused)[0];
  }

  /**
   * The tab of one request, chosen once, so that the check for a match and the switch
   * concern the same tab: the tab of the switcher in the page, where the person tapped,
   * or else the one that findTab picks for the toolbar popup.
   */
  function tabOf(sender: MessageSender): Promise<BrowserTab | undefined> {
    const tab = sender.tab;
    return typeof tab?.id === "number" && isPlayPage(tab.url)
      ? Promise.resolve(tab)
      : findTab();
  }

  async function loadHealth() {
    const data = await api.storage.local.get([HEALTH_KEY]);
    return parseHealth(data[HEALTH_KEY]);
  }

  async function loadVenue(): Promise<Venue> {
    const data = await api.storage.local.get([VENUE_KEY]);
    return parseVenue(data[VENUE_KEY]);
  }

  /** The page of a request: its tab first, and the tab in front when that one is gone. */
  async function pageFor(
    tab: Promise<BrowserTab | undefined>,
  ): Promise<PagePort> {
    return createPage(tabs, (await tab)?.id);
  }

  // What every change of the accounts shares; each one adds the page of its tab.
  const shared: Omit<Deps, "page"> = {
    store,
    fetcher: (url, init) =>
      platform.fetch(url, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    now: () => platform.now(),
    queue: createQueue(),
  };
  const anyPage = (): Deps => ({ ...shared, page: createPage(tabs) });

  // The changes of the venue settings, and the checks of a PIN with their count of wrong
  // ones, each one at a time, so that two at once lose nothing and try no PIN twice as fast.
  const venueQueue = createQueue();
  const pinQueue = createQueue();

  /** Changes the venue settings: `change` gets the stored ones and answers the new ones. */
  function changeVenue(change: (venue: Venue) => Venue): Promise<Venue> {
    return venueQueue(async () => {
      const venue = change(await loadVenue());
      await api.storage.local.set({ [VENUE_KEY]: venue });
      return venue;
    });
  }

  /**
   * Checks the PIN that a request carries against the hash that guards it, and keeps the
   * count of wrong PINs in the session storage, which outlives a sleep of the worker but
   * not a restart of the browser, and which the content script can't reach.
   */
  function guard(hash: PinHash | null, pin: unknown): Promise<PinCheck> {
    if (hash === null) {
      return Promise.resolve({ kind: "ok" });
    }
    return pinQueue(async () => {
      const stored = await api.storage.session.get([LOCKOUT_KEY]);
      const { check, lockout } = await checkPin(
        hash,
        pin,
        parseLockout(stored[LOCKOUT_KEY]),
        platform.now(),
      );
      await api.storage.session.set({ [LOCKOUT_KEY]: lockout });
      return check;
    });
  }

  /**
   * The answer to a request that a PIN guards and that carries none or a wrong one: the
   * popup and the switcher then ask for the PIN, of the account (`player`) or the
   * manager, and send the request again. After too many wrong PINs they only say how
   * long to wait.
   */
  function refusal(
    check: Exclude<PinCheck, { kind: "ok" }>,
    kind: PinKind,
  ): Refusal {
    return check.kind === "locked"
      ? { ok: false, reason: "locked", retryIn: check.retryInMs }
      : { ok: false, reason: "pin", pin: kind, wrong: check.kind === "wrong" };
  }

  /** Notes an input at the display, from which the break of the venue mode counts. */
  function noteActivity(): Promise<void> {
    return api.storage.session.set({ [ACTIVITY_KEY]: platform.now() });
  }

  /**
   * A switch, or the sign-out for a new account, reloads the page, and every other
   * Autodarts tab with it, and so ends a match that runs in any of them. Before it
   * spends a token, it asks the person, through the popup or the switcher, unless the
   * request carries their yes.
   */
  async function mustAskFirst(
    tab: Promise<BrowserTab | undefined>,
    message: PlayersRequest,
  ): Promise<boolean> {
    const all = await playTabs().catch(() => []);
    return [await tab, ...all].some((candidate) =>
      mustConfirm(candidate?.url, message.confirmed),
    );
  }

  /**
   * Whether the page may sign out now for a removal: not while a match runs there,
   * unless the request carries the person's yes, as for a switch.
   */
  async function mayLeave(
    tab: Promise<BrowserTab | undefined>,
    message: PlayersRequest,
  ): Promise<boolean> {
    return !(await mustAskFirst(tab, message));
  }

  /**
   * Deletes all that the extension keeps, once "Forget all accounts" has ended the
   * sessions: the accounts with the key of the vault, the state of the renewal, the
   * venue mode with its PINs, the settings, and the session storage with the count of
   * wrong PINs. The extension is then as after its install.
   */
  async function wipe(): Promise<void> {
    await store.clear();
    await api.storage.local.clear();
    await api.storage.session.clear();
  }

  async function runAction(
    message: PlayersRequest,
    tab: Promise<BrowserTab | undefined>,
  ): Promise<Outcome> {
    const deps = { ...shared, page: await pageFor(tab) };
    if (MANAGER_ACTIONS.has(message.action)) {
      const check = await guard(
        (await loadVenue()).manager,
        message.managerPin,
      );
      if (check.kind !== "ok") {
        return refusal(check, "manager");
      }
    }
    switch (message.action) {
      case "view": {
        // A new account that signed in before the page told the worker is saved now.
        const picked = await adoptNewSignIn(deps, noMatchRuns).catch(
          () => null,
        );
        // A missing page here is normal (the popup may be open with no Autodarts tab).
        try {
          await syncFromPage(deps);
        } catch (error) {
          if (!(error instanceof NoPageError)) {
            throw error;
          }
          return { ok: true, page: false };
        }
        return picked?.kind === "saved"
          ? { ok: true, page: true, saved: picked.identity.name }
          : { ok: true, page: true };
      }
      case "switch": {
        // The PIN of the account first: a wrong one never gets as far as the question.
        const check = await guard(
          pinOf(await loadVenue(), message.id),
          message.pin,
        );
        if (check.kind !== "ok") {
          return refusal(check, "player");
        }
        if (await mustAskFirst(tab, message)) {
          return { ok: false, reason: "match" };
        }
        // With no Autodarts tab that answers, the switch opens one and goes on there.
        const result = await withPage(
          tabs,
          () => switchTo(deps, message.id),
          (outcome) => outcome.ok,
        );
        return result.ok
          ? { ok: true, page: true }
          : { ok: false, reason: result.reason, page: true };
      }
      case "adopt":
        await adoptCurrentSession(deps);
        return { ok: true, page: true };
      case "signout": {
        if (await mustAskFirst(tab, message)) {
          return { ok: false, reason: "match" };
        }
        // The new player signs in on the page, so a page opens when none answers.
        const result = await withPage(tabs, () => signOutForNewAccount(deps));
        return result.ok
          ? { ok: true, page: true }
          : { ok: false, reason: result.reason, page: true };
      }
      case "openPage":
        await showPage(tabs);
        return { ok: true, page: true };
      case "stopAdding":
        await stopAddingAccount(deps);
        return { ok: true };
      case "remember": {
        const { id, username, password } = message;
        await edit(deps, (state) =>
          rememberCredentials(state, id, { username, password }),
        );
        return { ok: true };
      }
      case "forgetPassword":
        await edit(deps, (state) => forgetCredentials(state, message.id));
        return { ok: true };
      case "removeAccount": {
        // A page opened for the removal stays in the background: in front, it would
        // close the popup before the popup could say how the removal ended.
        const removal = await withPage(
          tabs,
          () => removeAccount(deps, message.id, () => mayLeave(tab, message)),
          () => false,
        );
        if (removal.kind === "removed") {
          // Its PIN goes as well, and the display no longer returns to it.
          await changeVenue((venue) => forgetAccount(venue, message.id));
        }
        return removed(removal);
      }
      case "forgetAll":
        return removed(
          await withPage(
            tabs,
            () => forgetAll(deps, wipe, () => mayLeave(tab, message)),
            () => false,
          ),
        );
      case "unlock":
        return { ok: true };
    }
  }

  /** The view of the popup, and whether it should suggest an update of the extension. */
  async function popupView(
    tab: Promise<BrowserTab | undefined>,
  ): Promise<PlayersView> {
    const [view, health, venue] = await Promise.all([
      readView({ ...shared, page: await pageFor(tab) }),
      loadHealth(),
      loadVenue(),
    ]);
    return {
      ...view,
      // Which accounts ask for a PIN, and whether "Manage accounts" does: never a hash.
      profiles: withPins(view.profiles, venue),
      venue: { manager: venue.manager !== null },
      updateHint: suggestsUpdate(health, view.profiles),
    };
  }

  /** The view of the popup after a failure: with no account when the accounts can't be read. */
  function viewAfter(
    tab: Promise<BrowserTab | undefined>,
  ): Promise<PlayersView> {
    return popupView(tab).catch(() => ({
      ...toView(EMPTY, false, 0),
      profiles: [],
      venue: { manager: false },
      updateHint: false,
    }));
  }

  async function handlePopup(
    message: PlayersRequest,
    tab: Promise<BrowserTab | undefined>,
  ): Promise<PlayersReply> {
    try {
      const result = await runAction(message, tab);
      return { ...result, view: await popupView(tab) };
    } catch (error) {
      if (error instanceof NoPageError) {
        return { error: "noPage", page: false, view: await viewAfter(tab) };
      }
      if (error instanceof UnknownStateError) {
        // The accounts of a newer version stay as they are, and the popup says why.
        return { error: "unknownFormat", view: await viewAfter(tab) };
      }
      logFailure(`the request "${message.action}"`)(error);
      return { error: "error", view: await viewAfter(tab) };
    }
  }

  /**
   * What the button in the page shows: the settings, and the player without a session.
   * And whether the content script tells the worker of the inputs on the page, which
   * only the return of the venue mode after a break needs.
   */
  async function buttonView(): Promise<PageButtonView> {
    const data = await api.storage.local.get([
      STORAGE_KEY,
      SETTINGS_KEY,
      VENUE_KEY,
    ]);
    return {
      ...toButtonView(accountsIn(data), data[SETTINGS_KEY]),
      reportActivity: returnsAfterBreak(parseVenue(data[VENUE_KEY])),
    };
  }

  /** What the options page shows of the venue mode: never a hash of a PIN. */
  async function venueStatus(): Promise<VenueStatus> {
    const [venue, view] = await Promise.all([loadVenue(), readView(anyPage())]);
    return {
      manager: venue.manager !== null,
      idleMinutes: venue.idleMinutes,
      house: venue.house,
      accounts: withPins(view.profiles, venue).map(
        ({ id, name, username, pin }) => ({ id, name, username, pin }),
      ),
    };
  }

  /** The hash of a new PIN, or null to take it away; undefined for a value that is no PIN. */
  async function newPin(
    pin: string | null,
  ): Promise<PinHash | null | undefined> {
    if (pin === null) {
      return null;
    }
    return isPin(pin) ? hashPin(pin) : undefined;
  }

  /**
   * The requests of the options page for the venue mode. Each one other than "status"
   * needs the manager PIN while one is set, also the one that changes it.
   */
  async function runVenue(message: VenueRequest): Promise<VenueOutcome> {
    if (message.action !== "status") {
      const check = await guard(
        (await loadVenue()).manager,
        message.managerPin,
      );
      if (check.kind !== "ok") {
        return refusal(check, "manager");
      }
    }
    switch (message.action) {
      case "managerPin": {
        const pin = await newPin(message.pin);
        if (pin === undefined) {
          return { ok: false, reason: "invalid" };
        }
        await changeVenue((venue) => setManagerPin(venue, pin));
        return { ok: true };
      }
      case "playerPin": {
        const { id } = message;
        const pin = await newPin(message.pin);
        const { profiles } = await readView(anyPage());
        // Only a saved account gets a PIN.
        if (
          pin === undefined ||
          !profiles.some((profile) => profile.id === id)
        ) {
          return { ok: false, reason: "invalid" };
        }
        await changeVenue((venue) => setPlayerPin(venue, id, pin));
        return { ok: true };
      }
      case "idle": {
        const { minutes, house } = message;
        // The break counts from now, not from an input before the return was turned on.
        await noteActivity();
        await changeVenue((venue) => setIdle(venue, minutes, house));
        return { ok: true };
      }
      default:
        // "status", and "unlock", with which the options page opens.
        return { ok: true };
    }
  }

  async function handleVenue(message: VenueRequest): Promise<VenueReply> {
    try {
      const result = await runVenue(message);
      return { ...result, status: await venueStatus() };
    } catch (error) {
      logFailure(`the venue request "${message.action}"`)(error);
      return { error: "error", status: await venueStatus().catch(() => null) };
    }
  }

  /** Tells the content script of an Autodarts tab something; a tab without one has no say. */
  function tellPage(tabId: number, message: PageRequest): void {
    api.tabs.sendMessage(tabId, message, { frameId: 0 }).catch(() => {});
  }

  // Only a page of the extension, such as the popup or the switcher, may see the accounts
  // and change them; the content script in the Autodarts page may only ask what its
  // button shows, and tell of an input on the page.
  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const request = readRequest(message);
    if (request === null || !fromExtension(sender, api.runtime.id)) {
      return false;
    }
    const fromPage = fromExtensionPage(
      sender,
      api.runtime.id,
      api.runtime.getURL(""),
    );
    switch (request.type) {
      case "popup":
        if (!fromPage) {
          return false;
        }
        // A tap in the popup or the switcher is an input at the display, too.
        noteActivity().catch(logFailure("noting an input"));
        void handlePopup(request, tabOf(sender)).then(sendResponse);
        return true; // the answer comes later
      case "venue":
        if (!fromPage) {
          return false;
        }
        void handleVenue(request).then(sendResponse);
        return true;
      case "activity":
        // The content script saw an input on the Autodarts page, at most every few seconds.
        if (isPlayPage(sender.tab?.url)) {
          noteActivity().catch(logFailure("noting an input"));
        }
        return false;
      case "button":
        buttonView().then(sendResponse, () => sendResponse(null));
        return true;
      case "switcher":
        // The switcher asks to close; only its own tab hears it.
        if (fromPage && typeof sender.tab?.id === "number") {
          tellPage(sender.tab.id, { type: "page", action: "closeSwitcher" });
        }
        return false;
    }
  });

  /** Redraws the button in every Autodarts tab. */
  async function redrawButtons(): Promise<void> {
    const view = await buttonView();
    for (const tab of await playTabs()) {
      if (typeof tab.id === "number") {
        tellPage(tab.id, { type: "page", action: "button", view });
      }
    }
  }

  // A change of the settings or of the accounts redraws the button in every Autodarts
  // tab; one of the venue settings tells the content script as well whether to report
  // the inputs. Every change of the accounts, from the popup or the renewal, updates the
  // badge.
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") {
      return;
    }
    if (
      SETTINGS_KEY in changes ||
      STORAGE_KEY in changes ||
      VENUE_KEY in changes
    ) {
      redrawButtons().catch(logFailure("redrawing the button in the page"));
    }
    if (STORAGE_KEY in changes) {
      showBadge().catch(logFailure("the badge"));
    }
    const venue = changes[VENUE_KEY];
    if (venue !== undefined) {
      syncIdleAlarm(parseVenue(venue.newValue)).catch(
        logFailure("the alarm of the venue mode"),
      );
    }
  });

  // The keyboard shortcut of the switcher opens or closes it in the Autodarts tab in front.
  api.commands.onCommand.addListener((command, tab) => {
    if (
      command === "toggle-switcher" &&
      typeof tab?.id === "number" &&
      isPlayPage(tab.url)
    ) {
      // A tab that was open before an update gets the content script of this version first.
      reach(tabs, tab.id, { type: "page", action: "toggleSwitcher" }).catch(
        () => {},
      );
    }
  });

  // Until when the check mark of a saved account shows, which the badge then waits for.
  let confirmingUntil = 0;
  // The text on the badge now, so that closing a tab looks again only after a "+".
  let badgeText = "";

  async function setBadge(text: string, color: string, title: string) {
    badgeText = text;
    await Promise.all([
      api.action.setBadgeText({ text }),
      api.action.setBadgeBackgroundColor({ color }),
      api.action.setTitle({ title }),
    ]);
  }

  /**
   * Shows on the toolbar icon a "+" while the Autodarts page holds a session that no
   * account keeps yet, and otherwise how many accounts have to sign in again; the tooltip
   * says who.
   */
  async function showBadge(): Promise<void> {
    if (platform.now() < confirmingUntil) {
      return;
    }
    const view = await readView(anyPage());
    // A new account was saved while the view was read: its check mark stays.
    if (platform.now() < confirmingUntil) {
      return;
    }
    const { text, names, kind } = badge(
      view.profiles,
      t("locale"),
      view.unsaved,
    );
    const lines: string[] = [];
    if (kind === "unsaved") {
      lines.push(t("badgeUnsaved"));
    }
    if (names !== "") {
      lines.push(t("badgeTitle", names));
    }
    await setBadge(
      text,
      BADGE_COLORS[kind],
      lines.length === 0 ? t("extName") : lines.join("\n"),
    );
  }

  /** Confirms on the toolbar icon, for a moment, that a new account was saved by itself. */
  async function confirmSaved(name: string): Promise<void> {
    confirmingUntil = platform.now() + SAVED_BADGE_MS;
    platform.later(SAVED_BADGE_MS, () => {
      confirmingUntil = 0;
      showBadge().catch(logFailure("the badge"));
    });
    // A check mark, white on green.
    await setBadge("✓", SAVED_COLOR, t("badgeSaved", name));
  }

  /**
   * Whether no match runs in any Autodarts tab: saving a session by itself reloads every
   * Autodarts tab, which would end a match without asking, as a switch asks first.
   */
  async function noMatchRuns(): Promise<boolean> {
    return !(await playTabs()).some((tab) => mustConfirm(tab.url, false));
  }

  /**
   * After an Autodarts tab has finished loading: saves the session of a new account that
   * signed in there while an account is being added, and keeps the badge current, also for
   * a session that Autodarts stores a moment after the load.
   */
  async function pickUp(tabId: number): Promise<void> {
    const deps = { ...shared, page: createPage(tabs, tabId) };
    // Autodarts renews the session it started with as the page loads: reading the token
    // before that would send it a second time, which ends the session.
    const ready = async () => {
      await settleTab(tabs, tabId);
      return noMatchRuns();
    };
    for (const delay of PICK_UP_DELAYS_MS) {
      await platform.wait(delay);
      const result = await adoptNewSignIn(deps, ready).catch(() => null);
      if (result?.kind === "saved") {
        await confirmSaved(result.identity.name);
        return;
      }
      await showBadge();
    }
  }

  /**
   * Looks once a minute, while the venue mode returns the display, whether its break is
   * over, as an alarm, which also wakes a sleeping worker; the alarm goes when the
   * return is turned off.
   */
  async function syncIdleAlarm(venue: Venue): Promise<void> {
    if (!returnsAfterBreak(venue)) {
      await api.alarms.clear(IDLE_ALARM);
    } else if ((await api.alarms.get(IDLE_ALARM)) === undefined) {
      await api.alarms.create(IDLE_ALARM, { periodInMinutes: 1 });
    }
  }

  // The look that is on its way, so that two alarms close together share one.
  let returning: Promise<void> | null = null;

  /**
   * Returns the display to the house account, or signs it out, once the break of the
   * venue mode is over: `venue.ts` decides, from the last input on the page and the
   * accounts, and a match that runs in any Autodarts tab counts as input, so the return
   * never ends one. A switch or a sign-out parks the session of the player before. With
   * no Autodarts tab open there is nothing to return; a house account that Autodarts
   * can't reach now is tried again at the next look, as is a sign-out while Autodarts
   * can't say whose the session in the page is, and one that has to sign in again signs
   * the page out then.
   */
  function returnAfterBreak(): Promise<void> {
    returning ??= (async () => {
      try {
        const [venue, stored] = await Promise.all([
          loadVenue(),
          api.storage.session.get([ACTIVITY_KEY]),
        ]);
        if (!returnsAfterBreak(venue)) {
          return;
        }
        const deps = anyPage();
        const view = await readView(deps);
        const before = parseActivity(stored[ACTIVITY_KEY]);
        const { step, lastActivity } = idleTick({
          venue,
          profiles: view.profiles,
          unsaved: view.unsaved,
          lastActivity: before,
          now: platform.now(),
          matchRunning: !(await noMatchRuns()),
        });
        if (lastActivity !== before) {
          await api.storage.session.set({ [ACTIVITY_KEY]: lastActivity });
        }
        if (step.kind === "switch") {
          await switchTo(deps, step.id);
        } else if (step.kind === "signout") {
          await leaveDisplay(deps);
        }
      } catch (error) {
        if (!(error instanceof NoPageError)) {
          throw error;
        }
      } finally {
        returning = null;
      }
    })();
    return returning;
  }

  /**
   * The first start after the install: waits for the first account, so that the session
   * that Autodarts signs in with next is saved by itself, and shows the welcome page, once.
   */
  async function welcome(): Promise<void> {
    await startAddingAccount(anyPage());
    await api.tabs.create({ url: api.runtime.getURL("welcome.html") });
  }

  function scheduleRefresh(when: number): Promise<void> {
    return api.alarms.create(REFRESH_ALARM, {
      when,
      periodInMinutes: REFRESH_PERIOD_MINUTES,
    });
  }

  // The run that is on its way, so that the alarm and a start that catches up share one.
  let refreshing: Promise<void> | null = null;

  /**
   * Renews the parked sessions and records how that went: the time, for the catch-up
   * after a restart, and whether Autodarts turned everyone away. Then it sets the alarm
   * for the next run, soon when Autodarts could not be reached for an account.
   */
  function refresh(): Promise<void> {
    refreshing ??= (async () => {
      try {
        const run = await refreshParked(anyPage());
        const now = platform.now();
        await api.storage.local.set({
          [HEALTH_KEY]: recordRun(await loadHealth(), run, now),
        });
        await scheduleRefresh(nextRunAt(run, now));
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  // The check of this start of the service worker, which runs once however it starts.
  let started: Promise<void> | null = null;

  /**
   * Makes sure that the renewal keeps running. Chrome may clear an alarm when the
   * browser restarts, and a computer that was off misses the run that was due, so each
   * start of the service worker sets the alarm again where it is missing and renews
   * straight away where the last run is a period ago. It also puts the badge back,
   * which a restart of the browser clears.
   */
  function ensureRenewal(): Promise<void> {
    started ??= (async () => {
      const [alarm, health] = await Promise.all([
        api.alarms.get(REFRESH_ALARM),
        loadHealth(),
      ]);
      // The badge must not hold up the renewal, nor a failure of it stop the renewal.
      showBadge().catch(logFailure("the badge"));
      // The alarm of the venue mode, which a restart of the browser may clear as well.
      loadVenue()
        .then(syncIdleAlarm)
        .catch(logFailure("the alarm of the venue mode"));
      const plan = planStart(alarm !== undefined, health, platform.now());
      if (plan.alarmAt !== null) {
        await scheduleRefresh(plan.alarmAt);
      }
      if (plan.refreshNow) {
        await refresh();
      }
    })().catch(logFailure("the check of the renewal at the start"));
    return started;
  }

  // An Autodarts page that finished loading may hold the session of a new sign-in.
  api.tabs.onUpdated.addListener((tabId, change, tab) => {
    if (change.status === "complete" && isPlayPage(tab.url)) {
      pickUp(tabId).catch(logFailure("saving a new sign-in"));
    }
  });

  // A closed tab may have held the session that the "+" stood for.
  api.tabs.onRemoved.addListener(() => {
    if (badgeText === "+") {
      showBadge().catch(logFailure("the badge"));
    }
  });

  api.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === REFRESH_ALARM) {
      refresh().catch(logFailure("the renewal of the parked sessions"));
    } else if (alarm.name === IDLE_ALARM) {
      returnAfterBreak().catch(logFailure("the return after a break"));
    }
  });

  // The browser starts, or the extension is installed or updated: these wake the
  // service worker, whose start then runs the check below. Only the install opens the
  // welcome page; an update stores the accounts in the format of the new version,
  // which seals the sessions and passwords that an earlier one kept in plain text.
  api.runtime.onStartup.addListener(() => {
    void ensureRenewal();
  });
  api.runtime.onInstalled.addListener((details) => {
    if (details.reason === "update") {
      shared
        .queue(() => store.migrate())
        .catch(logFailure("bringing the saved accounts up to date"));
    }
    void ensureRenewal();
    if (details.reason === "install" || details.reason === "update") {
      // Chrome runs the content script only in pages that load after an install or an
      // update, and the script of the version before loses its link to the extension. So
      // the open Autodarts tabs get the new script now, which takes over from the old one
      // without a reload: a display in kiosk mode keeps its button, a running match goes
      // on, and a tab that this misses gets the script at the next request (`tabs.ts`).
      injectAll(tabs).catch(
        logFailure("adding the button to the open Autodarts tabs"),
      );
    }
    if (welcomes(details.reason)) {
      welcome().catch(logFailure("the welcome"));
    }
  });

  api.action.setBadgeTextColor?.({ color: BADGE_TEXT_COLOR }).catch(() => {});
  return { ready: ensureRenewal() };
}
