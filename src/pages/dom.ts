/**
 * What every page of the extension shares: its texts in the language of the extension,
 * and the elements of its HTML. The pages in this folder are the glue between the HTML
 * and the logic of `src/`: they hold no decision of their own (see `popup-model.ts` and
 * `options-model.ts`), and the end-to-end tests and the check of the accessibility run
 * them in a real browser.
 */

/** A text of the extension in its language, as `_locales/` has it. */
export const t = (key: string, substitution?: string): string =>
  chrome.i18n.getMessage(key, substitution);

/**
 * The element of the page that a selector names; fails when the HTML lacks it, which
 * the checks of the pages and the end-to-end tests catch.
 */
export function find<E extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): E {
  const element = root.querySelector<E>(selector);
  if (element === null) {
    throw new Error(`The page lacks ${selector}.`);
  }
  return element;
}

/**
 * The version of the copy that runs, as chrome://extensions shows it: a beta carries
 * its full number, such as 1.6.0-beta.2, in version_name, because Chrome takes only
 * numbers in version (scripts/package-extension.sh).
 */
export function runningVersion(): string {
  const { version, version_name } = chrome.runtime.getManifest();
  return version_name ?? version;
}

/**
 * Writes which version of the extension runs, such as "Player Switch 1.6.0", into each
 * element of the page marked data-version. The number comes from the manifest of the
 * copy that runs, never from one written down here: Chrome fetches the update of an
 * extension only every few hours, so the store may offer a newer version than the
 * one at the board, and the help says how to fetch it at once.
 */
export function showVersion(root: ParentNode): void {
  const text = t("version", runningVersion());
  for (const element of root.querySelectorAll<HTMLElement>("[data-version]")) {
    element.textContent = text;
  }
}

/**
 * Fills every element that carries a data-i18n key with its translated text, the
 * <title> of the page as well, and gives every one with a data-i18n-label key its
 * translated name for screen readers.
 */
export function translate(root: ParentNode): void {
  for (const element of root.querySelectorAll<HTMLElement>("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n ?? "");
  }
  for (const element of root.querySelectorAll<HTMLElement>(
    "[data-i18n-label]",
  )) {
    element.setAttribute("aria-label", t(element.dataset.i18nLabel ?? ""));
  }
}
