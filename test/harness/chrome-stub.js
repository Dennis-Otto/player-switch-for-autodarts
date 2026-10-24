// A stand-in for the chrome API of the extension, so that the real popup.html and
// switcher.html run outside of Chrome, with players.js and the code of lib/ as they
// ship: for the pictures of scripts/screenshots.sh, and for any test that wants the
// popup in a plain browser. A driver loads it before the scripts of every page, as
// Playwright's add_init_script() does, and opens the page with its setup in the
// address:
//
//   popup.html?lang=de&accounts=2
//
// lang      the language of the texts, from extension/_locales: en (the default) or de
// accounts  how many of the demo accounts are saved, 1 to 4 (3); the first one plays
//
// The accounts are made up and their pictures generated: no real people. The answers
// are those of the service worker, background.js, for the requests that players.js
// sends. `window.harness` lets a driver catch the moment between a tap and the answer:
// harness.hold() keeps the next request waiting until harness.release(),
// harness.drawn() resolves once the page has drawn what changed, and harness.idle()
// once no request waits either. harness.refuse(reply) answers the next request with
// `reply` and the view as it is, as the worker refuses one, such as
// { ok: false, reason: "unreachable" }, and test/harness/a11y.mjs shows its error so.

(() => {
  const setup = new URLSearchParams(location.search);
  // The languages of extension/_locales; any other one shows English, as in Chrome.
  const LANGUAGES = ["en", "de"];
  const asked = setup.get("lang");
  const language = LANGUAGES.includes(asked) ? asked : "en";
  const count = Math.min(
    4,
    Math.max(1, Number(setup.get("accounts") ?? 3) || 3),
  );
  const MINUTE = 60_000;

  // Made-up people. The pictures are drawn below; Lena has none, so her tile shows the
  // initial, as for an account without a picture at Autodarts.
  const PEOPLE = [
    {
      name: "Mia Keller",
      username: "miakeller",
      colors: ["#4f66f6", "#8b5cf6", "#22d3ee"],
    },
    {
      name: "Jonas Berg",
      username: "jonasberg",
      colors: ["#f43f5e", "#f59e0b", "#fb7185"],
    },
    { name: "Lena Vogt", username: "lenavogt", colors: null },
    {
      name: "Sam Ortiz",
      username: "samortiz",
      colors: ["#10b981", "#0ea5e9", "#a3e635"],
    },
  ];
  // How long ago the renewal in the background ran for each parked account, and which
  // accounts remember their password.
  const RENEWED = [null, 2 * 60 * MINUTE, 25 * MINUTE, 5 * 60 * MINUTE];
  const REMEMBERS = [false, true, false, false];

  /** A generated picture: soft shapes in three colours, the same for every run. */
  function picture(colors) {
    if (colors === null) {
      return null;
    }
    const [base, one, two] = colors;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
      <defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="7"/></filter></defs>
      <rect width="80" height="80" fill="${base}"/>
      <g filter="url(#b)">
        <circle cx="62" cy="18" r="26" fill="${one}"/>
        <circle cx="16" cy="66" r="22" fill="${two}"/>
      </g>
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  const accounts = PEOPLE.slice(0, count).map((person, index) => ({
    id: `demo-${person.username}`,
    name: person.name,
    username: person.username,
    picture: picture(person.colors),
    needsSignIn: false,
    remembersPassword: REMEMBERS[index],
    renewedAgo: RENEWED[index],
  }));
  let activeId = accounts[0].id;
  // True after "Add account", until the next sign-in or "Cancel".
  let adding = false;

  /** The view of background.js: the active account renews in the page, not here. */
  function view() {
    const now = Date.now();
    return {
      profiles: accounts.map(({ renewedAgo, ...account }) => ({
        ...account,
        active: account.id === activeId,
        renewedAt:
          account.id === activeId || renewedAgo === null
            ? null
            : now - renewedAgo,
        // Every made-up account renews fine.
        renewalFailingSince: null,
      })),
      unsaved: false,
      adding,
      updateHint: false,
    };
  }

  /** What the service worker does for each request of players.js. */
  function answer({ action, id, username }) {
    const account = accounts.find((candidate) => candidate.id === id);
    switch (action) {
      case "switch":
        activeId = account.id;
        account.renewedAgo = null;
        break;
      case "remember":
        account.remembersPassword = username !== "";
        break;
      case "forgetPassword":
        account.remembersPassword = false;
        break;
      case "removeAccount":
        accounts.splice(accounts.indexOf(account), 1);
        break;
      case "signout":
        adding = true;
        break;
      case "stopAdding":
        adding = false;
        break;
      default:
        // "view", "adopt" and "close" change nothing here.
        break;
    }
    return { ok: true, view: view() };
  }

  /** A JSON file of the extension, read at once, as Chrome hands out its own. */
  function extensionFile(path) {
    const request = new XMLHttpRequest();
    request.open("GET", chrome.runtime.getURL(path), false);
    request.send();
    return request.status === 200 ? JSON.parse(request.responseText) : {};
  }

  // The texts of the extension, read once from its _locales, as Chrome does.
  let messages = null;
  function catalog() {
    messages ??= extensionFile(`_locales/${language}/messages.json`);
    return messages;
  }

  /** chrome.i18n.getMessage: $NAME$ is the placeholder, its content $1 the value. */
  function getMessage(key, substitutions) {
    const entry = catalog()[key];
    if (entry === undefined) {
      return "";
    }
    const values =
      substitutions === undefined ? [] : [substitutions].flat().map(String);
    const placeholders = new Map(
      Object.entries(entry.placeholders ?? {}).map(([name, { content }]) => [
        name.toLowerCase(),
        content,
      ]),
    );
    const fill = (content) =>
      content.replace(/\$([1-9])/g, (_, index) => values[index - 1] ?? "");
    return entry.message
      .replace(/\$([\w@]+)\$/g, (whole, name) => {
        const content = placeholders.get(name.toLowerCase());
        return content === undefined ? whole : fill(content);
      })
      .replaceAll("$$", "$");
  }

  let gate = null;
  let pending = 0;
  let refusal = null;

  async function sendMessage(message) {
    pending += 1;
    try {
      if (gate !== null && message.action !== "view") {
        await gate.promise;
      }
      if (refusal !== null && message.action !== "view") {
        const reply = refusal;
        refusal = null;
        return { ...reply, view: view() };
      }
      return answer(message);
    } finally {
      pending -= 1;
    }
  }

  const frame = () =>
    new Promise((resolve) => requestAnimationFrame(() => resolve()));

  window.harness = {
    hold() {
      gate = Promise.withResolvers();
    },
    release() {
      gate?.resolve();
      gate = null;
    },
    refuse(reply) {
      refusal = reply;
    },
    /** Resolves once no request waits and the page has drawn the last answer. */
    async idle() {
      do {
        await frame();
      } while (pending > 0);
      await this.drawn();
    },
    /** Resolves once the page has drawn what changed and its transitions have ended. */
    async drawn() {
      await frame();
      await Promise.all(
        // An animation that loops forever never finishes; it doesn't wait for it.
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation.effect?.getComputedTiming().iterations !== Infinity,
          )
          .map((animation) => animation.finished),
      );
      await frame();
    },
  };

  const noListeners = { addListener() {}, removeListener() {} };
  globalThis.chrome = {
    i18n: { getMessage, getUILanguage: () => language },
    runtime: {
      sendMessage,
      openOptionsPage: async () => {},
      getURL: (path) =>
        new URL(path, new URL("/extension/", location.href)).href,
      getManifest: () => extensionFile("manifest.json"),
      onMessage: noListeners,
    },
    storage: {
      local: { get: async () => ({}), set: async () => {} },
      onChanged: noListeners,
    },
  };
})();
