// The popup. It holds no account logic: it asks the service worker for a view and
// sends it the person's taps. All the thinking happens in the worker and in lib/.
import { renewedAgo } from "./lib/health.js";

const profiles = document.querySelector("#profiles");
const template = document.querySelector("#profile-template");
const statusBar = document.querySelector("#status");
const unsaved = document.querySelector("#unsaved");
const manageButton = document.querySelector("#manage");
const updateHint = document.querySelector("#update-hint");

const t = (key, substitution) => chrome.i18n.getMessage(key, substitution);
// The language of the texts that show, so that names and times read the same: the
// browser may run in a language the extension has no texts for.
const language = t("locale");

let managing = false;
// True while a request is with the service worker: the popup then takes no other tap.
let busy = false;

/** Fills every element that carries a data-i18n key with its translated text. */
function translate(root) {
  for (const element of root.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n);
  }
}

function showStatus(text, isError = false) {
  statusBar.textContent = text;
  statusBar.classList.toggle("is-error", isError);
  statusBar.hidden = text === "";
}

// The controls that send a request to the service worker.
const REQUEST_CONTROLS = ".tile, .toggle-remember, .remove, .remember [type=submit], #adopt, #add";

/** Sets an ARIA state that is true or absent. */
function mark(element, attribute, on) {
  if (on) {
    element.setAttribute(attribute, "true");
  } else {
    element.removeAttribute(attribute);
  }
}

/**
 * Marks the accounts and their actions as busy, or as ready again. They stay focusable
 * (aria-disabled, not disabled), so the focus stays where it was and a screen reader
 * reads them as unavailable while the request runs.
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

/** Asks the service worker and shows what it answers. */
async function request(action, extra, signInHint) {
  let reply;
  try {
    reply = await chrome.runtime.sendMessage({ type: "popup", action, ...extra });
  } catch {
    // The service worker did not answer, as when it stopped on the way.
    reply = undefined;
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
  }
  if (reply.view !== undefined) {
    render(reply.view);
  }
}

function render(view) {
  profiles.replaceChildren();
  for (const profile of view.profiles) {
    profiles.append(tile(profile));
  }
  unsaved.hidden = !view.unsaved;
  updateHint.hidden = view.updateHint !== true;
  if (view.profiles.length === 0 && !view.unsaved && !statusBar.classList.contains("is-error")) {
    showStatus(t("empty"));
  }
}

function tile(profile) {
  const node = template.content.firstElementChild.cloneNode(true);
  node.classList.toggle("active", profile.active);
  translate(node);

  const avatar = node.querySelector(".avatar");
  if (profile.picture !== null) {
    avatar.src = profile.picture;
  } else {
    // No picture at Autodarts: show the initial instead of an empty image.
    const initial = document.createElement("span");
    initial.className = "avatar initial";
    initial.textContent = (profile.name || profile.username).trim().charAt(0).toUpperCase();
    avatar.replaceWith(initial);
  }
  node.querySelector(".name").textContent = profile.name;
  node.querySelector(".username").textContent = profile.username;

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

  node.querySelector(".tile").addEventListener("click", () => {
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

  node.querySelector(".remove").addEventListener("click", () => {
    if (!busy && window.confirm(t("removeConfirm", profile.name))) {
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

document.querySelector("#add").addEventListener("click", () => {
  if (busy) {
    return;
  }
  showStatus(t("addHint"));
  void send("signout");
});

document.documentElement.lang = language;
translate(document);
void send("view");
