// The options page: whether the Autodarts page shows the button of the switcher, in
// which corner, the venue mode for a club or pub, and the keyboard shortcuts. A change
// is saved at once, and the service worker redraws the button in every open Autodarts
// tab when the settings change.
//
// The venue mode lives in the service worker, which keeps the hashes of the PINs and
// checks each one (lib/venue.js): this page sends it each change, and only sees which
// PINs are set. While a manager PIN is set, the page opens only with it, and every
// change of the venue mode carries it.
import { CORNERS, parseSettings, SETTINGS_KEY } from "./lib/page.js";
import { IDLE_MINUTES } from "./lib/venue.js";
import { confirmDialog, pinDialog, t, translate } from "./players.js";

const showButton = document.querySelector("#show-button");
const corners = document.querySelector("#corners");
const saved = document.querySelector("#saved");
const locked = document.querySelector("#locked");
const content = document.querySelector("#settings");
const managerState = document.querySelector("#manager-state");
const setManager = document.querySelector("#set-manager");
const removeManager = document.querySelector("#remove-manager");
const playerPins = document.querySelector("#player-pins");
const idleMinutes = document.querySelector("#idle-minutes");
const idleHouse = document.querySelector("#idle-house");

// The corners as they lie on the screen, in two rows: the top ones first.
const CORNER_LABELS = {
  "top-left": t("cornerTopLeft"),
  "top-right": t("cornerTopRight"),
  "bottom-left": t("cornerBottomLeft"),
  "bottom-right": t("cornerBottomRight"),
};

/** One radio button for each corner that the settings know. */
function drawCorners(chosen) {
  for (const corner of Object.keys(CORNER_LABELS).filter((name) =>
    CORNERS.includes(name),
  )) {
    const label = document.createElement("label");
    label.className = "check";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "corner";
    input.value = corner;
    input.checked = corner === chosen;
    input.addEventListener("change", save);
    const text = document.createElement("span");
    text.textContent = CORNER_LABELS[corner];
    label.append(input, text);
    corners.append(label);
  }
}

async function save() {
  corners.disabled = !showButton.checked;
  const settings = parseSettings({
    showButton: showButton.checked,
    corner: corners.querySelector("input:checked")?.value,
  });
  try {
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    saved.textContent = t("saved");
  } catch {
    saved.textContent = t("error");
  }
}

/** The shortcuts as Chrome has them, which a person changes on the page of Chrome. */
async function drawShortcuts() {
  const list = document.querySelector("#commands");
  for (const command of await chrome.commands.getAll()) {
    const name = document.createElement("dt");
    name.textContent =
      command.name === "_execute_action"
        ? t("commandPopup")
        : t("commandToggle");
    const keys = document.createElement("dd");
    if (command.shortcut) {
      const kbd = document.createElement("kbd");
      kbd.textContent = command.shortcut;
      keys.append(kbd);
    } else {
      keys.textContent = t("shortcutNotSet");
    }
    list.append(name, keys);
  }
}

// The manager PIN that opened the page, which goes along with each change of the
// venue mode; it lives as long as the page.
let managerPin = null;

async function askVenue(message) {
  try {
    return await chrome.runtime.sendMessage({ type: "venue", ...message });
  } catch {
    // The service worker did not answer, as when it stopped on the way.
    return undefined;
  }
}

/** Says how a change of the venue mode went, in the status line of the page. */
function report(reply) {
  if (reply === undefined || reply.error !== undefined) {
    saved.textContent = t("error");
  } else if (reply.reason === "locked") {
    saved.textContent = t("pinLocked");
  } else if (reply.reason === "invalid") {
    saved.textContent = t("pinInvalid");
  } else if (reply.ok === true) {
    saved.textContent = t("saved");
  } else {
    // The person cancelled the question for the manager PIN.
    saved.textContent = "";
  }
}

/**
 * Sends a request of the venue mode with the manager PIN that opened the page, asks
 * for that PIN when the worker needs it, as after it changed in another window, and
 * shows the venue mode as the worker answers.
 */
async function venueRequest(message) {
  let request = managerPin === null ? message : { ...message, managerPin };
  let reply = await askVenue(request);
  while (reply?.ok === false && reply.reason === "pin") {
    const pin = await pinDialog({
      title: t("managerPinTitle"),
      text: t("managerPinText"),
      error: reply.wrong === true ? t("pinWrong") : "",
    });
    if (pin === null) {
      break;
    }
    request = { ...request, managerPin: pin };
    reply = await askVenue(request);
  }
  if (reply?.ok === true && typeof request.managerPin === "string") {
    managerPin = request.managerPin;
  }
  report(reply);
  if (reply?.status) {
    drawVenue(reply.status);
  }
  return reply;
}

/**
 * Asks for a new PIN twice, so that a slip of a finger locks nobody out. Answers the
 * PIN, or null when the person cancels.
 */
async function choosePin(title) {
  let error = "";
  for (;;) {
    const first = await pinDialog({ title, text: t("newPinText"), error });
    if (first === null) {
      return null;
    }
    const second = await pinDialog({
      title: t("repeatPinTitle"),
      text: t("repeatPinText"),
    });
    if (second === null) {
      return null;
    }
    if (first === second) {
      return first;
    }
    error = t("pinMismatch");
  }
}

