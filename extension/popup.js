// The popup of the toolbar button. The players and their accounts come from
// players.js, which the switcher in the Autodarts page shares; the popup adds the way
// to the options page.
import { mountPlayers } from "./players.js";

mountPlayers();

document.querySelector("#settings").addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});
