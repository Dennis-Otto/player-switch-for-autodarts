/**
 * The players and their accounts, as the popup and the switcher in the Autodarts page
 * both show them: one module, so the two can't drift apart. It holds no account logic:
 * it asks the service worker for a view and sends it the person's taps. All the
 * thinking happens in the worker, and what the page decides is in `popup-model.ts`. On
 * a page with a lobby, each parked player's tile offers "Join the lobby", which seats
 * that player there while the page plays on (decision 0016), and "Join again" once it
 * says "In the lobby". In the venue mode, the
 * worker asks for a PIN before a switch, a join or a change in "Manage accounts"; this
 * module then asks the person, with a number pad for a touch screen, and sends the
 * request again. Below the tile of the player who plays, it offers that player to
 * protect their account with a PIN, or to remove it with that PIN, without the manager
 * (decision 0018).
 */
import type {
  PlayersAction,
  PlayersReply,
  PlayersRequest,
  PlayersView,
  PlayerView,
} from "../messages.ts";
import { initialOf, tileForKey } from "../page.ts";
import {
  type Ask,
  answered,
  keptManagerPin,
  type Manage,
  matchQuestion,
  mustUnlock,
  pinQuestion,
  questionOf,
  rememberRefused,
  type Status,
  showsEmpty,
  showsForgetAll,
  statusAfter,
  tileOf,
  toggled,
} from "../popup-model.ts";
import { choosePin, confirmDialog, pinDialog } from "./dialogs.ts";
import { find, t, translate } from "./dom.ts";
import { helpHref } from "./support.ts";

// The language of the texts that show, so that names and times read the same: the
// browser may run in a language the extension has no texts for.
const language = t("locale");

/**
 * Asks whether a request may end the match that runs in the page: a switch, or a
 * removal that signs the player out there.
 */
function confirmMatch(action: string): Promise<boolean> {
  return confirmDialog(matchQuestion(action, t));
}

/** Asks whether to remove an account, which also ends its session at Autodarts. */
function confirmRemoval(profile: PlayerView): Promise<boolean> {
  return confirmDialog({
    title: t("remove"),
    text: t("removeConfirm", profile.name),
    confirm: t("remove"),
    cancel: t("cancel"),
  });
}

/** A small mark on the tile of an account that asks for a PIN: a lock and the word. */
function pinMark(): HTMLSpanElement {
  const mark = document.createElement("span");
  mark.className = "pin-mark";
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

// The controls that send a request to the service worker.
const REQUEST_CONTROLS =
  ".tile, .join, .own, .toggle-remember, .remove, .save-remember, #adopt, #add, #open-page, #stop-adding, #forget-all";

// The controls of a tile, so that the focus comes back to the same one when the tiles
// are drawn anew after a request.
const TILE_CONTROLS = [
  ".tile",
  ".join",
  ".own",
  ".toggle-remember",
  ".remove",
  ".cred-username",
  ".cred-password",
  ".cancel-remember",
  ".save-remember",
];

/** Whether the person can reach an element: it is in the page, shown and not inert. */
function reachable(
  element: Element | null | undefined,
): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    element.isConnected &&
    element.closest("[hidden], [inert]") === null
  );
}

/** Sets an ARIA state that is true or absent. */
function mark(element: Element, attribute: string, on: boolean): void {
  if (on) {
    element.setAttribute(attribute, "true");
  } else {
    element.removeAttribute(attribute);
  }
}

