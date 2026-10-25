// The players and their accounts, as the popup and the switcher in the Autodarts page
// both show them: one module, so the two can't drift apart. It holds no account logic:
// it asks the service worker for a view and sends it the person's taps. All the
// thinking happens in the worker and in lib/. In the venue mode, the worker asks for
// a PIN before a switch or a change in "Manage accounts"; this module then asks the
// person, with a number pad for a touch screen, and sends the request again.
import { failingSince, renewedAgo } from "./lib/health.js";
import { initialOf, tileForKey } from "./lib/page.js";
import { isPin } from "./lib/venue.js";

export const t = (key, substitution) =>
  chrome.i18n.getMessage(key, substitution);
// The language of the texts that show, so that names and times read the same: the
// browser may run in a language the extension has no texts for.
const language = t("locale");

/**
 * Fills every element that carries a data-i18n key with its translated text, the
 * <title> of the page as well, and gives every one with a data-i18n-label key its
 * translated name for screen readers.
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

  // The control that had the focus gets it back as the dialog closes, also when the
  // page has drawn something new behind it.
  const opener = document.activeElement;
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
      if (opener?.isConnected) {
        opener.focus();
      }
      resolve(dialog.returnValue === "confirm");
    });
    dialog.showModal();
  });
}

// The keys of the number pad, in the rows of a phone; "delete" takes the last digit back.
const PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "delete", "0"];

/**
 * Asks for a PIN in a dialog of the page, with a number pad for a touch screen; a
 * keyboard types into the field as well, Enter confirms and Esc cancels. `error` says,
 * read out at once, why the dialog asks again, such as after a wrong PIN. Answers the
 * PIN, 4 to 8 digits, or null when the person cancels.
 */
export function pinDialog({ title, text, error = "" }) {
  const dialog = document.createElement("dialog");
  dialog.className = "confirm pin";
  const heading = document.createElement("h2");
  heading.id = "pin-title";
  heading.textContent = title;
  const body = document.createElement("p");
  body.id = "pin-text";
  body.textContent = text;
  dialog.setAttribute("aria-labelledby", heading.id);
  dialog.setAttribute("aria-describedby", body.id);

  const opener = document.activeElement;
  const form = document.createElement("form");
  form.method = "dialog";
  const label = document.createElement("label");
  label.className = "pin-field";
  const caption = document.createElement("span");
  caption.textContent = t("pinLabel");
  const input = document.createElement("input");
  input.type = "password";
  input.className = "pin-input";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.maxLength = 8;
  input.autofocus = true;
  label.append(caption, input);
  const problem = document.createElement("p");
  problem.className = "pin-problem";
  problem.setAttribute("role", "alert");
  problem.textContent = error;

  const pad = document.createElement("div");
  pad.className = "keypad";
  pad.setAttribute("role", "group");
  pad.setAttribute("aria-label", t("pinPad"));
  for (const key of PAD_KEYS) {
    const button = document.createElement("button");
    button.type = "button";
    if (key === "delete") {
      button.className = "pad-key delete";
      button.textContent = "\u232B";
      button.setAttribute("aria-label", t("pinDelete"));
    } else {
      button.className = "pad-key";
      button.textContent = key;
    }
    button.addEventListener("click", () => {
      problem.textContent = "";
      input.value =
        key === "delete"
          ? input.value.slice(0, -1)
          : `${input.value}${key}`.slice(0, input.maxLength);
    });
    pad.append(button);
  }
  // The first button that sends the form, so that Enter in the field confirms.
  const yes = document.createElement("button");
  yes.value = "ok";
  yes.className = "primary pad-ok";
  yes.textContent = t("pinOk");
  pad.append(yes);
  const actions = document.createElement("div");
  actions.className = "form-actions";
  const no = document.createElement("button");
  no.value = "cancel";
  no.className = "link";
  no.formNoValidate = true;
  no.textContent = t("cancel");
  actions.append(no);
  form.append(label, problem, pad, actions);
  dialog.append(heading, body, form);
  document.body.append(dialog);

  input.addEventListener("input", () => {
    problem.textContent = "";
  });
  form.addEventListener("submit", (event) => {
    if (event.submitter === yes && !isPin(input.value)) {
      event.preventDefault();
      problem.textContent = t("pinInvalid");
      input.focus();
    }
  });

  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      const pin = dialog.returnValue === "ok" ? input.value : null;
      dialog.remove();
      if (opener?.isConnected) {
        opener.focus();
      }
      resolve(pin);
    });
    dialog.showModal();
  });
}

/** A small mark on the tile of an account that asks for a PIN: a lock and the word. */
function pinMark() {
  const mark = document.createElement("span");
  mark.className = "chip pin";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "M5 7V5a3 3 0 0 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2Z",
  );
  svg.append(path);
  const word = document.createElement("span");
  word.textContent = t("pinLabel");
  mark.append(svg, word);
  return mark;
}

