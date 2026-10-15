// The popup. It holds no account logic: it asks the service worker for a view and
// sends it the person's taps. All the thinking happens in the worker and in lib/.

const profiles = document.querySelector("#profiles");
const template = document.querySelector("#profile-template");
const status = document.querySelector("#status");
const unsaved = document.querySelector("#unsaved");

function say(text) {
  status.textContent = text;
}

/** Sends one request to the service worker and renders the view it answers with. */
async function send(action, extra = {}) {
  const reply = await chrome.runtime.sendMessage({ type: "popup", action, ...extra });
  if (reply === undefined || reply.error !== undefined) {
    say("Something went wrong. Is an Autodarts tab open?");
    return;
  }
  if (reply.ok === false) {
    say("That account could not be signed in. Add its password below, or sign in once.");
  }
  render(reply.view);
}

function render(view) {
  profiles.replaceChildren();
  for (const profile of view.profiles) {
    profiles.append(tile(profile));
  }
  unsaved.hidden = !view.unsaved;
  if (view.profiles.length === 0 && !view.unsaved) {
    say("No accounts yet. Sign in on play.autodarts.com, then open this and save it.");
  }
}

function tile(profile) {
  const node = template.content.firstElementChild.cloneNode(true);
  node.classList.toggle("active", profile.active);

  const avatar = node.querySelector(".avatar");
  if (profile.picture !== null) {
    avatar.src = profile.picture;
  }
  node.querySelector(".name").textContent = profile.name;
  node.querySelector(".username").textContent = profile.username;

  const badge = node.querySelector(".badge");
  if (profile.active) {
    badge.textContent = "Playing";
    badge.hidden = false;
  } else if (profile.needsSignIn) {
    badge.textContent = "Needs sign-in";
    badge.hidden = false;
  }

  node.querySelector(".switch").addEventListener("click", () => {
    say(`Switching to ${profile.name}…`);
    void send("switch", { id: profile.id });
  });

  const form = node.querySelector(".remember");
  const toggle = node.querySelector(".toggle-remember");
  toggle.textContent = profile.remembersPassword ? "Forget password" : "Remember password";
  toggle.addEventListener("click", () => {
    if (profile.remembersPassword) {
      void send("forgetPassword", { id: profile.id });
    } else {
      form.hidden = !form.hidden;
    }
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
    void send("removeAccount", { id: profile.id });
  });

  return node;
}

document.querySelector("#adopt").addEventListener("click", () => {
  say("Saving the account signed in now…");
  void send("adopt");
});

document.querySelector("#add").addEventListener("click", () => {
  say("Signing out so you can sign in as another account…");
  void send("signout");
});

void send("view");
