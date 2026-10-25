/**
 * The messages between the parts of the extension, as one set of types that all of them
 * share: the popup and the switcher (`pages/players.ts`), the options page
 * (`pages/options.ts`), the service worker (`worker.ts`) and the content script in the
 * Autodarts page (`content.ts`). A renamed action or a missing field fails the type
 * check, not a tap on the display.
 *
 * A message arrives as `unknown`, so the service worker reads each one with
 * `readRequest` before it acts: a message of a shape it doesn't know gets no answer.
 * The content script can't import a module, so it takes the types alone, which the
 * compiler leaves out of the script it writes.
 */
import type { ButtonView } from "./page.ts";
import type { ProfileView, View } from "./state.ts";

/**
 * What a request carries besides its action once the person answered a question of the
 * worker: the manager PIN that opened "Manage accounts" or the options page, the PIN of
 * the account, and the yes to end the match that runs in the page.
 */
export interface Answers {
  readonly managerPin?: string;
  readonly pin?: string;
  readonly confirmed?: boolean;
}

/** What the popup and the switcher ask the service worker to do with the accounts. */
export type PlayersAction =
  /** The players as they are; also saves a new account that signed in meanwhile. */
  | { readonly action: "view" }
  /** Brings an account onto the page. */
  | { readonly action: "switch"; readonly id: string }
  /** Saves the session on the page as an account. */
  | { readonly action: "adopt" }
  /** Signs the page out for a new account, which is saved as it signs in. */
  | { readonly action: "signout" }
  /** Opens Autodarts, or shows its tab. */
  | { readonly action: "openPage" }
  /** Stops waiting for a new account. */
  | { readonly action: "stopAdding" }
  /** Remembers the password of an account. */
  | {
      readonly action: "remember";
      readonly id: string;
      readonly username: string;
      readonly password: string;
    }
  | { readonly action: "forgetPassword"; readonly id: string }
  /** Ends the session of an account at Autodarts and forgets the account. */
  | { readonly action: "removeAccount"; readonly id: string }
  /** Ends every session at Autodarts and deletes all that the extension keeps. */
  | { readonly action: "forgetAll" }
  /** Opens "Manage accounts", which needs the manager PIN while one is set. */
  | { readonly action: "unlock" };

export type PlayersRequest = { readonly type: "popup" } & PlayersAction &
  Answers;

/** What the options page asks the service worker to do with the venue mode. */
export type VenueAction =
  | { readonly action: "status" }
  | { readonly action: "unlock" }
  /** A new manager PIN, or null to take it away. */
  | { readonly action: "managerPin"; readonly pin: string | null }
  /** A new PIN of an account, or null to take it away. */
  | {
      readonly action: "playerPin";
      readonly id: string;
      readonly pin: string | null;
    }
  /** The return after a break: after how many minutes, and to which account. */
  | {
      readonly action: "idle";
      readonly minutes: number | null;
      readonly house: string | null;
    };

export type VenueRequest = { readonly type: "venue" } & VenueAction &
  Pick<Answers, "managerPin">;

/** Every request that the service worker takes. */
export type WorkerRequest =
  | PlayersRequest
  | VenueRequest
  /** The content script asks what its button shows. */
  | { readonly type: "button" }
  /** The content script saw an input on the page, which the venue mode counts. */
  | { readonly type: "activity" }
  /** The switcher in the page asks to close. */
  | { readonly type: "switcher"; readonly action: "close" };

/** What the service worker tells or asks the content script of an Autodarts tab. */
export type PageRequest =
  | { readonly type: "page"; readonly action: "read" }
  | { readonly type: "page"; readonly action: "write"; readonly token: string }
  | { readonly type: "page"; readonly action: "clear" }
  | { readonly type: "page"; readonly action: "toggleSwitcher" }
  | { readonly type: "page"; readonly action: "closeSwitcher" }
  | {
      readonly type: "page";
      readonly action: "button";
      readonly view: PageButtonView;
    };

/** What the content script answers to "read": the session of the page, or null. */
export interface TokenReply {
  readonly token: string | null;
}

/** What the content script answers to any other request: whether it did it. */
export interface DoneReply {
  readonly ok: boolean;
}

/**
 * What the button in the page shows, and whether the content script tells the worker of
 * the inputs on the page, which only the return of the venue mode after a break needs.
 */
export interface PageButtonView extends ButtonView {
  readonly reportActivity: boolean;
}

/** An account as the popup shows it: whether it asks for a PIN, never the hash. */
export interface PlayerView extends ProfileView {
  pin: boolean;
}

/** What the popup and the switcher show. */
export interface PlayersView extends View {
  profiles: PlayerView[];
  /** Whether a manager PIN guards "Manage accounts". */
  venue: { manager: boolean };
  /** Whether to suggest an update of the extension. */
  updateHint: boolean;
}

/** Which PIN the worker waits for: the one of the account, or the manager PIN. */
export type PinKind = "player" | "manager";

/** A request that a PIN guards and that carries none, a wrong one, or one too many. */
export type Refusal =
  | {
      readonly ok: false;
      readonly reason: "pin";
      readonly pin: PinKind;
      readonly wrong: boolean;
    }
  | { readonly ok: false; readonly reason: "locked"; readonly retryIn: number };

