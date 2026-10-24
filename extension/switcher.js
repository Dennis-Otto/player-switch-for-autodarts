// The switcher in the Autodarts page, in a frame that content.js lays over the page:
// the players and their accounts from players.js, as in the popup, in large tiles for
// a touch screen. The keys 1 to 9 pick a player; Esc, the close button or a tap
// beside the panel close it again. A switch reloads the page, which closes it as well.
import { mountPlayers } from "./players.js";

/** Asks the content script of this tab, through the service worker, to close the frame. */
function close() {
  chrome.runtime
    .sendMessage({ type: "switcher", action: "close" })
    .catch(() => {
      // The worker did not answer; the page's own reload or the next tap closes it.
    });
}

// Once the players are there, the first of them takes the focus: content.js gives the
// frame the focus as it shows it, so a keyboard or a screen reader starts in the list.
let focused = false;
mountPlayers({
  numbered: true,
  onRender() {
    if (focused) {
      return;
    }
    focused = true;
    const start =
      document.querySelector("#profiles .tile") ??
      document.querySelector("#unsaved:not([hidden]) #adopt") ??
      document.querySelector("#add");
    start.focus();
  },
});

document.querySelector("#close").addEventListener("click", close);

// A tap on the dimmed page beside the panel closes the switcher.
document.body.addEventListener("click", (event) => {
  if (event.target === document.body) {
    close();
  }
});

document.addEventListener("keydown", (event) => {
  // Esc closes an open dialog first, the way the dialog does it, and the switcher next.
  if (
    event.key === "Escape" &&
    document.querySelector("dialog[open]") === null
  ) {
    event.preventDefault();
    close();
  }
});
