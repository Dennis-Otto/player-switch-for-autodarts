/** The links to the help and to a bug report, which the popup and the welcome page show. */
import { browserName, reportUrl } from "../onboarding.ts";
import { t } from "./dom.ts";

/** What Chrome tells a page of the browser it runs in, beside the user agent. */
interface BrandedNavigator extends Navigator {
  readonly userAgentData?: {
    readonly brands?: { brand: string; version: string }[];
  };
}

/**
 * Points each link marked data-link="help" at the help page in the language of the
 * extension, and each one marked data-link="report" at the bug form, filled in with the
 * versions of the extension and the browser alone.
 */
export function linkSupport(root: ParentNode): void {
  const browser = browserName(
    (navigator as BrandedNavigator).userAgentData?.brands,
    navigator.userAgent,
  );
  const report = reportUrl(chrome.runtime.getManifest().version, browser);
  for (const link of root.querySelectorAll<HTMLAnchorElement>(
    "[data-link=help]",
  )) {
    link.href = t("helpUrl");
  }
  for (const link of root.querySelectorAll<HTMLAnchorElement>(
    "[data-link=report]",
  )) {
    link.href = report;
  }
}