/** The picture of an account, or its initial when Autodarts has no picture of it. */
function avatarOf(profile: PlayerView, image: HTMLImageElement): void {
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

/** Where the focus was before the tiles were drawn anew. */
interface FocusBefore {
  element: Element | null;
  id: string | null;
  index: number;
  control: string | null;
}

/**
 * Shows the players in the page that loads this module and wires its controls: the
 * list of tiles, "Manage accounts", "Save account", "Add account" and the notice while
 * a new account is being added, with its "Cancel". The page carries the elements of
 * popup.html, with the template of a tile. With `numbered`, each of the first nine tiles
 * shows its key, and the keys 1 to 9 pick a player. `onRender` runs each time the
 * players are shown anew.
 */
export function mountPlayers({
  numbered = false,
  onRender = () => {},
}: {
  numbered?: boolean;
  onRender?: () => void;
} = {}): void {
  const profiles = find("#profiles");
  const template = find<HTMLTemplateElement>("#profile-template");
  // What happens, read out politely, and what went wrong, read out at once. Both stay
  // in the page, empty and out of sight when there is nothing to say, so that a screen
  // reader already knows them when a message arrives.
  const statusBar = find("#status");
  const problemBar = find("#problem");
  const unsaved = find("#unsaved");
  const manageButton = find("#manage");
  const updateHint = find("#update-hint");
  // "Open Autodarts", which only the popup has: the switcher is in an Autodarts page.
  const openPageButton = document.querySelector<HTMLElement>("#open-page");
  const adding = find("#adding");
  const addButton = find("#add");
  // "Forget all accounts", which shows in "Manage accounts" while an account is saved.
  const forgetAllButton = document.querySelector<HTMLElement>("#forget-all");

  let manage: Manage = { managing: false, managerPin: null };
  // True while a request is with the service worker: the page then takes no other tap.
  let busy = false;
  // The accounts that show, for the name in the question for a PIN.
  let shown: PlayerView[] = [];
  // Whether a manager PIN guards "Manage accounts", and the account whose player may
  // protect it with a PIN of their own.
  let venue: PlayersView["venue"] = {
    manager: false,
    protectable: null,
    removable: null,
  };
  // The lobby that the page shows, with the accounts seated there, or null.
  let lobby: PlayersView["lobby"] = null;

  /**
   * Shows a message, an error in the region that is read out at once; "" clears both.
   * A link to the help follows it when `help` names an entry, in a tab of its own.
   */
  function showStatus(
    text: string,
    isError = false,
    help?: Status["help"],
  ): void {
    statusBar.textContent = isError ? "" : text;
    problemBar.textContent = isError ? text : "";
    if (help !== undefined) {
      const link = document.createElement("a");
      link.href = helpHref(help.anchor);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = help.label;
      (isError ? problemBar : statusBar).append(" ", link);
    }
  }

  /**
   * Marks the accounts and their actions as busy, or as ready again. They stay
   * focusable (aria-disabled, not disabled), so the focus stays where it was and a
   * screen reader reads them as unavailable while the request runs.
   */
  function setBusy(value: boolean): void {
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
  async function send(
    action: PlayersAction,
    signInHint: string | null = null,
  ): Promise<PlayersReply | undefined> {
    if (busy) {
      return undefined;
    }
    setBusy(true);
    try {
      return await request(action, signInHint);
    } finally {
      setBusy(false);
    }
  }

  async function ask(message: Ask): Promise<PlayersReply | undefined> {
    const request: PlayersRequest = { type: "popup", ...message };
    try {
      return await chrome.runtime.sendMessage(request);
    } catch {
      // The service worker did not answer, as when it stopped on the way.
      return undefined;
    }
  }

  /** The name of the account that a request is about, for the question for its PIN. */
  function nameOf(message: Ask): string {
    const id = "id" in message ? message.id : undefined;
    return shown.find((profile) => profile.id === id)?.name ?? "";
  }

  /** Asks the service worker and shows what it answers, which it also returns. */
  async function request(
    action: PlayersAction,
    signInHint: string | null,
  ): Promise<PlayersReply | undefined> {
    let message: Ask =
      manage.managerPin === null
        ? action
        : { ...action, managerPin: manage.managerPin };
    let reply = await ask(message);
    // The worker spent no token yet: it waits for a PIN, or for a yes to end the match
    // that runs in the page. A cancel leaves everything as it was.
    for (
      let question = questionOf(reply);
      question !== null;
      question = questionOf(reply)
    ) {
      const view = (reply as PlayersReply).view;
      if (question.kind === "match") {
        if (!(await confirmMatch(message.action))) {
          showStatus("");
          render(view);
          return reply;
        }
        message = answered(message, question);
      } else {
        const pin = await pinDialog(
          pinQuestion(question, nameOf(message), t, message.action),
        );
        if (pin === null) {
          showStatus("");
          render(view);
          return reply;
        }
        message = answered(message, question, pin);
      }
      reply = await ask(message);
    }
    // The manager PIN that worked opens "Manage accounts" until it closes.
    manage = {
      ...manage,
      managerPin: keptManagerPin(manage.managerPin, message, reply),
    };
    // The accounts that show are still those before a removal.
    const status = statusAfter(reply, signInHint, t, {
      action: message.action,
      name: nameOf(message),
    });
    showStatus(status.text, status.error, status.help);
    if (reply === undefined) {
      return reply;
    }
    // "Open Autodarts" shows while no Autodarts tab answers; an answer that doesn't say
    // leaves it as it is. It stays hidden for an account that has to sign in again: the
    // page there is still signed in as the player before, and signing out in it would end
    // that session, which "Add account" parks first.
    if (
      openPageButton !== null &&
      "page" in reply &&
      reply.page !== undefined
    ) {
      openPageButton.hidden = reply.page;
    }
    render(reply.view);
    return reply;
  }

  function render(view: PlayersView): void {
    const before = focusBefore();
    shown = view.profiles;
    venue = view.venue;
    lobby = view.lobby;
    profiles.replaceChildren();
    view.profiles.forEach((profile, index) => {
      profiles.append(tile(profile, index));
    });
    unsaved.hidden = !view.unsaved;
    adding.hidden = !view.adding;
    updateHint.hidden = !view.updateHint;
    showForgetAll();
    if (
      showsEmpty(
        view,
        problemBar.textContent ?? "",
        statusBar.textContent ?? "",
      )
    ) {
      showStatus(t("empty"));
    }
    restoreFocus(before);
    onRender();
  }

  /**
   * Opens the form of "Remember password" of an account again after Autodarts didn't
   * take what it held, with the username but never the password, so that a typo is
   * fixed without typing everything again; the status line says what went wrong.
   */
  function reopenRemember(id: string, username: string): void {
    const item = ([...profiles.children] as HTMLElement[]).find(
      (candidate) => candidate.dataset.id === id,
    );
    const form = item?.querySelector<HTMLFormElement>(".remember");
    if (form === null || form === undefined) {
      return;
    }
    form.hidden = false;
    find<HTMLInputElement>(".cred-username", form).value = username;
    find(".cred-password", form).focus();
  }

  /** Where the focus is before the tiles are drawn anew, to bring it back after. */
  function focusBefore(): FocusBefore {
    const element = document.activeElement;
    const item = element?.closest<HTMLElement>("#profiles > .profile") ?? null;
    if (element === null || item === null) {
      return { element, id: null, index: -1, control: null };
    }
    return {
      element,
      id: item.dataset.id ?? null,
      index: [...profiles.children].indexOf(item),
      control:
        TILE_CONTROLS.find((selector) => element.matches(selector)) ?? null,
    };
  }

  /** The tile of the player who plays, or "Add account" when nobody does. */
  function home(): HTMLElement {
    const active = profiles.querySelector(".profile.active .tile");
    return reachable(active) ? active : addButton;
  }

  /**
   * Gives the focus back after the tiles were drawn anew, so that a keyboard or a
   * screen reader keeps its place: to the same control of the same account, to the
   * account in its place when it was removed, or to a control nearby when that one
   * went away, such as the form after its password was saved.
   */
  function restoreFocus({ element, id, index, control }: FocusBefore): void {
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
    const items = [...profiles.children] as HTMLElement[];
    const item =
      items.find((candidate) => candidate.dataset.id === id) ??
      items[Math.min(index, items.length - 1)];
    const target = [control, manage.managing ? ".toggle-remember" : ".tile"]
      .map((selector) =>
        selector === null ? null : (item?.querySelector(selector) ?? null),
      )
      .find((candidate) => reachable(candidate));
    (reachable(target) ? target : home()).focus();
  }

  function tile(profile: PlayerView, index: number): HTMLElement {
    const node = (template.content.firstElementChild as HTMLElement).cloneNode(
      true,
    ) as HTMLElement;
    const view = tileOf(profile, index, {
      numbered,
      now: Date.now(),
      language,
      t,
      lobby,
      venue,
    });
    node.classList.toggle("active", profile.active);
    node.dataset.id = profile.id;
    translate(node);

    const button = find<HTMLButtonElement>(".tile", node);
    // The tile of the player who plays is the current one: a tap on it changes nothing.
    // While the accounts are managed, a tap on a tile changes nothing either, so the
    // tiles step aside, and the actions below each one carry its name.
    if (profile.active) {
      button.setAttribute("aria-current", "true");
    }
    button.inert = manage.managing;
    avatarOf(profile, find<HTMLImageElement>(".avatar", node));
    find(".name", node).textContent = profile.name;
    find(".username", node).textContent = profile.username;
    if (view.key !== null) {
      const key = document.createElement("kbd");
      key.className = "key";
      key.textContent = view.key;
      key.setAttribute("aria-hidden", "true");
      button.prepend(key);
      button.setAttribute("aria-keyshortcuts", view.key);
    }

    const chip = find(".chip", node);
    if (profile.pin) {
      chip.before(pinMark());
    }
    if (view.chip !== null) {
      chip.textContent = view.chip.text;
      chip.classList.add(view.chip.kind);
      chip.hidden = false;
    }

    // "Join the lobby" seats the player in the lobby that the page shows, and the page
    // plays on with the player who plays there; "Join again", below a tile that says
    // "In the lobby", seats a player whom the host took out since. Its name says whose
    // seat it is, as the tiles show the same words for every player.
    const join = find<HTMLButtonElement>(".join", node);
    join.hidden = view.join === null;
    if (view.join !== null) {
      join.textContent = view.join.text;
      join.setAttribute("aria-label", view.join.label);
      join.classList.toggle("again", view.join.again);
    }
    join.addEventListener("click", () => {
      if (busy || manage.managing) {
        return;
      }
      showStatus(t("joining", profile.name));
      void send(
        { action: "join", id: profile.id },
        t("switchSignIn", profile.name),
      );
    });

    // At a display with a manager PIN, the player who plays looks after their own
    // account: "Protect with a PIN" gives it a first PIN, asked twice, and "Remove my
    // account", once it has one, removes it after a yes and that PIN.
    const own = find<HTMLButtonElement>(".own", node);
    own.hidden = view.own === null;
    if (view.own !== null) {
      own.textContent = view.own.text;
      own.setAttribute("aria-label", view.own.label);
      own.classList.toggle("danger", view.own.kind === "remove");
    }
    own.addEventListener("click", async () => {
      if (busy || manage.managing || view.own === null) {
        return;
      }
      if (view.own.kind === "protect") {
        const newPin = await choosePin(t("newPinFor", profile.name));
        if (newPin !== null) {
          void send({ action: "protect", id: profile.id, newPin });
        }
        return;
      }
      if (await confirmRemoval(profile)) {
        void send({ action: "removeAccount", id: profile.id });
      }
    });

    const menu = find(".menu", node);
    menu.hidden = !manage.managing;
    menu.setAttribute("aria-label", profile.name);

    // Shows in the manage view that the renewal of a parked session works, or since
    // when it fails, while the extension keeps trying.
    if (view.renewed !== null) {
      const renewed = find(".renewed", node);
      renewed.textContent = view.renewed;
      renewed.hidden = false;
    }
    if (view.failing !== null) {
      const failing = find(".renewal-failing", node);
      failing.textContent = view.failing;
      failing.hidden = false;
    }

    button.addEventListener("click", () => {
      if (busy || manage.managing || profile.active) {
        return;
      }
      showStatus(t("switching", profile.name));
      void send(
        { action: "switch", id: profile.id },
        t("switchSignIn", profile.name),
      );
    });

    const form = find<HTMLFormElement>(".remember", node);
    const toggle = find(".toggle-remember", node);
    toggle.textContent = view.toggle;
    toggle.addEventListener("click", () => {
      if (busy) {
        return;
      }
      if (profile.remembersPassword) {
        void send({ action: "forgetPassword", id: profile.id });
      } else {
        form.hidden = !form.hidden;
        if (!form.hidden) {
          find(".cred-username", form).focus();
        }
      }
    });

    find(".cancel-remember", node).addEventListener("click", () => {
      form.hidden = true;
      toggle.focus();
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const username = find<HTMLInputElement>(
        ".cred-username",
        form,
      ).value.trim();
      const password = find<HTMLInputElement>(".cred-password", form).value;
      if (username === "" || password === "") {
        return;
      }
      void send({
        action: "remember",
        id: profile.id,
        username,
        password,
      }).then((reply) => {
        if (rememberRefused(reply)) {
          reopenRemember(profile.id, username);
        }
      });
    });

    find(".remove", node).addEventListener("click", async () => {
      if (busy) {
        return;
      }
      if (await confirmRemoval(profile)) {
        void send({ action: "removeAccount", id: profile.id });
      }
    });

    return node;
  }

  /** Shows "Forget all accounts" in "Manage accounts" while an account is saved. */
  function showForgetAll(): void {
    if (forgetAllButton !== null) {
      forgetAllButton.hidden = !showsForgetAll(manage.managing, shown.length);
    }
  }

  /** Opens or closes "Manage accounts"; closed, it has forgotten the manager PIN. */
  function setManage(next: Manage): void {
    manage = next;
    const { managing } = manage;
    document.body.classList.toggle("managing", managing);
    manageButton.setAttribute("aria-pressed", String(managing));
    for (const menu of profiles.querySelectorAll<HTMLElement>(".menu")) {
      menu.hidden = !managing;
    }
    for (const button of profiles.querySelectorAll<HTMLElement>(".tile")) {
      button.inert = managing;
    }
    showForgetAll();
  }

  // "Manage accounts" is a toggle with a name that stays: pressed, it shows the actions
  // of every account, and pressed again, the tiles. While a manager PIN guards it, it
  // opens only with that PIN, which it forgets again as it closes.
  manageButton.addEventListener("click", async () => {
    if (busy) {
      return;
    }
    if (mustUnlock(manage, venue.manager)) {
      const reply = await send({ action: "unlock" });
      if (reply === undefined || "error" in reply || !reply.ok) {
        return;
      }
    }
    setManage(toggled(manage));
  });

  // Forgets every account after a yes, as before the display changes hands. "Manage
  // accounts" closes once they are gone, and with it the manager PIN, which is gone too.
  forgetAllButton?.addEventListener("click", async () => {
    if (busy) {
      return;
    }
    const confirmed = await confirmDialog({
      title: t("forgetAll"),
      text: t("forgetAllConfirm"),
      confirm: t("forgetAll"),
      cancel: t("cancel"),
    });
    if (!confirmed) {
      return;
    }
    const reply = await send({ action: "forgetAll" });
    if (reply !== undefined && "ok" in reply && reply.ok) {
      setManage({ managing: false, managerPin: null });
      manageButton.focus();
    }
  });

  find("#adopt").addEventListener("click", () => {
    if (busy) {
      return;
    }
    showStatus("");
    void send({ action: "adopt" });
  });

  openPageButton?.addEventListener("click", () => {
    if (busy) {
      return;
    }
    showStatus("");
    void send({ action: "openPage" });
  });

  // The page signs out, and the account that signs in next is saved by itself: the
  // notice of #adding says so, as long as the extension waits for it.
  addButton.addEventListener("click", () => {
    if (busy) {
      return;
    }
    showStatus("");
    void send({ action: "signout" });
  });

  find("#stop-adding").addEventListener("click", () => {
    if (busy) {
      return;
    }
    void send({ action: "stopAdding" });
  });

  if (numbered) {
    document.addEventListener("keydown", (event) => {
      // A key is a player only outside the forms, the open dialogs and the manage mode.
      const typing = event.target instanceof HTMLInputElement;
      if (
        busy ||
        manage.managing ||
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
      const tiles = profiles.querySelectorAll<HTMLElement>(".tile");
      const index = tileForKey(event.key, tiles.length);
      const chosen = index === null ? undefined : tiles[index];
      if (chosen !== undefined) {
        event.preventDefault();
        chosen.focus();
        chosen.click();
      }
    });
  }

  document.documentElement.lang = language;
  translate(document);
  void send({ action: "view" });
}
