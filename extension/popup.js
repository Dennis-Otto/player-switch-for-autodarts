// The popup of the toolbar button. The players and their accounts come from
// players.js, which the switcher in the Autodarts page shares; the popup adds the way
// to the options page and the links to the help and to a bug report.
import { mountPlayers } from "./players.js";
import { linkSupport } from "./support.js";

mountPlayers();
linkSupport(document);

document.querySelector("#settings").addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});
