/**
 * What the popup and the switcher in the Autodarts page decide, apart from the page that
 * shows it: what the status line says after an answer of the service worker, which
 * question an answer asks of the person, what a tile shows, and when "Manage accounts"
 * opens. `pages/players.ts` draws it and sends the taps; the end-to-end tests check the
 * two together in the real extension.
 *
 * Every text comes from `t`, the texts of the extension, which a test passes in.
 */
import { failingSince, renewedAgo } from "./health.ts";
import type {
  Answers,
  PlayersAction,
  PlayersReply,
  PlayersView,
  PlayerView,
} from "./messages.ts";

/** The texts of the extension, as `chrome.i18n.getMessage` gives them. */
export type Translate = (key: string, substitution?: string) => string;

/** What the status line says: an error in the region that is read out at once. */
export interface Status {
  text: string;
  error: boolean;
}

/** What to say when a request failed: `signInHint` when the account has to sign in again. */
export function problemOf(
  reason: string,
  signInHint: string | null,
  t: Translate,
): string {
  if (reason === "unreachable") {
    return t("unreachable");
  }
  if (reason === "locked") {
    return t("pinLocked");
  }
  return signInHint ?? t("error");
}

/**
 * What the status line says once the service worker answered, or didn't (`undefined`):
 * a problem, the account that was saved by itself, or nothing, as the tiles show how it
 * ended, so "Switching to …" goes.
 */
export function statusAfter(
  reply: PlayersReply | undefined,
  signInHint: string | null,
  t: Translate,
): Status {
  if (reply === undefined) {
    return { text: t("error"), error: true };
  }
  if ("error" in reply) {
    if (reply.error === "noPage") {
      return { text: t("noPage"), error: true };
    }
    if (reply.error === "unknownFormat") {
      return { text: t("unknownFormat"), error: true };
    }
    return { text: t("error"), error: true };
  }
  if (!reply.ok) {
    return { text: problemOf(reply.reason, signInHint, t), error: true };
  }
  if (typeof reply.saved === "string") {
    // A new account signed in before the page could tell; it was saved just now.
    return { text: t("savedAccount", reply.saved), error: false };
  }
  return { text: "", error: false };
}

/** What the worker asks of the person before it goes on: a yes, or a PIN. */
export type Question =
  /** A match runs in the page, which the request would end. */
  | { kind: "match" }
  /** A PIN guards the request: the one of the account, or the manager PIN. */
  | { kind: "pin"; manager: boolean; wrong: boolean };

/** The question that an answer of the worker asks, or null when it asks none. */
export function questionOf(reply: PlayersReply | undefined): Question | null {
  if (reply === undefined || "error" in reply || reply.ok) {
    return null;
  }
  if (reply.reason === "match") {
    return { kind: "match" };
  }
  if (reply.reason === "pin") {
    return {
      kind: "pin",
      manager: reply.pin === "manager",
      wrong: reply.wrong,
    };
  }
  return null;
}

/** A request of the popup, as it goes to the worker, without its type. */
export type Ask = PlayersAction & Answers;

/**
 * The request once more, with the answer of the person to the question: their yes to
 * end the match, or the `pin` that they entered.
 */
export function answered(message: Ask, question: Question, pin = ""): Ask {
  if (question.kind === "match") {
    return { ...message, confirmed: true };
  }
  return question.manager
    ? { ...message, managerPin: pin }
    : { ...message, pin };
}

/** The texts of the question for a PIN: of the account `name`, or the manager PIN. */
export function pinQuestion(
  question: { manager: boolean; wrong: boolean },
  name: string,
  t: Translate,
): { title: string; text: string; error: string } {
  return {
    title: question.manager ? t("managerPinTitle") : t("pinTitle", name),
    text: question.manager ? t("managerPinText") : t("pinText"),
    error: question.wrong ? t("pinWrong") : "",
  };
}

/** The manager PIN to keep: the one of a request that worked, or the one before. */
export function keptManagerPin(
  before: string | null,
  message: Ask,
  reply: PlayersReply | undefined,
): string | null {
  return reply !== undefined &&
    !("error" in reply) &&
    reply.ok &&
    typeof message.managerPin === "string"
    ? message.managerPin
    : before;
}

/** What a tile shows of an account. */
export interface Tile {
  /** The key that picks it, "1" to "9", or null. */
  key: string | null;
  /** The chip of the player who plays, or of an account that has to sign in again. */
  chip: { text: string; kind: "playing" | "warn" } | null;
  /** In "Manage accounts": when the renewal of the parked session last worked. */
  renewed: string | null;
  /** In "Manage accounts": since when the renewal fails, while the extension keeps trying. */
  failing: string | null;
  /** The text of the toggle that remembers or forgets the password. */
  toggle: string;
}

/** What the tile of an account shows, the `index`-th of the list. */
export function tileOf(
  profile: PlayerView,
  index: number,
  options: { numbered: boolean; now: number; language: string; t: Translate },
): Tile {
  const { t, language } = options;
  let chip: Tile["chip"] = null;
  if (profile.active) {
    chip = { text: t("playing"), kind: "playing" };
  } else if (profile.needsSignIn) {
    chip = { text: t("needsSignIn"), kind: "warn" };
  }
  return {
    key: options.numbered && index < 9 ? String(index + 1) : null,
    chip,
    renewed:
      profile.renewedAt === null
        ? null
        : t("renewed", renewedAgo(profile.renewedAt, options.now, language)),
    failing:
      profile.renewalFailingSince === null
        ? null
        : t(
            "renewalFailing",
            failingSince(profile.renewalFailingSince, language),
          ),
    toggle: profile.remembersPassword
      ? t("forgetPassword")
      : t("rememberPassword"),
  };
}

/** Whether the popup says that there is no account yet: with nothing else to show or say. */
export function showsEmpty(view: PlayersView, problem: string): boolean {
  return (
    view.profiles.length === 0 &&
    !view.unsaved &&
    !view.adding &&
    problem === ""
  );
}

/** "Manage accounts": whether it is open, and the manager PIN that opened it. */
export interface Manage {
  managing: boolean;
  managerPin: string | null;
}

/**
 * Whether a tap on "Manage accounts" has to ask the worker first: while a manager PIN
 * guards it, it opens only with that PIN.
 */
export function mustUnlock(manage: Manage, guarded: boolean): boolean {
  return !manage.managing && guarded && manage.managerPin === null;
}

/** "Manage accounts" after a tap: open or closed, and the manager PIN forgotten as it closes. */
export function toggled(manage: Manage): Manage {
  const managing = !manage.managing;
  return { managing, managerPin: managing ? manage.managerPin : null };
}
