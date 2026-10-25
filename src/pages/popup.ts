/**
 * The popup of the toolbar button. The players and their accounts come from
 * `players.ts`, which the switcher in the Autodarts page shares; the popup adds the way
 * to the options page and the links to the help and to a bug report. As in the
 * switcher, the keys 1 to 9 pick a player; their numbers show on the tiles once the
 * keyboard is in use (popup.css).
 */
import { find } from "./dom.ts";
import { mountPlayers } from "./players.ts";
import { linkSupport } from "./support.ts";

mountPlayers({ numbered: true });
linkSupport(document);

find("#settings").addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});
