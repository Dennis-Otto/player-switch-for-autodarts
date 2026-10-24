// The players and their accounts, as the popup and the switcher in the Autodarts page
// both show them: one module, so the two can't drift apart. It holds no account logic:
// it asks the service worker for a view and sends it the person's taps. All the
// thinking happens in the worker and in lib/.
import { renewedAgo } from "./lib/health.js";
import { initialOf, tileForKey } from "./lib/page.js";

export const t = (key, substitution) => chrome.i18n.getMessage(key, substitution);
// The language of the texts that show, so that names and times read the same: the
// browser may run in a language the extension has no texts for.
const language = t("locale");

/**
 * Fills every element that carries a data-i18n key with its translated text, and
 * gives every one with a data-i18n-label key its translated name for screen readers.
 */
export function translate(root) {
  for (const element of root.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const element of root.querySelectorAll("[data-i18n-label]")) {
    element.setAttribute("aria-label", t(element.dataset.i18nLabel));
  }
}

/**
 * Asks the person to confirm in a dialog of the page, which works on a touch screen,
 * keeps the focus inside while it is open and closes with Esc. Answers true when the
 * person confirms, false when they cancel.
 */
export function confirmDialog({ title, text, confirm, cancel }) {
  const dialog = document.createElement("dialog");
  dialog.className = "confirm";
  dialog.setAttribute("role", "alertdialog");
  const heading = document.createElement("h2");
  heading.id = "confirm-title";
  heading.textContent = title;
  const body = document.createElement("p");
  body.id = "confirm-text";
  body.textContent = text;
  dialog.setAttribute("aria-labelledby", heading.id);
  dialog.setAttribute("aria-describedby", body.id);

  const form = document.createElement("form");
  form.method = "dialog";
  form.className = "form-actions";
  const no = document.createElement("button");
  no.value = "cancel";
  no.className = "link";
  no.textContent = cancel;
  // The safe answer has the focus, so an Enter by mistake changes nothing.
  no.autofocus = true;
  const yes = document.createElement("button");
  yes.value = "confirm";
  yes.className = "primary danger";
  yes.textContent = confirm;
  form.append(no, yes);
  dialog.append(heading, body, form);
  document.body.append(dialog);

  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(dialog.returnValue === "confirm");
    });
    dialog.showModal();
  });
}

/** Asks whether a switch may end the match that runs in the page. */
function confirmMatch() {
  return confirmDialog({
    title: t("matchTitle"),
    text: t("matchText"),
    confirm: t("matchConfirm"),
    cancel: t("matchCancel"),
  });
}

// The controls that send a request to the service worker.
const REQUEST_CONTROLS = ".tile, .toggle-remember, .remove, .remember [type=submit], #adopt, #add, #open-page, #stop-adding";

/** Sets an ARIA state that is true or absent. */
function mark(element, attribute, on) {
  if (on) {
    element.setAttribute(attribute, "true");
  } else {
    element.removeAttribute(attribute);
  }
}

/** The picture of an account, or its initial when Autodarts has no picture of it. */
function avatarOf(profile, image) {
  const initial = document.createElement("span");
  initial.className = "avatar initial";
  initial.textContent = initialOf(profile);
  if (profile.picture === null) {
    image.replaceWith(initial);
    return;
  }
  image.src = profile.picture;
  // A picture that doesn't load shows the initial as well.
  image.addEventListener("error", () => image.replaceWith(initial), { once: true });
}

/**
 * Shows the players in the page that loads this module and wires its controls: the
 * list of tiles, "Manage accounts", "Save account", "Add account" and the notice while
 * a new account is being added, with its "Cancel". The page carries
 * the elements of popup.html, with the template of a tile. With `numbered`, each of
 * the first nine tiles shows its key, and the keys 1 to 9 pick a player. `onRender`
 * runs each time the players are shown anew.
 */
