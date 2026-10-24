// The popup of the toolbar button. The players and their accounts come from
// players.js, which the switcher in the Autodarts page shares; the popup adds the way
// to the options page and the links to the help and to a bug report. As in the
// switcher, the keys 1 to 9 pick a player; their numbers show on the tiles once the
// keyboard is in use (popup.css).
import { mountPlayers } from "./players.js";
import { linkSupport } from "./support.js";

mountPlayers({ numbered: true });
linkSupport(document);

document.querySelector("#settings").addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});
