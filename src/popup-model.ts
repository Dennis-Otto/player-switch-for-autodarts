/**
 * What the popup and the switcher in the Autodarts page decide, apart from the page that
 * shows it: what the status line says after an answer of the service worker, which
 * question an answer asks of the person, what a tile shows, such as "Join the lobby" or
 * "Join again" on a page with a lobby, or what a player at a venue display does with their
 * own account, and when "Manage accounts" opens. `pages/players.ts` draws it and sends the taps; the end-to-end tests check the
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

/**
 * What to say when a request failed: `signInHint` when the account has to sign in again.
 * A join that took no seat, and a sign-in of another account at "Remember password", name
 * the account of the request, `name`.
 */
export function problemOf(
  reason: string,
  signInHint: string | null,
  t: Translate,
  name = "",
): string {
  switch (reason) {
    case "unreachable":
      return t("unreachable");
    case "locked":
      return t("pinLocked");
    // The Autodarts tab shows no lobby (any more), such as after the match began.
    case "noLobby":
      return t("joinNoLobby");
    // The account plays on the page: Autodarts seats it there, without the extension.
    case "playing":
      return t("joinPlaying", name);
    // Autodarts refused the seat: the lobby is full, started or closed.
    case "refused":
      return t("joinRefused", name);
    // "Remember password": Autodarts refused the sign-in, or it is the sign-in of another
    // account than the tile's, `name`.
    case "password":
      return t("rememberRefused");
    case "otherAccount":
      return t("rememberOtherAccount", name);
    default:
      return signInHint ?? t("error");
  }
}

/** What a request was about, for the status line: its action and the name of its account. */
export interface About {
  action: string;
  name: string;
}

/**
 * What a removal says: that Autodarts ended the sessions, or couldn't be reached, in
 * which case a session lasts until it expires, which the person hears at once.
 */
export function removalText(
  about: About,
  ended: boolean,
  t: Translate,
): string {
  if (about.action === "forgetAll") {
    return ended ? t("forgotAll") : t("forgotAllOffline");
  }
  return ended ? t("removed", about.name) : t("removedOffline", about.name);
}

/**
 * The question before a request ends the match that runs in the page: a switch, a
 * removal that signs the player out there, or "Save account", which reloads the page.
 */
export function matchQuestion(
  action: string,
  t: Translate,
): { title: string; text: string; confirm: string; cancel: string } {
  let text = t("matchText");
  let confirm = t("matchConfirm");
  if (action === "removeAccount" || action === "forgetAll") {
    text = t("matchSignOutText");
    confirm = t("matchSignOutConfirm");
  } else if (action === "adopt") {
    text = t("matchSaveText");
    confirm = t("matchSaveConfirm");
  }
  return { title: t("matchTitle"), text, confirm, cancel: t("matchCancel") };
}

/** Whether "Forget all accounts" shows: in "Manage accounts", while an account is saved. */
export function showsForgetAll(managing: boolean, accounts: number): boolean {
  return managing && accounts > 0;
}

/**
 * What the status line says once the service worker answered, or didn't (`undefined`):
 * a problem, the account that was saved by itself, how a removal ended, who joined the
 * lobby, or nothing, as the tiles show how it ended, so "Switching to …" goes. `about` names the request, and
 * its account as the tiles showed it before the removal.
 */
export function statusAfter(
  reply: PlayersReply | undefined,
  signInHint: string | null,
  t: Translate,
  about: About = { action: "", name: "" },
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
    return {
      text: problemOf(reply.reason, signInHint, t, about.name),
      error: true,
    };
  }
  if (typeof reply.saved === "string") {
    // A new account signed in before the page could tell; it was saved just now.
    return { text: t("savedAccount", reply.saved), error: false };
  }
  if (typeof reply.ended === "boolean") {
    return { text: removalText(about, reply.ended, t), error: !reply.ended };
  }
  if (about.action === "protect") {
    // The tile shows the lock from now on; the line says whose account it guards.
    return { text: t("protectedOwn", about.name), error: false };
  }
  if (typeof reply.joined === "string") {
    // A player who still sat in the lobby kept that seat, and nothing changed there.
    return {
      text:
        reply.kept === true
          ? t("joinKept", reply.joined)
          : t("joinedLobby", reply.joined),
      error: false,
    };
  }
  return { text: "", error: false };
}

/**
 * Whether "Remember password" kept nothing because of what the form held, or because
 * Autodarts couldn't check it: the form then opens again. A PIN that was asked for and
 * not given, or a worker that didn't answer, leaves it closed.
 */
