/**
 * What the options page decides, apart from the page that shows it: the corners of the
 * button in the order in which they lie on the screen, what the page says after a
 * request of the venue mode, and what it shows of the manager PIN, of each account and
 * of the return after a break. `pages/options.ts` draws it; the end-to-end tests check
 * the two together in the real extension.
 */
import type { VenueAccount, VenueReply, VenueStatus } from "./messages.ts";
import { CORNERS, type Corner } from "./page.ts";
import type { Translate } from "./popup-model.ts";
import { IDLE_MINUTES } from "./venue.ts";

/** A choice of a list, with its value and its text. */
export interface Choice {
  value: string;
  text: string;
}

/** The corners as they lie on the screen, in two rows: the top ones first. */
const SCREEN_ORDER: readonly Corner[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

/** The corners of the button, each with its name, in the order of the screen. */
export function cornerChoices(t: Translate): Choice[] {
  const names: Record<Corner, string> = {
    "top-left": t("cornerTopLeft"),
    "top-right": t("cornerTopRight"),
    "bottom-left": t("cornerBottomLeft"),
    "bottom-right": t("cornerBottomRight"),
  };
  return SCREEN_ORDER.filter((corner) => CORNERS.includes(corner)).map(
    (corner) => ({ value: corner, text: names[corner] }),
  );
}

/**
 * What the status line of the page says after a request of the venue mode: a problem,
 * "Saved", or nothing when the person cancelled the question for the manager PIN.
 */
export function venueReport(
  reply: VenueReply | undefined,
  t: Translate,
): string {
  if (reply === undefined || "error" in reply) {
    return t("error");
  }
  if (reply.ok) {
    return t("saved");
  }
  if (reply.reason === "locked") {
    return t("pinLocked");
  }
  if (reply.reason === "invalid") {
    return t("pinInvalid");
  }
  return "";
}

/** What the page shows of the manager PIN. */
export function managerView(
  status: VenueStatus,
  t: Translate,
): { state: string; set: string; removable: boolean } {
  return status.manager
    ? {
        state: t("managerPinOn"),
        set: t("changeManagerPin"),
        removable: true,
      }
    : { state: t("managerPinOff"), set: t("setManagerPin"), removable: false };
}

/** What the row of an account in the list of the PINs shows. */
export function playerRowView(
  account: VenueAccount,
  t: Translate,
): { state: string; change: string; removable: boolean } {
  return {
    state: `${account.username} · ${account.pin ? t("pinSet") : t("noPin")}`,
    change: account.pin ? t("changePin") : t("setPin"),
    removable: account.pin,
  };
}

/** The choices of the break after which the display returns, "" for never. */
export function idleChoices(t: Translate): Choice[] {
  return [
    { value: "", text: t("idleNever") },
    ...IDLE_MINUTES.map((count) => ({
      value: String(count),
      text: t("idleMinutes", String(count)),
    })),
  ];
}

/** The choices of where the display returns: a sign-out, "", or one of the accounts. */
export function houseChoices(status: VenueStatus, t: Translate): Choice[] {
  return [
    { value: "", text: t("idleSignOut") },
    ...status.accounts.map((account) => ({
      value: account.id,
      text: account.name,
    })),
  ];
}

/** The request that saves the return after a break, from the values of the two lists. */
export function idleRequest(
  minutes: string,
  house: string,
): { action: "idle"; minutes: number | null; house: string | null } {
  return {
    action: "idle",
    minutes: minutes === "" ? null : Number(minutes),
    house: house === "" ? null : house,
  };
}
