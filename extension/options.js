// The options page: whether the Autodarts page shows the button of the switcher, in
// which corner, and the keyboard shortcuts. A change is saved at once, and the service
// worker redraws the button in every open Autodarts tab when the settings change.
import { CORNERS, parseSettings, SETTINGS_KEY } from "./lib/page.js";
import { t, translate } from "./players.js";

const showButton = document.querySelector("#show-button");
const corners = document.querySelector("#corners");
const saved = document.querySelector("#saved");

// The corners as they lie on the screen, in two rows: the top ones first.
const CORNER_LABELS = {
  "top-left": t("cornerTopLeft"),
  "top-right": t("cornerTopRight"),
  "bottom-left": t("cornerBottomLeft"),
  "bottom-right": t("cornerBottomRight"),
};

/** One radio button for each corner that the settings know. */
function drawCorners(chosen) {
  for (const corner of Object.keys(CORNER_LABELS).filter((name) => CORNERS.includes(name))) {
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
    name.textContent = command.name === "_execute_action" ? t("commandPopup") : t("commandToggle");
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

document.querySelector("#shortcuts").addEventListener("click", () => {
  void chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

document.documentElement.lang = chrome.i18n.getUILanguage();
document.title = `${t("settings")} · ${t("extName")}`;
translate(document);

const settings = parseSettings((await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]);
showButton.checked = settings.showButton;
corners.disabled = !settings.showButton;
drawCorners(settings.corner);
showButton.addEventListener("change", save);
await drawShortcuts();
