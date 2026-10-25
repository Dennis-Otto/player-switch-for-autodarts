/**
 * The options page: whether the Autodarts page shows the button of the switcher, in
 * which corner, the venue mode for a club or pub, and the keyboard shortcuts. A change
 * is saved at once, and the service worker redraws the button in every open Autodarts
 * tab when the settings change.
 *
 * The venue mode lives in the service worker, which keeps the hashes of the PINs and
 * checks each one (`venue.ts`): this page sends it each change, and only sees which
 * PINs are set. While a manager PIN is set, the page opens only with it, and every
 * change of the venue mode carries it. What the page shows is decided in
 * `options-model.ts`.
 */
import type {
  VenueAccount,
  VenueAction,
  VenueReply,
  VenueRequest,
  VenueStatus,
} from "../messages.ts";
import {
  type Choice,
  cornerChoices,
  houseChoices,
  idleChoices,
  idleRequest,
  managerView,
  playerRowView,
  venueReport,
} from "../options-model.ts";
import { openShortcuts, parseSettings, SETTINGS_KEY } from "../page.ts";
import { confirmDialog, pinDialog } from "./dialogs.ts";
import { find, t, translate } from "./dom.ts";

const showButton = find<HTMLInputElement>("#show-button");
const corners = find<HTMLFieldSetElement>("#corners");
const saved = find("#saved");
const locked = find("#locked");
const content = find("#settings");
const managerState = find("#manager-state");
const setManager = find("#set-manager");
const removeManager = find("#remove-manager");
const playerPins = find("#player-pins");
const idleMinutes = find<HTMLSelectElement>("#idle-minutes");
const idleHouse = find<HTMLSelectElement>("#idle-house");

/** One radio button for each corner that the settings know. */
function drawCorners(chosen: string): void {
  for (const { value, text } of cornerChoices(t)) {
    const label = document.createElement("label");
    label.className = "check";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "corner";
    input.value = value;
    input.checked = value === chosen;
    input.addEventListener("change", save);
    const name = document.createElement("span");
    name.textContent = text;
    label.append(input, name);
    corners.append(label);
  }
}

async function save(): Promise<void> {
  corners.disabled = !showButton.checked;
  const settings = parseSettings({
    showButton: showButton.checked,
    corner: corners.querySelector<HTMLInputElement>("input:checked")?.value,
  });
  try {
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    saved.textContent = t("saved");
  } catch {
    saved.textContent = t("error");
  }
}