export function rememberRefused(reply: PlayersReply | undefined): boolean {
  return (
    reply !== undefined &&
    !("error" in reply) &&
    !reply.ok &&
    (reply.reason === "password" ||
      reply.reason === "otherAccount" ||
      reply.reason === "unreachable")
  );
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

/**
 * The texts of the question for a PIN: of the account `name`, or the manager PIN. The
 * PIN of an account before a removal (`action`) says that it removes the account, and
 * before a new PIN of the account, that it changes the PIN that the account has.
 */
export function pinQuestion(
  question: { manager: boolean; wrong: boolean },
  name: string,
  t: Translate,
  action = "",
): { title: string; text: string; error: string } {
  let text = t("pinText");
  if (question.manager) {
    text = t("managerPinText");
  } else if (action === "removeAccount") {
    text = t("removeOwnPinText");
  } else if (action === "protect") {
    text = t("changePinText");
  }
  return {
    title: question.manager ? t("managerPinTitle") : t("pinTitle", name),
    text,
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
  /**
   * The chip of the player who plays, of an account that has to sign in again, or of
   * one that the extension seated in the lobby that the page shows.
   */
  chip: { text: string; kind: "playing" | "warn" | "lobby" } | null;
  /**
   * The button below the tile that seats the account in the lobby, on a page with a
   * lobby, for a parked account, or null: "Join the lobby" for one that takes no seat
   * there yet, and the quieter "Join again" (`again`) for one that the extension seated,
   * since the host or Autodarts may have taken it out since. `label` is its name for a
   * screen reader, with the name of the account.
   */
  join: { text: string; label: string; again: boolean } | null;
  /**
   * The button below the tile of the player who plays, at a display with a manager PIN,
   * with which that player looks after their own account (decision 0018): "Protect with
   * a PIN" for the account that the view names as `protectable`, and "Remove my account"
   * for the one it names as `removable`, which asks for its PIN. `label` is its name for a screen reader:
   * its text and the name of the account, as the options page names its buttons. Null
   * for every other tile.
   */
  own: { text: string; label: string; kind: "protect" | "remove" } | null;
  /** In "Manage accounts": when the renewal of the parked session last worked. */
  renewed: string | null;
  /** In "Manage accounts": since when the renewal fails, while the extension keeps trying. */
  failing: string | null;
  /** The text of the toggle that remembers or forgets the password. */
  toggle: string;
}

/** The own action of the player who plays on the tile of `profile`, as `Tile.own` says. */
function ownOf(
  profile: PlayerView,
  venue: PlayersView["venue"] | undefined,
  t: Translate,
): Tile["own"] {
  if (venue === undefined || !venue.manager || !profile.active) {
    return null;
  }
  let kind: "protect" | "remove";
  if (venue.protectable === profile.id) {
    kind = "protect";
  } else if (venue.removable === profile.id) {
    kind = "remove";
  } else {
    return null;
  }
  const text = kind === "protect" ? t("protectOwn") : t("removeOwn");
  return { text, label: `${text}: ${profile.name}`, kind };
}

/**
 * What the tile of an account shows, the `index`-th of the list. `lobby` is the lobby
 * that the page shows, from the view, or null on any other page, and `venue` the venue
 * mode of the view.
 */
export function tileOf(
  profile: PlayerView,
  index: number,
  options: {
    numbered: boolean;
    now: number;
    language: string;
    t: Translate;
    lobby?: PlayersView["lobby"];
    venue?: PlayersView["venue"];
  },
): Tile {
  const { t, language, lobby = null } = options;
  let chip: Tile["chip"] = null;
  let join: Tile["join"] = null;
  if (profile.active) {
    chip = { text: t("playing"), kind: "playing" };
  } else if (profile.needsSignIn) {
    // Without a parked session, the account can't take a seat until it signs in again.
    chip = { text: t("needsSignIn"), kind: "warn" };
  } else if (lobby?.seated.includes(profile.id)) {
    // The chip says what the extension did, not what Autodarts shows now (`lobby.ts`):
    // a host may have taken the player out since. A join again reads the lobby first
    // and keeps a seat that the player still has.
    chip = { text: t("inLobby"), kind: "lobby" };
    join = {
      text: t("joinAgain"),
      label: t("joinAgainAs", profile.name),
      again: true,
    };
  } else if (lobby !== null) {
    join = {
      text: t("joinLobby"),
      label: t("joinLobbyAs", profile.name),
      again: false,
    };
  }
  return {
    key: options.numbered && index < 9 ? String(index + 1) : null,
    chip,
    join,
    own: ownOf(profile, options.venue, t),
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

/**
 * Whether the popup says that there is no account yet: with nothing else to show or
 * say, such as a message that every account is forgotten.
 */
export function showsEmpty(
  view: PlayersView,
  problem: string,
  status = "",
): boolean {
  return (
    view.profiles.length === 0 &&
    !view.unsaved &&
    !view.adding &&
    status === "" &&
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
