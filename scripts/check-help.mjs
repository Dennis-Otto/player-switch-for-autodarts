// Checks that the help explains every message of the extension that tells a player
// about a problem or asks them to act: docs/help.md quotes its English text and
// docs/help.de.md its German one, word for word, so that a player who searches the
// help for the words on the screen finds them. A placeholder such as $NAME$ stands
// for any text, such as the name of an example player. Every other message is listed
// as one that needs no entry, so that each new message is sorted into one of the two
// lists. It also checks that "Help" in the extension leads to the help in the language
// of the extension, or to the English help for a language that the website doesn't
// have, such as Dutch. Run by scripts/check-project.sh; no dependencies.
import { existsSync, readdirSync, readFileSync } from "node:fs";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// The messages that report a problem, a state that needs a tap, or a question before
// something ends: each has an entry in the help.
const explained = [
  "needsSignIn",
  "badgeTitle",
  "badgeUnsaved",
  "renewed",
  "updateHintText",
  "unsavedText",
  "removeConfirm",
  "switchSignIn",
  "unreachable",
  "noPage",
  "empty",
  "error",
  "reloadAfterUpdate",
  "matchTitle",
  "matchText",
  "shortcutNotSet",
  "renewalFailing",
  "unknownFormat",
  "pinText",
  "pinWrong",
  "pinInvalid",
  "pinLocked",
  "managerPinText",
  "optionsLocked",
  "pinMismatch",
];

// Names, labels, buttons, titles and the texts of the welcome page, which the help
// quotes where it helps but needs not explain.
const plain = [
  "locale",
  "extName",
  "extDescription",
  "title",
  "manage",
  "playing",
  "badgeSaved",
  "updateHintLink",
  "addAccount",
  "addingText",
  "savedAccount",
  "saveAccount",
  "rememberPassword",
  "forgetPassword",
  "remove",
  "passwordHint",
  "usernameLabel",
  "passwordLabel",
  "save",
  "cancel",
  "switching",
  "openPage",
  "accounts",
  "settings",
  "close",
  "keysHint",
  "switchButton",
  "switchButtonPlaying",
  "matchConfirm",
  "matchCancel",
  "commandPopup",
  "commandToggle",
  "optionsButton",
  "optionShowButton",
  "optionShowButtonHint",
  "optionCorner",
  "cornerBottomRight",
  "cornerBottomLeft",
  "cornerTopRight",
  "cornerTopLeft",
  "optionShortcuts",
  "changeShortcuts",
  "saved",
  "help",
  "helpUrl",
  "report",
  "welcomeDocTitle",
  "welcomeTitle",
  "welcomeLead",
  "welcomePinTitle",
  "welcomePinText",
  "pinPictureTitle",
  "pinPictureText",
  "pinPictureMenu",
  "welcomeFirstTitle",
  "welcomeFirstText",
  "welcomeNextTitle",
  "welcomeNextText",
  "welcomePlusText",
  "welcomePrivacy",
  "pinLabel",
  "pinPad",
  "pinDelete",
  "pinOk",
  "pinTitle",
  "managerPinTitle",
  "optionsLockedTitle",
  "unlock",
  "optionsVenue",
  "optionsVenueHint",
  "managerPinOff",
  "managerPinOn",
  "setManagerPin",
  "changeManagerPin",
  "removeManagerPin",
  "removeManagerPinConfirm",
  "newManagerPinTitle",
  "playerPins",
  "playerPinsHint",
  "playerPinsEmpty",
  "pinSet",
  "noPin",
  "setPin",
  "changePin",
  "removePin",
  "newPinFor",
  "newPinText",
  "repeatPinTitle",
  "repeatPinText",
  "idleHeading",
  "idleAfter",
  "idleNever",
  "idleMinutes",
  "idleTo",
  "idleSignOut",
  "idleHint",
];

// The address of the website, from which the help of each language has its own.
const site = /^site_url:\s*(\S+)\s*$/m.exec(read("mkdocs.yml"))?.[1];
// The languages of the extension, each with the page of its help: docs/help.md for
// English, docs/help.<code>.md for another language of the website, such as German,
// and none for a language that the website doesn't have, such as Dutch, whose "Help"
// leads to the English help.
const languages = readdirSync(
  new URL("../extension/_locales/", import.meta.url),
)
  .sort()
  .map((code) => {
    if (code === "en") {
      return { code, page: "docs/help.md", url: `${site}help.html` };
    }
    const page = `docs/help.${code}.md`;
    return existsSync(new URL(`../${page}`, import.meta.url))
      ? { code, page, url: `${site}${code}/help.html` }
      : { code, page: null, url: `${site}help.html` };
  });

const problems = [];

const enMessages = JSON.parse(read("extension/_locales/en/messages.json"));
for (const key of explained.filter((key) => plain.includes(key))) {
  problems.push(
    `scripts/check-help.mjs lists "${key}" as explained and as plain; keep it in one list`,
  );
}
for (const key of [...explained, ...plain]) {
  if (!(key in enMessages)) {
    problems.push(
      `scripts/check-help.mjs lists "${key}", which no message defines; take it out`,
    );
  }
}
for (const key of Object.keys(enMessages)) {
  if (!explained.includes(key) && !plain.includes(key)) {
    problems.push(
      `the message "${key}" is in neither list of scripts/check-help.mjs: add it to explained, and an entry for it to docs/help.md and docs/help.de.md, when it tells a player about a problem or asks them to act; otherwise to plain`,
    );
  }
}

/**
 * The text of a page as a reader sees it, on one line: without the marks of a quote
 * or a list at the start of a line, the stars of bold and italic, the backticks of
 * code, and with every run of white space as one blank.
 */
function readable(markdown) {
  return markdown
    .replace(/^[ \t]*(?:>[ \t]?)+/gm, "")
    .replace(/\*+|`/g, "")
    .replace(/\s+/g, " ");
}

/** A pattern of the message, in which each placeholder such as $NAME$ is any text. */
function pattern(message) {
  const parts = message
    .split(/\$[A-Z_]+\$/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(parts.join(".+?").replace(/\s+/g, " "));
}

if (site === undefined) {
  problems.push(
    "mkdocs.yml names no site_url, from which the addresses of the help are taken",
  );
}
for (const { code, page, url } of languages) {
  const messages = JSON.parse(read(`extension/_locales/${code}/messages.json`));
  if (page === null) {
    if (site !== undefined && messages.helpUrl?.message !== url) {
      problems.push(
        `the message "helpUrl" of the language ${code} is "${messages.helpUrl?.message}"; the website has no help in this language, so it leads to the English one, ${url}`,
      );
    }
    continue;
  }
  let text;
  try {
    text = readable(read(page));
  } catch {
    problems.push(
      `${page} is missing; it explains the messages of the extension in this language`,
    );
    continue;
  }
  for (const key of explained) {
    const message = messages[key]?.message;
    if (message !== undefined && !pattern(message).test(text)) {
      problems.push(
        `${page} doesn't quote the message "${key}" of the language ${code}, "${message}"; add an entry that quotes it word for word, with what it means and what to do`,
      );
    }
  }
  if (site !== undefined && messages.helpUrl?.message !== url) {
    problems.push(
      `the message "helpUrl" of the language ${code} is "${messages.helpUrl?.message}"; it leads to the help, ${url}`,
    );
  }
}

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(problem);
  }
  process.exit(1);
}
const pages = languages.filter(({ page }) => page !== null);
console.log(
  `The help quotes the ${explained.length} messages that need it, in ${pages.map(({ code }) => code).join(" and ")}, and Help in each of the ${languages.length} languages of the extension leads to it.`,
);