/** What to say when a request failed: `signInHint` when the account has to sign in again. */
function problemOf(reply, signInHint) {
  if (reply.reason === "unreachable") {
    return t("unreachable");
  }
  if (reply.reason === "locked") {
    return t("pinLocked");
  }
  return signInHint ?? t("error");
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
const REQUEST_CONTROLS =
  ".tile, .toggle-remember, .remove, .save-remember, #adopt, #add, #open-page, #stop-adding";

// The controls of a tile, so that the focus comes back to the same one when the tiles
// are drawn anew after a request.
const TILE_CONTROLS = [
  ".tile",
  ".toggle-remember",
  ".remove",
  ".cred-username",
  ".cred-password",
  ".cancel-remember",
  ".save-remember",
];

/** Whether the person can reach an element: it is in the page, shown and not inert. */
function reachable(element) {
  return (
    element?.isConnected === true &&
    element.closest("[hidden], [inert]") === null
  );
}

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
  image.addEventListener("error", () => image.replaceWith(initial), {
    once: true,
  });
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
  // What happens, read out politely, and what went wrong, read out at once. Both stay
  // in the page, empty and out of sight when there is nothing to say, so that a screen
  // reader already knows them when a message arrives.
  const statusBar = document.querySelector("#status");
  const problemBar = document.querySelector("#problem");
  const unsaved = document.querySelector("#unsaved");
  const manageButton = document.querySelector("#manage");
  const updateHint = document.querySelector("#update-hint");
  // "Open Autodarts", which only the popup has: the switcher is in an Autodarts page.
  const openPageButton = document.querySelector("#open-page");
  const adding = document.querySelector("#adding");
  const addButton = document.querySelector("#add");

  let managing = false;
  // True while a request is with the service worker: the page then takes no other tap.
  let busy = false;
  // The accounts that show, for the name in the question for a PIN.
  let shown = [];
  // Whether a manager PIN guards "Manage accounts", and the one that the person entered
  // to open it, which goes along with each change and is forgotten as it closes.
  let guarded = false;
  let managerPin = null;

  /** Shows a message, an error in the region that is read out at once; "" clears both. */
  function showStatus(text, isError = false) {
    statusBar.textContent = isError ? "" : text;
    problemBar.textContent = isError ? text : "";
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
      return undefined;
    }
    setBusy(true);
    try {
      return await request(action, extra, signInHint);
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

  /** Asks for the PIN that the worker waits for: of the account, or the manager PIN. */
  function askPin(reply, id) {
    const manager = reply.pin === "manager";
    const name = shown.find((profile) => profile.id === id)?.name ?? "";
    return pinDialog({
      title: manager ? t("managerPinTitle") : t("pinTitle", name),
      text: manager ? t("managerPinText") : t("pinText"),
      error: reply.wrong === true ? t("pinWrong") : "",
    });
  }

  /** Asks the service worker and shows what it answers, which it also returns. */
  async function request(action, extra, signInHint) {
    let message =
      managerPin === null
        ? { action, ...extra }
        : { action, ...extra, managerPin };
    let reply = await ask(message);
    // The worker spent no token yet: it waits for a PIN, or for a yes to end the match
    // that runs in the page. A cancel leaves everything as it was.
    while (
      reply?.ok === false &&
      (reply.reason === "pin" || reply.reason === "match")
    ) {
      if (reply.reason === "match") {
        if (!(await confirmMatch())) {
          showStatus("");
          render(reply.view);
          return reply;
        }
        message = { ...message, confirmed: true };
      } else {
        const pin = await askPin(reply, message.id);
        if (pin === null) {
          showStatus("");
          render(reply.view);
          return reply;
        }
        message =
          reply.pin === "manager"
            ? { ...message, managerPin: pin }
            : { ...message, pin };
      }
      reply = await ask(message);
    }
    if (reply === undefined) {
      showStatus(t("error"), true);
      return reply;
    }
    // The manager PIN that worked opens "Manage accounts" until it closes.
    if (reply.ok === true && typeof message.managerPin === "string") {
      managerPin = message.managerPin;
    }
    if (reply.error === "noPage") {
      showStatus(t("noPage"), true);
    } else if (reply.error === "unknownFormat") {
      showStatus(t("unknownFormat"), true);
    } else if (reply.error !== undefined) {
      showStatus(t("error"), true);
    } else if (reply.ok === false) {
      showStatus(problemOf(reply, signInHint), true);
    } else if (typeof reply.saved === "string") {
      // A new account signed in before the page could tell; it was saved just now.
      showStatus(t("savedAccount", reply.saved));
    } else {
      // Done: the tiles show how it ended, so "Switching to …" goes.
      showStatus("");
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
    return reply;
  }

  function render(view) {
    const before = focusBefore();
    shown = view.profiles;
    guarded = view.venue?.manager === true;
    profiles.replaceChildren();
    view.profiles.forEach((profile, index) => {
      profiles.append(tile(profile, index));
    });
    unsaved.hidden = !view.unsaved;
    adding.hidden = view.adding !== true;
    updateHint.hidden = view.updateHint !== true;
    if (
      view.profiles.length === 0 &&
      !view.unsaved &&
      !view.adding &&
      problemBar.textContent === ""
    ) {
      showStatus(t("empty"));
    }
    restoreFocus(before);
    onRender();
  }

  /** Where the focus is before the tiles are drawn anew, to bring it back after. */
  function focusBefore() {
    const element = document.activeElement;
    const item = element?.closest("#profiles > .profile") ?? null;
    if (item === null) {
      return { element, id: null, index: -1, control: null };
    }
    return {
      element,
      id: item.dataset.id,
      index: [...profiles.children].indexOf(item),
      control:
        TILE_CONTROLS.find((selector) => element.matches(selector)) ?? null,
    };
  }

  /** The tile of the player who plays, or "Add account" when nobody does. */
  function home() {
    const active = profiles.querySelector(".profile.active .tile");
    return reachable(active) ? active : addButton;
  }

  /**
   * Gives the focus back after the tiles were drawn anew, so that a keyboard or a
   * screen reader keeps its place: to the same control of the same account, to the
   * account in its place when it was removed, or to a control nearby when that one
   * went away, such as the form after its password was saved.
   */
  function restoreFocus({ element, id, index, control }) {
    if (element === null || element === document.body) {
      return;
    }
    if (id === null) {
      if (!reachable(element)) {
        // "Cancel" of adding leads back to "Add account", any other control that went
        // away, such as "Save account", to the player who plays now.
        (element.id === "stop-adding" ? addButton : home()).focus();
      }
      return;
    }
    const items = [...profiles.children];
    const item =
      items.find((candidate) => candidate.dataset.id === id) ??
      items[Math.min(index, items.length - 1)];
    const target = [control, managing ? ".toggle-remember" : ".tile"]
      .map((selector) =>
        selector === null ? null : (item?.querySelector(selector) ?? null),
      )
      .find((candidate) => reachable(candidate));
    (target ?? home()).focus();
  }

  function tile(profile, index) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.classList.toggle("active", profile.active);
    node.dataset.id = profile.id;
    translate(node);

    const button = node.querySelector(".tile");
    // The tile of the player who plays is the current one: a tap on it changes nothing.
    // While the accounts are managed, a tap on a tile changes nothing either, so the
    // tiles step aside, and the actions below each one carry its name.
    if (profile.active) {
      button.setAttribute("aria-current", "true");
    }
    button.inert = managing;
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

    if (profile.pin === true) {
      node.querySelector(".chip").before(pinMark());
    }

    const chip = node.querySelector(".chip:not(.pin)");
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
    menu.setAttribute("aria-label", profile.name);

    // Shows in the manage view that the renewal of a parked session works, or since
    // when it fails, while the extension keeps trying.
    if (profile.renewedAt !== null) {
      const renewed = node.querySelector(".renewed");
      renewed.textContent = t(
        "renewed",
        renewedAgo(profile.renewedAt, Date.now(), language),
      );
      renewed.hidden = false;
    }
    if (profile.renewalFailingSince !== null) {
      const failing = node.querySelector(".renewal-failing");
      failing.textContent = t(
        "renewalFailing",
        failingSince(profile.renewalFailingSince, language),
      );
      failing.hidden = false;
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
    toggle.textContent = profile.remembersPassword
      ? t("forgetPassword")
      : t("rememberPassword");
    toggle.addEventListener("click", () => {
      if (busy) {
        return;
      }
      if (profile.remembersPassword) {
        void send("forgetPassword", { id: profile.id });
      } else {
        form.hidden = !form.hidden;
        if (!form.hidden) {
          form.querySelector(".cred-username").focus();
        }
      }
    });

    node.querySelector(".cancel-remember").addEventListener("click", () => {
      form.hidden = true;
      toggle.focus();
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

  // "Manage accounts" is a toggle with a name that stays: pressed, it shows the actions
  // of every account, and pressed again, the tiles. While a manager PIN guards it, it
  // opens only with that PIN, which it forgets again as it closes.
  manageButton.addEventListener("click", async () => {
    if (busy) {
      return;
    }
    if (!managing && guarded && managerPin === null) {
      const reply = await send("unlock");
      if (reply?.ok !== true) {
        return;
      }
    }
    managing = !managing;
    if (!managing) {
      managerPin = null;
    }
    document.body.classList.toggle("managing", managing);
    manageButton.setAttribute("aria-pressed", String(managing));
    for (const menu of profiles.querySelectorAll(".menu")) {
      menu.hidden = !managing;
    }
    for (const button of profiles.querySelectorAll(".tile")) {
      button.inert = managing;
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
  addButton.addEventListener("click", () => {
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
      if (
        busy ||
        managing ||
        typing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
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