/** A choice of a select, with its value and its text. */
function option(value, text, chosen) {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = text;
  element.selected = value === chosen;
  return element;
}

/** One account in the list of the PINs: its name, whether it has a PIN, and the actions. */
function playerRow(account) {
  const item = document.createElement("li");
  item.className = "player";
  const names = document.createElement("span");
  names.className = "names";
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = account.name;
  const state = document.createElement("span");
  state.className = "username";
  state.textContent = `${account.username} · ${account.pin ? t("pinSet") : t("noPin")}`;
  names.append(name, state);

  const change = document.createElement("button");
  change.type = "button";
  change.className = "link";
  change.dataset.focus = `set:${account.id}`;
  change.textContent = account.pin ? t("changePin") : t("setPin");
  change.setAttribute("aria-label", `${change.textContent}: ${account.name}`);
  change.addEventListener("click", async () => {
    const pin = await choosePin(t("newPinFor", account.name));
    if (pin !== null) {
      await venueRequest({ action: "playerPin", id: account.id, pin });
    }
  });
  item.append(names, change);

  if (account.pin) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "link danger";
    remove.dataset.focus = `remove:${account.id}`;
    remove.textContent = t("removePin");
    remove.setAttribute("aria-label", `${t("removePin")}: ${account.name}`);
    remove.addEventListener("click", () =>
      venueRequest({ action: "playerPin", id: account.id, pin: null }),
    );
    item.append(remove);
  }
  return item;
}

/** Shows the venue mode as the worker has it, and keeps the focus on its control. */
function drawVenue(status) {
  const focus = document.activeElement?.dataset?.focus;

  managerState.textContent = status.manager
    ? t("managerPinOn")
    : t("managerPinOff");
  setManager.textContent = status.manager
    ? t("changeManagerPin")
    : t("setManagerPin");
  removeManager.hidden = !status.manager;

  playerPins.replaceChildren(
    ...(status.accounts.length === 0
      ? [
          Object.assign(document.createElement("li"), {
            className: "hint",
            textContent: t("playerPinsEmpty"),
          }),
        ]
      : status.accounts.map(playerRow)),
  );

  const minutes = status.idleMinutes === null ? "" : String(status.idleMinutes);
  idleMinutes.replaceChildren(
    option("", t("idleNever"), minutes),
    ...IDLE_MINUTES.map((count) =>
      option(String(count), t("idleMinutes", String(count)), minutes),
    ),
  );
  const house = status.house ?? "";
  idleHouse.replaceChildren(
    option("", t("idleSignOut"), house),
    ...status.accounts.map((account) =>
      option(account.id, account.name, house),
    ),
  );
  idleHouse.disabled = status.idleMinutes === null;

  if (focus !== undefined) {
    document.querySelector(`[data-focus="${CSS.escape(focus)}"]`)?.focus();
  }
}

setManager.addEventListener("click", async () => {
  const pin = await choosePin(t("newManagerPinTitle"));
  if (pin === null) {
    return;
  }
  const reply = await venueRequest({ action: "managerPin", pin });
  if (reply?.ok === true) {
    // From now on, the new PIN guards the page.
    managerPin = pin;
  }
});

removeManager.addEventListener("click", async () => {
  const confirmed = await confirmDialog({
    title: t("removeManagerPin"),
    text: t("removeManagerPinConfirm"),
    confirm: t("removeManagerPin"),
    cancel: t("cancel"),
  });
  if (!confirmed) {
    return;
  }
  const reply = await venueRequest({ action: "managerPin", pin: null });
  if (reply?.ok === true) {
    managerPin = null;
  }
});

/** Saves the return after a break, as the two choices have it now. */
function saveIdle() {
  idleHouse.disabled = idleMinutes.value === "";
  void venueRequest({
    action: "idle",
    minutes: idleMinutes.value === "" ? null : Number(idleMinutes.value),
    house: idleHouse.value === "" ? null : idleHouse.value,
  });
}

idleMinutes.addEventListener("change", saveIdle);
idleHouse.addEventListener("change", saveIdle);

document.querySelector("#shortcuts").addEventListener("click", () => {
  void chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

/** Shows the settings, once the manager PIN opened them or when none is set. */
function open() {
  locked.hidden = true;
  content.hidden = false;
}

document.querySelector("#unlock").addEventListener("click", async () => {
  const reply = await venueRequest({ action: "unlock" });
  if (reply?.ok === true) {
    open();
    showButton.focus();
  }
});

document.documentElement.lang = chrome.i18n.getMessage("locale");
document.title = `${t("settings")} · ${t("extName")}`;
translate(document);

const settings = parseSettings(
  (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY],
);
showButton.checked = settings.showButton;
corners.disabled = !settings.showButton;
drawCorners(settings.corner);
showButton.addEventListener("change", save);
await drawShortcuts();

// The page opens at once only when the worker says that no manager PIN guards it: when
// the worker doesn't answer, it stays locked, and "Unlock" asks again.
const first = await askVenue({ action: "status" });
if (first?.status) {
  drawVenue(first.status);
}
if (first?.status?.manager === false) {
  open();
} else {
  locked.hidden = false;
  if (first?.status === undefined) {
    saved.textContent = t("error");
  }
}