/**
 * How a request of the popup ended, before the view goes with it. `page` says whether
 * an Autodarts tab answered, when the action asked one, so the popup knows when to
 * offer "Open Autodarts".
 */
export type Outcome =
  | {
      readonly ok: true;
      readonly page?: boolean;
      /** The name of a new account that was saved just now. */
      readonly saved?: string;
      /** After a removal: whether Autodarts ended the sessions, or couldn't be reached. */
      readonly ended?: boolean;
    }
  /** A match runs in the page: the worker spent no token yet and waits for a yes. */
  | { readonly ok: false; readonly reason: "match" }
  /** The account has to sign in again, or Autodarts could not be reached. */
  | {
      readonly ok: false;
      readonly reason: "signin" | "unreachable";
      readonly page: true;
    }
  | Refusal;

/** What a page of the extension can't get past, and the popup says. */
export type Failure = "noPage" | "unknownFormat" | "error";

/** The answer to a request of the popup or the switcher. */
export type PlayersReply =
  | (Outcome & { readonly view: PlayersView })
  | {
      readonly error: Failure;
      readonly page?: false;
      readonly view: PlayersView;
    };

/** An account in the venue settings of the options page. */
export interface VenueAccount {
  readonly id: string;
  readonly name: string;
  readonly username: string;
  readonly pin: boolean;
}

/** What the options page shows of the venue mode: never a hash of a PIN. */
export interface VenueStatus {
  readonly manager: boolean;
  readonly idleMinutes: number | null;
  readonly house: string | null;
  readonly accounts: readonly VenueAccount[];
}

/** How a request of the options page ended, before the status goes with it. */
export type VenueOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "invalid" }
  | Refusal;

/** The answer to a request of the options page. */
export type VenueReply =
  | (VenueOutcome & { readonly status: VenueStatus })
  | { readonly error: "error"; readonly status: VenueStatus | null };

type Fields = Readonly<Record<string, unknown>>;

const isString = (value: unknown): value is string => typeof value === "string";
const isStringOrNull = (value: unknown): value is string | null =>
  value === null || isString(value);
const isNumberOrNull = (value: unknown): value is number | null =>
  value === null || typeof value === "number";

/** Whether a field is absent, or present with a value that passes the check. */
function optional(
  fields: Fields,
  name: string,
  check: (value: unknown) => boolean,
): boolean {
  return fields[name] === undefined || check(fields[name]);
}

/** Whether the answers that a request carries have the right types. */
function answersFit(fields: Fields): boolean {
  return (
    optional(fields, "managerPin", isString) &&
    optional(fields, "pin", isString) &&
    optional(fields, "confirmed", (value) => typeof value === "boolean")
  );
}

/** The fields that each action of the popup needs, and the check of each. */
const PLAYERS_FIELDS: Readonly<
  Record<PlayersAction["action"], Readonly<Record<string, typeof isString>>>
> = {
  view: {},
  switch: { id: isString },
  adopt: {},
  signout: {},
  openPage: {},
  stopAdding: {},
  remember: { id: isString, username: isString, password: isString },
  forgetPassword: { id: isString },
  removeAccount: { id: isString },
  forgetAll: {},
  unlock: {},
};

/** The fields that each action of the options page needs, and the check of each. */
const VENUE_FIELDS: Readonly<
  Record<
    VenueAction["action"],
    Readonly<Record<string, (value: unknown) => boolean>>
  >
> = {
  status: {},
  unlock: {},
  managerPin: { pin: isStringOrNull },
  playerPin: { id: isString, pin: isStringOrNull },
  idle: { minutes: isNumberOrNull, house: isStringOrNull },
};

/** Whether an action is one of the table, and the message has each field it needs. */
function fits(
  table: Readonly<
    Record<string, Readonly<Record<string, (value: unknown) => boolean>>>
  >,
  fields: Fields,
): boolean {
  const action = fields.action;
  if (!isString(action) || !Object.hasOwn(table, action)) {
    return false;
  }
  const needs = table[action] as Readonly<
    Record<string, (value: unknown) => boolean>
  >;
  return Object.entries(needs).every(([name, check]) => check(fields[name]));
}

/**
 * Reads a message that the service worker received: the request it stands for, or null
 * for a message of a shape that the worker doesn't know, which then gets no answer.
 */
export function readRequest(message: unknown): WorkerRequest | null {
  if (message === null || typeof message !== "object") {
    return null;
  }
  const fields = message as Fields;
  switch (fields.type) {
    case "popup":
      return fits(PLAYERS_FIELDS, fields) && answersFit(fields)
        ? (message as PlayersRequest)
        : null;
    case "venue":
      return fits(VENUE_FIELDS, fields) &&
        optional(fields, "managerPin", isString)
        ? (message as VenueRequest)
        : null;
    case "button":
    case "activity":
      return message as WorkerRequest;
    case "switcher":
      return fields.action === "close" ? (message as WorkerRequest) : null;
    default:
      return null;
  }
}
