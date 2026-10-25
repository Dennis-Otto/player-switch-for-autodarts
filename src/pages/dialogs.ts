/**
 * The dialogs of the pages: a question to confirm, and the question for a PIN with a
 * number pad. Both work on a touch screen, keep the focus inside while they are open,
 * close with Esc and give the focus back to the control that opened them.
 */
import { isPin } from "../venue.ts";
import { t } from "./dom.ts";

/**
 * Asks the person to confirm in a dialog of the page. Answers true when the person
 * confirms, false when they cancel.
 */
export function confirmDialog({
  title,
  text,
  confirm,
  cancel,
}: {
  title: string;
  text: string;
  confirm: string;
  cancel: string;
}): Promise<boolean> {
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
      giveBack(opener);
      resolve(dialog.returnValue === "confirm");
    });
    dialog.showModal();
  });
}

/** Gives the focus back to the control that had it, while it is still in the page. */
function giveBack(opener: Element | null): void {
  if (opener instanceof HTMLElement && opener.isConnected) {
    opener.focus();
  }
}

// The keys of the number pad, in the rows of a phone; "delete" takes the last digit back.
const PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "delete", "0"];

/**
 * Asks for a PIN in a dialog of the page, with a number pad for a touch screen; a
 * keyboard types into the field as well, Enter confirms and Esc cancels. `error` says,
 * read out at once, why the dialog asks again, such as after a wrong PIN. Answers the
 * PIN, 4 to 8 digits, or null when the person cancels.
 */
export function pinDialog({
  title,
  text,
  error = "",
}: {
  title: string;
  text: string;
  error?: string;
}): Promise<string | null> {
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
      button.textContent = "⌫";
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
      giveBack(opener);
      resolve(pin);
    });
    dialog.showModal();
  });
}
