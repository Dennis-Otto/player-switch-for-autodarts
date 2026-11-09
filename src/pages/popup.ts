/**
 * The popup of the toolbar button. The players and their accounts come from
 * `players.ts`, which the switcher in the Autodarts page shares; the popup adds the way
 * to the options page, the links to the help and to a bug report, and, below them, the
 * version of Player Switch that runs, as the switcher shows it too. As in the
 * switcher, the keys 1 to 9 pick a player; their numbers show on the tiles once the
 * keyboard is in use (popup.css).
 */
import { find, showVersion } from "./dom.ts";
import { mountPlayers } from "./players.ts";
import { linkSupport } from "./support.ts";

mountPlayers({ numbered: true });
linkSupport(document);
showVersion(document);

find("#settings").addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});