export function mountPlayers({ numbered = false, onRender = () => {} } = {}) {
  const profiles = document.querySelector("#profiles");
  const template = document.querySelector("#profile-template");
  const statusBar = document.querySelector("#status");
  const unsaved = document.querySelector("#unsaved");
  const manageButton = document.querySelector("#manage");
  const updateHint = document.querySelector("#update-hint");
  // "Open Autodarts", which only the popup has: the switcher is in an Autodarts page.
  const openPageButton = document.querySelector("#open-page");
  const adding = document.querySelector("#adding");

  let managing = false;
  // True while a request is with the service worker: the page then takes no other tap.
  let busy = false;

  function showStatus(text, isError = false) {
    statusBar.textContent = text;
    statusBar.classList.toggle("is-error", isError);
    statusBar.hidden = text === "";
  }

  /**
   * Marks the accounts and their actions as busy, or as ready again. They stay
   * focusable (aria-disabled, not disabled), so the focus stays where it was and a
   * screen reader reads them as unavailable while the request runs.
   */
  function setBusy(value) {
    busy = value;
    mark(profiles, "aria-busy", value);
    for (const control of document.querySelectorAll(REQUEST_CONTROLS)) {
      mark(control, "aria-disabled", value);
    }
  }

  /**
   * Sends one request to the service worker and renders the view it answers with.
   * `signInHint` is what to say when the account has to sign in again. While one
   * request runs, another is ignored: a double tap switches once.
   */
  async function send(action, extra = {}, signInHint = null) {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await request(action, extra, signInHint);
    } finally {
      setBusy(false);
    }
  }

  async function ask(message) {
    try {
      return await chrome.runtime.sendMessage({ type: "popup", ...message });
    } catch {
      // The service worker did not answer, as when it stopped on the way.
      return undefined;
    }
  }

  /** Asks the service worker and shows what it answers. */
  async function request(action, extra, signInHint) {
    let reply = await ask({ action, ...extra });
    // A match runs in the page: the worker spent no token yet and waits for a yes.
    if (reply?.ok === false && reply.reason === "match") {
      if (!(await confirmMatch())) {
        showStatus("");
        render(reply.view);
        return;
      }
      reply = await ask({ action, ...extra, confirmed: true });
    }
    if (reply === undefined) {
      showStatus(t("error"), true);
      return;
    }
    if (reply.error === "noPage") {
      showStatus(t("noPage"), true);
    } else if (reply.error !== undefined) {
      showStatus(t("error"), true);
    } else if (reply.ok === false) {
      showStatus(reply.reason === "unreachable" ? t("unreachable") : (signInHint ?? t("error")), true);
    } else if (typeof reply.saved === "string") {
      // A new account signed in before the page could tell; it was saved just now.
      showStatus(t("savedAccount", reply.saved));
    }
    // "Open Autodarts" shows while no Autodarts tab answers; an answer that doesn't say
    // leaves it as it is. It stays hidden for an account that has to sign in again: the
    // page there is still signed in as the player before, and signing out in it would end
    // that session, which "Add account" parks first.
    if (openPageButton !== null && reply.page !== undefined) {
      openPageButton.hidden = reply.page;
    }
    if (reply.view !== undefined) {
      render(reply.view);
    }
  }

  function render(view) {
    profiles.replaceChildren();
    view.profiles.forEach((profile, index) => {
      profiles.append(tile(profile, index));
    });
    unsaved.hidden = !view.unsaved;
    adding.hidden = view.adding !== true;
    updateHint.hidden = view.updateHint !== true;
    if (view.profiles.length === 0 && !view.unsaved && !view.adding && !statusBar.classList.contains("is-error")) {
      showStatus(t("empty"));
    }
    onRender();
  }

  function tile(profile, index) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.classList.toggle("active", profile.active);
    translate(node);

    const button = node.querySelector(".tile");
    avatarOf(profile, node.querySelector(".avatar"));
    node.querySelector(".name").textContent = profile.name;
    node.querySelector(".username").textContent = profile.username;
    if (numbered && index < 9) {
      const key = document.createElement("kbd");
      key.className = "key";
      key.textContent = String(index + 1);
      key.setAttribute("aria-hidden", "true");
      button.prepend(key);
      button.setAttribute("aria-keyshortcuts", String(index + 1));
    }

    const chip = node.querySelector(".chip");
    if (profile.active) {
      chip.textContent = t("playing");
      chip.classList.add("playing");
      chip.hidden = false;
    } else if (profile.needsSignIn) {
      chip.textContent = t("needsSignIn");
      chip.classList.add("warn");
      chip.hidden = false;
    }

    const menu = node.querySelector(".menu");
    menu.hidden = !managing;

    // Shows in the manage view that the renewal of a parked session works.
    if (profile.renewedAt !== null) {
      const renewed = node.querySelector(".renewed");
      renewed.textContent = t("renewed", renewedAgo(profile.renewedAt, Date.now(), language));
      renewed.hidden = false;
    }

    button.addEventListener("click", () => {
      if (busy || managing || profile.active) {
        return;
      }
      showStatus(t("switching", profile.name));
      void send("switch", { id: profile.id }, t("switchSignIn", profile.name));
    });

    const form = node.querySelector(".remember");
    const toggle = node.querySelector(".toggle-remember");
    toggle.textContent = profile.remembersPassword ? t("forgetPassword") : t("rememberPassword");
    toggle.addEventListener("click", () => {
      if (busy) {
        return;
      }
      if (profile.remembersPassword) {
        void send("forgetPassword", { id: profile.id });
      } else {
        form.hidden = !form.hidden;
      }
    });

    node.querySelector(".cancel-remember").addEventListener("click", () => {
      form.hidden = true;
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const username = form.querySelector(".cred-username").value.trim();
      const password = form.querySelector(".cred-password").value;
      if (username === "" || password === "") {
        return;
      }
      void send("remember", { id: profile.id, username, password });
    });

    node.querySelector(".remove").addEventListener("click", async () => {
      if (busy) {
        return;
      }
      const confirmed = await confirmDialog({
        title: t("remove"),
        text: t("removeConfirm", profile.name),
        confirm: t("remove"),
        cancel: t("cancel"),
      });
      if (confirmed) {
        void send("removeAccount", { id: profile.id });
      }
    });

    return node;
  }

  manageButton.addEventListener("click", () => {
    managing = !managing;
    document.body.classList.toggle("managing", managing);
    manageButton.textContent = managing ? t("done") : t("manage");
    for (const menu of profiles.querySelectorAll(".menu")) {
      menu.hidden = !managing;
    }
  });

  document.querySelector("#adopt").addEventListener("click", () => {
    if (busy) {
      return;
    }
    showStatus("");
    void send("adopt");
  });

  openPageButton?.addEventListener("click", () => {
    if (busy) {
      return;
    }
    showStatus("");
    void send("openPage");
  });

  // The page signs out, and the account that signs in next is saved by itself: the
  // notice of #adding says so, as long as the extension waits for it.
  document.querySelector("#add").addEventListener("click", () => {
    if (busy) {
      return;
    }
    showStatus("");
    void send("signout");
  });

  document.querySelector("#stop-adding").addEventListener("click", () => {
    if (busy) {
      return;
    }
    void send("stopAdding");
  });

  if (numbered) {
    document.addEventListener("keydown", (event) => {
      // A key is a player only outside the forms, the open dialogs and the manage mode.
      const typing = event.target instanceof HTMLInputElement;
      if (busy || managing || typing || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      if (document.querySelector("dialog[open]") !== null) {
        return;
      }
      const tiles = profiles.querySelectorAll(".tile");
      const index = tileForKey(event.key, tiles.length);
      if (index !== null) {
        event.preventDefault();
        tiles[index].focus();
        tiles[index].click();
      }
    });
  }

  document.documentElement.lang = language;
  translate(document);
  void send("view");
}
