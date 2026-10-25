/**
 * The switcher in the Autodarts page, without the browser: where its button sits,
 * whether the page shows it at all, which player the button shows, which tile a key
 * picks, and whether a match is running in the page, so that a switch asks first.
 *
 * The service worker, the options page and the switcher import this file from lib/;
 * nothing here reaches the network, the storage or the page.
 */
import type { State } from "./state.ts";

/**
 * The origins of Autodarts Play, where the extension runs; the manifest lists the same.
 * play.autodarts.io forwards every address to play.autodarts.com, so no page of it ever
 * shows, and the extension asks for no access to it.
 */
export const PLAY_ORIGINS: readonly string[] = ["https://play.autodarts.com"];

/** The key under which the extension keeps the settings of the page in its storage. */
export const SETTINGS_KEY = "pageSettings";

/** The corners of the page where the button can sit, the default first. */
export const CORNERS = [
  "bottom-right",
  "bottom-left",
  "top-right",
  "top-left",
] as const;

export type Corner = (typeof CORNERS)[number];

/** What a person can set for the switcher in the page, on the options page. */
export interface PageSettings {
  /** The Autodarts page shows the button that opens the switcher. */
  showButton: boolean;
  /** The corner of the page where the button sits. */
  corner: Corner;
}

/** The button shows, at the bottom right, until a person chooses otherwise. */
export const DEFAULT_SETTINGS: PageSettings = {
  showButton: true,
  corner: CORNERS[0],
};

/** What the button in the page shows of the player: their picture or initial, and their name. */
export interface ButtonPlayer {
  name: string;
  picture: string | null;
  initial: string;
}

/** What the content script needs to draw the button, and nothing more. */
export interface ButtonView {
  settings: PageSettings;
  /** The account that plays, or null when none of the saved ones does. */
  player: ButtonPlayer | null;
}

function isCorner(value: unknown): value is Corner {
  return CORNERS.some((corner) => corner === value);
}

/**
 * Reads the stored settings, and takes the default for each one that is missing or
 * that it doesn't recognise, such as one an older or newer version wrote.
 */
export function parseSettings(stored: unknown): PageSettings {
  if (stored === null || typeof stored !== "object") {
    return { ...DEFAULT_SETTINGS };
  }
  const { showButton, corner } = stored as Record<string, unknown>;
  return {
    showButton:
      typeof showButton === "boolean"
        ? showButton
        : DEFAULT_SETTINGS.showButton,
    corner: isCorner(corner) ? corner : DEFAULT_SETTINGS.corner,
  };
}

/**
 * The letter that stands in for a missing picture: the first character of the name,
 * or of the username when the name is empty, in capitals; a question mark when both
 * are empty. A character outside the basic plane, such as an emoji, stays whole.
 */
export function initialOf(identity: {
  name: string;
  username: string;
}): string {
  const source = identity.name.trim() || identity.username.trim();
  const [first] = source;
  return first === undefined ? "?" : first.toUpperCase();
}

/** What the button shows: the settings, and the account that plays, without its session. */
export function toButtonView(
  state: State,
  storedSettings: unknown,
): ButtonView {
  const active = state.profiles.find(
    (profile) => profile.id === state.activeId,
  );
  return {
    settings: parseSettings(storedSettings),
    player:
      active === undefined
        ? null
        : {
            name: active.name,
            picture: active.picture,
            initial: initialOf(active),
          },
  };
}

function parse(url: string | undefined): URL | null {
  if (url === undefined || !URL.canParse(url)) {
    return null;
  }
  return new URL(url);
}

/** The address is a page of Autodarts Play, where the switcher can open. */
export function isPlayPage(url: string | undefined): boolean {
  const parsed = parse(url);
  return parsed !== null && PLAY_ORIGINS.includes(parsed.origin);
}

/**
 * The address is a match that runs in Autodarts Play, `/matches/<id>`. A switch
 * reloads the page and so ends the match on that display. The history of a match
 * that has ended, under `/history/`, is no match that runs.
 */
export function isMatchPage(url: string | undefined): boolean {
  const parsed = parse(url);
  return (
    parsed !== null &&
    PLAY_ORIGINS.includes(parsed.origin) &&
    /^\/matches\/[^/]+/.test(parsed.pathname)
  );
}

/**
 * A switch, or the sign-out that makes room for a new account, has to ask first: the
 * page shows a match that runs, and the person hasn't confirmed yet that it may end.
 * Only a confirmation of `true` counts.
 */
export function mustConfirm(
  url: string | undefined,
  confirmed: unknown,
): boolean {
  return confirmed !== true && isMatchPage(url);
}

/**
 * The tile that a key picks: the keys 1 to 9 pick the first nine tiles, in their
 * order on the screen. Any other key, or a number past the last tile, picks none.
 */
export function tileForKey(key: string, count: number): number | null {
  if (!/^[1-9]$/.test(key)) {
    return null;
  }
  const index = Number(key) - 1;
  return index < count ? index : null;
}

/** What the options page needs of the browser to open the keyboard shortcuts. */
export interface ShortcutsApi {
  /** Firefox (137 and later) has it; Chrome and Edge don't. */
  readonly commands?: { readonly openShortcutSettings?: () => Promise<void> };
  readonly tabs: {
    readonly create: (properties: { url: string }) => Promise<unknown>;
  };
}

/**
 * Opens the page where a player changes the keyboard shortcuts: in Firefox through
 * `commands.openShortcutSettings`, because Firefox refuses `chrome:` addresses in a new
 * tab; in Chrome and Edge `chrome://extensions/shortcuts`, which Edge shows as
 * `edge://extensions/shortcuts`.
 */
export function openShortcuts(api: ShortcutsApi): Promise<unknown> {
  const open = api.commands?.openShortcutSettings;
  if (typeof open === "function") {
    return open.call(api.commands);
  }
  return api.tabs.create({ url: "chrome://extensions/shortcuts" });
}
