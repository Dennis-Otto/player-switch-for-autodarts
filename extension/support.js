// The links to the help and to a bug report, which the popup and the welcome page show.
import { browserName, reportUrl } from "./lib/onboarding.js";
import { t } from "./players.js";

/**
 * Points each link marked data-link="help" at the website in the language of the
 * extension, and each one marked data-link="report" at the bug form, filled in with the
 * versions of the extension and the browser alone.
 */
export function linkSupport(root) {
  const browser = browserName(navigator.userAgentData?.brands, navigator.userAgent);
  const report = reportUrl(chrome.runtime.getManifest().version, browser);
  for (const link of root.querySelectorAll("[data-link=help]")) {
    link.href = t("helpUrl");
  }
  for (const link of root.querySelectorAll("[data-link=report]")) {
    link.href = report;
  }
}
