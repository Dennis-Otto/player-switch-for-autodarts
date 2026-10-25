/**
 * The first set-up and the way to help, without the browser: when the welcome page
 * opens, and the bug form that the popup links to. The service worker and the popup
 * pass in what they read from the browser.
 */

/** The repository of the extension, where its issues and bug form are. */
export const REPOSITORY =
  "https://github.com/Dennis-Otto/player-switch-for-autodarts";

/**
 * Whether the welcome page opens for this reason of `chrome.runtime.onInstalled`: once,
 * after the install, and not after an update or a new version of Chrome.
 */
export function welcomes(reason: string): boolean {
  return reason === "install";
}

/** A brand of the browser, as `navigator.userAgentData.brands` lists it. */
export interface Brand {
  brand: string;
  version: string;
}

/** The made-up brand that a browser adds to its list, so that nobody relies on its order. */
const GREASE = /not.a.brand/i;

/**
 * The browser and its major version for a bug report, such as "Google Chrome 130": its
 * own brand before that of Chromium, and, where the browser lists no brands, as Firefox
 * doesn't, the version of Firefox or Chrome in its user agent. Nothing else of the
 * browser goes into the report.
 */
export function browserName(
  brands: readonly Brand[] | undefined,
  userAgent: string,
): string {
  const known = (brands ?? []).filter(({ brand }) => !GREASE.test(brand));
  const named = known.find(({ brand }) => brand !== "Chromium") ?? known[0];
  if (named !== undefined) {
    return `${named.brand} ${named.version}`;
  }
  const firefox = /Firefox\/(\d+)/.exec(userAgent);
  if (firefox !== null) {
    return `Firefox ${firefox[1]}`;
  }
  const chrome = /Chrome\/(\d+)/.exec(userAgent);
  return chrome === null ? "unknown" : `Chrome ${chrome[1]}`;
}

/**
 * The bug form of the repository, filled in with the version of the extension and the
 * browser, and with nothing else: no account, no address and no log.
 */
export function reportUrl(version: string, browser: string): string {
  const query = new URLSearchParams({
    template: "bug_report.yml",
    version,
    browser,
  });
  return `${REPOSITORY}/issues/new?${query.toString()}`;
}
