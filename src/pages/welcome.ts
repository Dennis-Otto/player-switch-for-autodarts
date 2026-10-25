/**
 * The welcome page, which the service worker opens once, after the install. It holds no
 * logic: it only shows its texts in the language of the extension, with `translate()`,
 * as the popup does, and points the links to the help and to a bug report.
 */
import { t, translate } from "./dom.ts";
import { linkSupport } from "./support.ts";

document.documentElement.lang = t("locale");
translate(document);
linkSupport(document);
