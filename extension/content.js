// Runs inside the Autodarts Play page, and does two things there.
//
// It is the only file that touches the page's stored session: it reads, writes and
// clears the refresh token that Autodarts keeps in window.localStorage, on behalf of
// the service worker.
//
// And it shows the switcher in the page, for a display in fullscreen or kiosk mode
// where the toolbar of the browser is out of reach: a round button in a corner with
// the picture of the player, and on a tap the switcher itself, switcher.html, in a
// frame over the page. The frame is a page of the extension, of another origin than
// Autodarts, so the scripts of the page can't read the accounts out of it. The button
// and the frame sit in a closed shadow root, apart from the styles of the page.
//
// A content script can't import a module: what the button shows (the settings of the
// options page, the player) comes from the service worker, which takes it from lib/.
//
// While the venue mode returns the display after a break, the service worker asks it to
// say when someone touches, clicks, scrolls or types on the page: only that it
// happened, never where or what, and at most every 15 seconds.
//
// After an update of the extension, the service worker runs this script again in the
// Autodarts tabs that are open, and the script of the version before loses its link to
// the extension. The new script then takes the page over without a reload, and the
// old one steps aside. Everything sits in a function, so a second run declares nothing
// twice.
(() => {
  // The service worker can also run this script itself, in a tab that it picked by its
  // address just before; a tab that went to another site in between gets nothing here.
  if (location.origin !== "https://play.autodarts.com") {
    return;
  }
  const SESSION_KEY = "autodarts_refresh_token";
  // Marks the elements of the page that the open switcher made inert, so that the script
  // of a later version can make them usable again when it takes over.
  const INERT_MARK = "data-player-switch-inert";

  const t = (key, substitution) => chrome.i18n.getMessage(key, substitution);
  // False once an update or a removal of the extension cut this script off from it.
  const alive = () => chrome.runtime?.id !== undefined;

  // A script of this extension that is still linked to it runs here already, as when a
  // tab that was still loading got the script twice: that one stays.
  if (
    typeof globalThis.playerSwitchAlive === "function" &&
    globalThis.playerSwitchAlive()
  ) {
    return;
  }
  globalThis.playerSwitchAlive = alive;
  // The button of a script that was cut off steps aside, and the page it made inert works again.
  for (const old of document.querySelectorAll("player-switch-ui")) {
    old.remove();
  }
  for (const element of document.querySelectorAll(`[${INERT_MARK}]`)) {
    element.inert = false;
    element.removeAttribute(INERT_MARK);
  }
  // Asked when the button of a script that was cut off is tapped; read now, while the
  // texts of the extension can still be read.
  const reloadQuestion = t("reloadAfterUpdate");

  const STYLE = `
:host {
  all: initial;
}
.button {
  position: fixed;
  z-index: 2147483646;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: 56px;
  height: 56px;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 2px solid #ffffff;
  border-radius: 50%;
  background: #4f66f6;
  color: #ffffff;
  box-shadow: 0 4px 14px rgb(0 0 0 / 0.35);
  font: 600 22px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
  cursor: pointer;
  opacity: 0.88;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.button[hidden] {
  display: none;
}
.button:hover,
.button:focus-visible {
  opacity: 1;
}
.button:focus-visible {
  outline: 3px solid #ffffff;
  outline-offset: 2px;
}
.bottom-right {
  right: max(16px, env(safe-area-inset-right));
  bottom: max(16px, env(safe-area-inset-bottom));
}
.bottom-left {
  left: max(16px, env(safe-area-inset-left));
  bottom: max(16px, env(safe-area-inset-bottom));
}
.top-right {
  right: max(16px, env(safe-area-inset-right));
  top: max(16px, env(safe-area-inset-top));
}
.top-left {
  left: max(16px, env(safe-area-inset-left));
  top: max(16px, env(safe-area-inset-top));
}
.button img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.button svg {
  width: 28px;
  height: 28px;
}
.frame {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  /* The same as the page in the frame, so that the browser keeps the frame see-through. */
  color-scheme: light dark;
}
@media (prefers-reduced-motion: no-preference) {
  .button {
    transition: opacity 0.15s ease, transform 0.15s ease;
  }
  .button:active {
    transform: scale(0.94);
  }
}
  `;

  // The button, the frame while it is open, and the shadow root that holds them.
  let ui = null;
  // What the button shows, as the service worker last said; hidden until it has.
  let view = {
    settings: { showButton: false, corner: "bottom-right" },
    player: null,
    reportActivity: false,
  };
  // When the page last told the worker of an input, and how often it does at most.
  const ACTIVITY_EVERY_MS = 15_000;
  let reportedAt = 0;
  // The elements of the page that the open switcher made inert, and where the focus was.
  let inerted = [];
  let opener = null;

  /** The button and its shadow root, made on first use. */
  function ensureUi() {
    if (ui === null) {
      const host = document.createElement("player-switch-ui");
      const root = host.attachShadow({ mode: "closed" });
      const style = document.createElement("style");
      style.textContent = STYLE;
      const button = document.createElement("button");
      button.type = "button";
      button.hidden = true;
      button.setAttribute("aria-haspopup", "dialog");
      button.setAttribute("aria-expanded", "false");
      button.addEventListener("click", toggleSwitcher);
      root.append(style, button);
      ui = { host, root, button, frame: null };
    }
    place();
    return ui;
  }

  /**
   * Puts the button where it shows: into the element that the page shows in fullscreen,
   * which hides everything outside it, or else at the end of the body.
   */
  function place() {
    if (!alive()) {
      retire();
      return;
    }
    const full = document.fullscreenElement;
    const parent =
      full !== null && full !== document.documentElement ? full : document.body;
    if (parent !== null && ui.host.parentNode !== parent) {
      parent.append(ui.host);
    }
  }

  /** A symbol of two arrows that swap, for the button while none of the saved accounts plays. */
  function swapIcon() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", "M4 8h14m-4-4 4 4-4 4M20 16H6m4-4-4 4 4 4");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
    return svg;
  }

  function letter(initial) {
    const span = document.createElement("span");
    span.textContent = initial;
    span.setAttribute("aria-hidden", "true");
    return span;
  }

  /** The face of the button: the picture of the player, their initial, or the symbol. */
  function face(player) {
    if (player === null) {
      return swapIcon();
    }
    if (player.picture === null) {
      return letter(player.initial);
    }
    const image = document.createElement("img");
    image.alt = "";
    image.src = player.picture;
    image.addEventListener(
      "error",
      () => image.replaceWith(letter(player.initial)),
      { once: true },
    );
    return image;
  }

  function drawButton() {
    const { button } = ensureUi();
    const { settings, player } = view;
    const label =
      player === null
        ? t("switchButton")
        : t("switchButtonPlaying", player.name);
    button.className = `button ${settings.corner}`;
    button.hidden = !settings.showButton;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.replaceChildren(face(player));
  }

  /** While the switcher is open, the rest of the page takes no focus and no tap. */
  function makePageInert() {
    for (const element of ui.host.parentNode.children) {
      if (element !== ui.host && !element.inert) {
        element.inert = true;
        element.setAttribute(INERT_MARK, "");
        inerted.push(element);
      }
    }
  }

  function restorePage() {
    for (const element of inerted) {
      element.inert = false;
      element.removeAttribute(INERT_MARK);
    }
    inerted = [];
  }

  function openSwitcher() {
    const current = ensureUi();
    if (current.frame !== null || current.host.parentNode === null) {
      return;
    }
    opener = document.activeElement;
    const frame = document.createElement("iframe");
    frame.className = "frame";
    frame.title = t("title");
    frame.src = chrome.runtime.getURL("switcher.html");
    // The keyboard and the screen reader go on inside the switcher.
    frame.addEventListener("load", () => frame.focus(), { once: true });
    current.root.append(frame);
    current.frame = frame;
    current.button.setAttribute("aria-expanded", "true");
    makePageInert();
  }

  function closeSwitcher() {
    if (ui === null || ui.frame === null) {
      return;
    }
    ui.frame.remove();
    ui.frame = null;
    ui.button.setAttribute("aria-expanded", "false");
    restorePage();
    // The focus goes back to where it was in the page, or else to the button, such as
    // when the button opened the switcher (the page then sees the focus on the host).
    const back = opener;
    opener = null;
    if (
      back !== null &&
      back !== ui.host &&
      back !== document.body &&
      back.isConnected
    ) {
      back.focus();
    } else if (!ui.button.hidden) {
      ui.button.focus();
    }
  }

  /** Tells the worker that someone used the page, when the venue mode asks for it. */
  function reportActivity() {
    const now = Date.now();
    if (
      view.reportActivity !== true ||
      now - reportedAt < ACTIVITY_EVERY_MS ||
      !alive()
    ) {
      return;
    }
    reportedAt = now;
    chrome.runtime.sendMessage({ type: "activity" }).catch(() => {
      // The worker did not answer; the next input tells it again.
      reportedAt = 0;
    });
  }

  const INPUTS = ["pointerdown", "keydown", "wheel", "touchstart"];

  /** Takes the button and the switcher of this script, which was cut off, off the page. */
  function retire() {
    for (const type of INPUTS) {
      window.removeEventListener(type, reportActivity, true);
    }
    document.removeEventListener("fullscreenchange", place);
    if (ui !== null) {
      ui.host.remove();
    }
    restorePage();
  }

  function toggleSwitcher() {
    if (!alive()) {
      // The extension was updated and this tab didn't get the new script. Only a reload
      // brings it, and on a match page that ends the match, so it asks first there.
      retire();
      if (
        !/^\/matches\/[^/]+/.test(window.location.pathname) ||
        window.confirm(reloadQuestion)
      ) {
        window.location.reload();
      }
      return;
    }
    if (ui !== null && ui.frame !== null) {
      closeSwitcher();
    } else {
      openSwitcher();
    }
  }

  function start() {
    ensureUi();
    document.addEventListener("fullscreenchange", place);
    // Seen before the page itself sees them, and never held up: the page stays as fast.
    for (const type of INPUTS) {
      window.addEventListener(type, reportActivity, {
        capture: true,
        passive: true,
      });
    }
    chrome.runtime
      .sendMessage({ type: "button" })
      .then((reply) => {
        if (
          reply !== undefined &&
          reply !== null &&
          typeof reply.settings === "object"
        ) {
          view = reply;
          drawButton();
        }
      })
      .catch(() => {
        // No answer from the service worker: the button stays hidden until the next one.
      });
  }

  // Only the service worker of this extension talks to the page.
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (
      message === null ||
      typeof message !== "object" ||
      message.type !== "page" ||
      sender.id !== chrome.runtime.id
    ) {
      return false;
    }

    switch (message.action) {
      case "read": {
        const token = window.localStorage.getItem(SESSION_KEY);
        sendResponse({ token });
        return false;
      }
      case "write": {
        // Only a token goes into the session of the page, never another value.
        if (typeof message.token !== "string" || message.token === "") {
          sendResponse({ ok: false });
          return false;
        }
        window.localStorage.setItem(SESSION_KEY, message.token);
        sendResponse({ ok: true });
        // Let Autodarts pick up the new session.
        window.location.reload();
        return false;
      }
      case "clear": {
        window.localStorage.removeItem(SESSION_KEY);
        sendResponse({ ok: true });
        window.location.reload();
        return false;
      }
      case "button": {
        // The settings or the player changed.
        view = message.view;
        drawButton();
        sendResponse({ ok: true });
        return false;
      }
      case "toggleSwitcher": {
        // The keyboard shortcut, which works with the button hidden as well.
        toggleSwitcher();
        sendResponse({ ok: true });
        return false;
      }
      case "closeSwitcher": {
        closeSwitcher();
        sendResponse({ ok: true });
        return false;
      }
      default: {
        return false;
      }
    }
  });

  if (document.body === null) {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