/** The shortcuts as Chrome has them, which a person changes on the page of Chrome. */
async function drawShortcuts(): Promise<void> {
  const list = find("#commands");
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
let managerPin: string | null = null;

async function askVenue(
  message: VenueRequest,
): Promise<VenueReply | undefined> {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch {
    // The service worker did not answer, as when it stopped on the way.
    return undefined;
  }
}

/** Whether a request of the venue mode worked. */
const worked = (reply: VenueReply | undefined): boolean =>
  reply !== undefined && !("error" in reply) && reply.ok;

/**
 * Sends a request of the venue mode with the manager PIN that opened the page, asks
 * for that PIN when the worker needs it, as after it changed in another window, and
 * shows the venue mode as the worker answers.
 */
async function venueRequest(
  action: VenueAction,
): Promise<VenueReply | undefined> {
  let request: VenueRequest =
    managerPin === null
      ? { type: "venue", ...action }
      : { type: "venue", ...action, managerPin };
  let reply = await askVenue(request);
  while (
    reply !== undefined &&
    !("error" in reply) &&
    !reply.ok &&
    reply.reason === "pin"
  ) {
    const pin = await pinDialog({
      title: t("managerPinTitle"),
      text: t("managerPinText"),
      error: reply.wrong ? t("pinWrong") : "",
    });
    if (pin === null) {
      break;
    }
    request = { ...request, managerPin: pin };
    reply = await askVenue(request);
  }
  if (worked(reply) && typeof request.managerPin === "string") {
    managerPin = request.managerPin;
  }
  saved.textContent = venueReport(reply, t);
  if (reply?.status) {
    drawVenue(reply.status);
  }
  return reply;
}

/**
 * Asks for a new PIN twice, so that a slip of a finger locks nobody out. Answers the
 * PIN, or null when the person cancels.
 */
async function choosePin(title: string): Promise<string | null> {
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
function option({ value, text }: Choice, chosen: string): HTMLOptionElement {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = text;
  element.selected = value === chosen;
  return element;
}

/** One account in the list of the PINs: its name, whether it has a PIN, and the actions. */
function playerRow(account: VenueAccount): HTMLLIElement {
  const row = playerRowView(account, t);
  const item = document.createElement("li");
  item.className = "player";
  const names = document.createElement("span");
  names.className = "names";
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = account.name;
  const state = document.createElement("span");
  state.className = "username";
  state.textContent = row.state;
  names.append(name, state);

  const change = document.createElement("button");
  change.type = "button";
  change.className = "link";
  change.dataset.focus = `set:${account.id}`;
  change.textContent = row.change;
  change.setAttribute("aria-label", `${row.change}: ${account.name}`);
  change.addEventListener("click", async () => {
    const pin = await choosePin(t("newPinFor", account.name));
    if (pin !== null) {
      await venueRequest({ action: "playerPin", id: account.id, pin });
    }
  });
  item.append(names, change);

  if (row.removable) {
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
function drawVenue(status: VenueStatus): void {
  const active = document.activeElement;
  const focus =
    active instanceof HTMLElement ? active.dataset.focus : undefined;

  const manager = managerView(status, t);
  managerState.textContent = manager.state;
  setManager.textContent = manager.set;
  removeManager.hidden = !manager.removable;

  if (status.accounts.length === 0) {
    const hint = document.createElement("li");
    hint.className = "hint";
    hint.textContent = t("playerPinsEmpty");
    playerPins.replaceChildren(hint);
  } else {
    playerPins.replaceChildren(...status.accounts.map(playerRow));
  }

  const minutes = status.idleMinutes === null ? "" : String(status.idleMinutes);
  idleMinutes.replaceChildren(
    ...idleChoices(t).map((choice) => option(choice, minutes)),
  );
  const house = status.house ?? "";
  idleHouse.replaceChildren(
    ...houseChoices(status, t).map((choice) => option(choice, house)),
  );
  idleHouse.disabled = status.idleMinutes === null;

  if (focus !== undefined) {
    document
      .querySelector<HTMLElement>(`[data-focus="${CSS.escape(focus)}"]`)
      ?.focus();
  }
}

setManager.addEventListener("click", async () => {
  const pin = await choosePin(t("newManagerPinTitle"));
  if (pin === null) {
    return;
  }
  const reply = await venueRequest({ action: "managerPin", pin });
  if (worked(reply)) {
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
  if (worked(reply)) {
    managerPin = null;
  }
});

/** Saves the return after a break, as the two choices have it now. */
function saveIdle(): void {
  idleHouse.disabled = idleMinutes.value === "";
  void venueRequest(idleRequest(idleMinutes.value, idleHouse.value));
}

idleMinutes.addEventListener("change", saveIdle);
idleHouse.addEventListener("change", saveIdle);

find("#shortcuts").addEventListener("click", () => {
  void openShortcuts(chrome);
});

/** Shows the settings, once the manager PIN opened them or when none is set. */
function open(): void {
  locked.hidden = true;
  content.hidden = false;
}

find("#unlock").addEventListener("click", async () => {
  const reply = await venueRequest({ action: "unlock" });
  if (worked(reply)) {
    open();
    showButton.focus();
  }
});

document.documentElement.lang = t("locale");
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
const first = await askVenue({ type: "venue", action: "status" });
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
