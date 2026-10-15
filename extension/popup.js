// The popup. It holds no account logic: it asks the service worker for a view and
// sends it the person's taps. All the thinking happens in the worker and in lib/.

const profiles = document.querySelector("#profiles");
const template = document.querySelector("#profile-template");
const statusBar = document.querySelector("#status");
const unsaved = document.querySelector("#unsaved");
const manageButton = document.querySelector("#manage");

const t = (key, substitution) => chrome.i18n.getMessage(key, substitution);

let managing = false;

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

/** Sends one request to the service worker and renders the view it answers with. */
async function send(action, extra = {}) {
  const reply = await chrome.runtime.sendMessage({ type: "popup", action, ...extra });
  if (reply === undefined) {
    showStatus(t("error"), true);
    return;
  }
  if (reply.error === "noPage") {
    showStatus(t("noPage"), true);
  } else if (reply.error !== undefined) {
    showStatus(t("error"), true);
  } else if (reply.ok === false) {
    showStatus(reply.reason === "unreachable" ? t("unreachable") : extra.signInHint ?? t("error"), true);
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

  node.querySelector(".tile").addEventListener("click", () => {
    if (managing || profile.active) {
      return;
    }
    showStatus(t("switching", profile.name));
    void send("switch", { id: profile.id, signInHint: t("switchSignIn", profile.name) });
  });

  const form = node.querySelector(".remember");
  const toggle = node.querySelector(".toggle-remember");
  toggle.textContent = profile.remembersPassword ? t("forgetPassword") : t("rememberPassword");
  toggle.addEventListener("click", () => {
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
    if (window.confirm(t("removeConfirm", profile.name))) {
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
  showStatus("");
  void send("adopt");
});

document.querySelector("#add").addEventListener("click", () => {
  showStatus(t("addHint"));
  void send("signout");
});

translate(document);
void send("view");
