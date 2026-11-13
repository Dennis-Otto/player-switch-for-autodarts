/** The links to the help and to a bug report, which the popup and the welcome page show. */
import { browserName, reportUrl } from "../onboarding.ts";
import { runningVersion, t } from "./dom.ts";

/** What Chrome tells a page of the browser it runs in, beside the user agent. */
interface BrandedNavigator extends Navigator {
  readonly userAgentData?: {
    readonly brands?: { brand: string; version: string }[];
  };
}

/** The address of the help in the language of the extension, at the entry `anchor`. */
export function helpHref(anchor?: string): string {
  return anchor === undefined ? t("helpUrl") : `${t("helpUrl")}#${anchor}`;
}

/**
 * Points each link marked data-link="help" at the help page in the language of the
 * extension, at the entry that its data-anchor names, if any, and each one marked
 * data-link="report" at the bug form, filled in with the versions of the extension and
 * the browser alone.
 */
export function linkSupport(root: ParentNode): void {
  const browser = browserName(
    (navigator as BrandedNavigator).userAgentData?.brands,
    navigator.userAgent,
  );
  const report = reportUrl(runningVersion(), browser);
  for (const link of root.querySelectorAll<HTMLAnchorElement>(
    "[data-link=help]",
  )) {
    link.href = helpHref(link.dataset.anchor);
  }
  for (const link of root.querySelectorAll<HTMLAnchorElement>(
    "[data-link=report]",
  )) {
    link.href = report;
  }
}
