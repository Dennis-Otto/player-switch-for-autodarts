// @ts-check
// A stand-in for the chrome API of the extension, so that the real popup.html and
// switcher.html run outside of Chrome, with the code of lib/ as they
// ship: for the pictures of scripts/screenshots.sh, and for any test that wants the
// popup in a plain browser. A driver loads it before the scripts of every page, as
// Playwright's add_init_script() does, and opens the page with its setup in the
// address:
//
//   popup.html?lang=de&accounts=2
//
// lang      the language of the texts, from extension/_locales: en (the default), de,
//           nl, fr or es
// accounts  how many of the demo accounts are saved, 1 to 4 (3); the first one plays
// pins      1 gives the second account a PIN, as the venue mode does (none)
// manager   1 sets a manager PIN, which "Manage accounts" then asks for (none)
// lobby     1 shows a lobby on the Autodarts page, which the parked players join (none)
// long      1 gives the last account a long name and a long user name (none)
// trouble   1 has the second account sign in again and the renewal of the third one
//           fail, as the worker reports them (none)
//
// The accounts are made up and their pictures generated: no real people. The answers
// are those of the service worker, worker.ts, for the requests that pages/players.ts
// sends, and for those of the venue mode that pages/options.ts sends. `window.harness` lets a driver catch the moment between a tap and the answer:
// harness.hold() keeps the next request waiting until harness.release(),
// harness.drawn() resolves once the page has drawn what changed, and harness.idle()
// once no request waits either. harness.refuse(reply) answers the next request with
// `reply` and the view as it is, as the worker refuses one, such as
// { ok: false, reason: "unreachable" }, and test/harness/a11y.mjs shows its error so.
//
// The requests and the replies have the types of src/messages.ts, which the worker
// and the pages share, and npm run typecheck checks this file against them
// (test/harness/tsconfig.json): a new kind of request without an answer here, or a
// reply without a field that the pages read, fails the type check.

/**
 * @typedef {import("../../src/messages.ts").WorkerRequest} WorkerRequest
 * @typedef {import("../../src/messages.ts").PlayersRequest} PlayersRequest
 * @typedef {import("../../src/messages.ts").PlayersReply} PlayersReply
 * @typedef {import("../../src/messages.ts").PlayersView} PlayersView
 * @typedef {import("../../src/messages.ts").PlayerView} PlayerView
 * @typedef {import("../../src/messages.ts").VenueRequest} VenueRequest
 * @typedef {import("../../src/messages.ts").VenueReply} VenueReply
 * @typedef {import("../../src/messages.ts").Outcome} Outcome
 */
/**
 * A made-up account as the stub keeps it: how long ago its renewal ran and since when
 * it fails, which view() turns into the times of the worker.
 * @typedef {Omit<PlayerView, "active" | "renewedAt" | "renewalFailingSince"> & {
 *   renewedAgo: number | null;
 *   failingAgo: number | null;
 * }} DemoAccount
 */
/** @typedef {{ message: string; placeholders?: Record<string, { content: string }> }} Entry */

(() => {
  const setup = new URLSearchParams(location.search);
  // The languages of extension/_locales; any other one shows English, as in Chrome.
  const LANGUAGES = ["en", "de", "nl", "fr", "es"];
  const asked = setup.get("lang") ?? "en";
  const language = LANGUAGES.includes(asked) ? asked : "en";
  // Up to four made-up people with pictures, and up to twelve for a club, where a field
  // finds a player among the tiles.
  const count = Math.min(
    12,
    Math.max(1, Number(setup.get("accounts") ?? 3) || 3),
  );
  const MINUTE = 60_000;
  // Whether the second account asks for a PIN, as in the venue mode.
  const pinned = setup.get("pins") === "1";
  const guarded = setup.get("manager") === "1";
  // Whether the Autodarts page shows a lobby, and who joined it from here.
  const lobby = setup.get("lobby") === "1";
  /** @type {string[]} */
  const seated = [];
  // Whether the last account has a name too long for one line of its tile.
  const long = setup.get("long") === "1";
  // Whether an account has lost its session and the renewal of another one fails.
  const trouble = setup.get("trouble") === "1";
  // The version that the pages show as the one that runs: a fixed one, so that a
  // release, which writes its own version into the manifest, changes no picture.
  const VERSION = "1.6.0";

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
    // The regulars of a club, without pictures, after the four of a household.
    { name: "Noah Fischer", username: "noahf", colors: null },
    { name: "Emma Schulz", username: "emma180", colors: null },
    { name: "Paul Wagner", username: "pwagner", colors: null },
    { name: "Hanna Becker", username: "hannab", colors: null },
    { name: "Luca Hoffmann", username: "lucah", colors: null },
    { name: "Lea Schäfer", username: "leaschaefer", colors: null },
    { name: "Ben Koch", username: "benkoch", colors: null },
    { name: "Zoë Richter", username: "zoerichter", colors: null },
  ];
  // How long ago the renewal in the background ran for each parked account, and which
  // accounts remember their password.
  const RENEWED = [null, 2 * 60 * MINUTE, 25 * MINUTE, 5 * 60 * MINUTE];
  const REMEMBERS = [false, true, false, false];

  /**
   * A generated picture: soft shapes in three colours, the same for every run.
   * @param {readonly string[] | null} colors
   * @returns {string | null}
   */
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

  /** @type {DemoAccount[]} */
  const accounts = PEOPLE.slice(0, count).map((person, index) => ({
    id: `demo-${person.username}`,
    name: person.name,
    username: person.username,
    picture: picture(person.colors),
    needsSignIn: trouble && index === 1,
    remembersPassword: REMEMBERS[index] === true,
    renewedAgo: RENEWED[index] ?? null,
    failingAgo: trouble && index === 2 ? 3 * 60 * MINUTE : null,
    pin: pinned && index === 1,
    lastPlayedAt: null,
  }));
  const last = accounts.at(-1);
  if (long && count > 1 && last !== undefined) {
    // Made up as well; its id stays, so that a driver finds the tile as without it.
    Object.assign(last, {
      name: "Maximiliane Alexandra von Hohenstein-Lichtenberg",
      username: "maximiliane.vonhohensteinlichtenberg@example.com",
    });
  }
  /** @type {string | null} */
  let activeId = accounts[0]?.id ?? null;
  // True after "Add account", until the next sign-in or "Cancel".
  let adding = false;

  /**
   * The view of worker.ts: the active account renews in the page, not here.
   * @returns {PlayersView}
   */
  function view() {
    const now = Date.now();
    const active = accounts.find((account) => account.id === activeId);
    return {
      profiles: accounts.map(({ renewedAgo, failingAgo, ...account }) => ({
        ...account,
        active: account.id === activeId,
        renewedAt:
          account.id === activeId || renewedAgo === null
            ? null
            : now - renewedAgo,
        // Every made-up account renews fine, unless `trouble` says otherwise.
        renewalFailingSince:
          account.id === activeId || failingAgo === null
            ? null
            : now - failingAgo,
      })),
      unsaved: false,
      adding,
      // The player who plays protects an account without a PIN, and removes one with a
      // PIN, as in worker.ts; the made-up accounts are all guests, none the house account.
      venue: {
        manager: guarded,
        protectable:
          guarded && active !== undefined && !active.pin ? activeId : null,
        removable: guarded && active?.pin ? activeId : null,
      },
      updateHint: false,
      lobby: lobby ? { seated: [...seated] } : null,
    };
  }

  /**
   * The made-up account of an id that a page sends, which it took from the view.
   * @param {string} id
   * @returns {DemoAccount}
   */
  function demo(id) {
    const account = accounts.find((candidate) => candidate.id === id);
    if (account === undefined) {
      throw new Error(`The stand-in for Chrome has no account ${id}.`);
    }
    return account;
  }

  /**
   * The end of a switch over every kind of request: the type check fails here once
   * src/messages.ts has a request that the stub doesn't answer yet.
   * @param {never} request
   * @returns {never}
   */
  function unknownRequest(request) {
    throw new Error(
      `The stand-in for Chrome doesn't answer ${JSON.stringify(request)}: answer it as worker.ts does.`,
    );
  }

  /**
   * What the service worker does for each request of pages/players.ts.
   * @param {PlayersRequest} request
   * @returns {PlayersReply}
   */
  function answer(request) {
    switch (request.action) {
      case "switch": {
        const account = demo(request.id);
        activeId = account.id;
        account.renewedAgo = null;
        break;
      }
      case "join": {
        // Autodarts seats the player in the lobby, or keeps the seat of one who sits
        // there already, as at "Join again"; the page stays as it is.
        const account = demo(request.id);
        if (seated.includes(account.id)) {
          return { ok: true, joined: account.name, kept: true, view: view() };
        }
        seated.push(account.id);
        return { ok: true, joined: account.name, view: view() };
      }
      case "remember":
        demo(request.id).remembersPassword = request.username !== "";
        break;
      case "forgetPassword":
        demo(request.id).remembersPassword = false;
        break;
      case "protect":
        demo(request.id).pin = true;
        break;
      case "removeAccount":
        accounts.splice(accounts.indexOf(demo(request.id)), 1);
        // Autodarts ended the session of the account as well.
        return { ok: true, ended: true, view: view() };
      case "forgetAll":
        accounts.splice(0);
        activeId = null;
        return { ok: true, ended: true, view: view() };
      case "signout":
        adding = true;
        break;
      case "stopAdding":
        adding = false;
        break;
      case "diagnostics":
        // What worker.ts answers, for made-up accounts that stand as their tiles show.
        return {
          ok: true,
          diagnostics: {
            format: 2,
            accounts: accounts.map((account) => ({
              playing: account.id === activeId,
              needsSignIn: account.needsSignIn,
              remembersPassword: account.remembersPassword,
              renewalFailingSince: null,
            })),
            renewal: {
              lastRefreshAt: null,
              lastAttemptAt: null,
              suspectedChange: false,
              requestRefused: false,
            },
            venue: {
              managerPin: guarded,
              playerPins: accounts.filter((account) => account.pin).length,
              idleMinutes: null,
              houseAccount: false,
            },
            settings: {
              showButton: true,
              corner: "bottom-right",
              order: "name",
            },
            events: [],
          },
          view: view(),
        };
      case "view":
      case "adopt":
      case "openPage":
      case "unlock":
        // These change nothing here: the page saves no new account, opens no tab, and
        // "Manage accounts" opens, as the worker does without a manager PIN.
        break;
      default:
        return unknownRequest(request);
    }
    return { ok: true, view: view() };
  }

  /**
   * A JSON file of the extension, read at once, as Chrome hands out its own.
   * @param {string} path
   * @returns {Record<string, unknown>}
   */
  function extensionFile(path) {
    const request = new XMLHttpRequest();
    request.open("GET", chrome.runtime.getURL(path), false);
    request.send();
    return request.status === 200 ? JSON.parse(request.responseText) : {};
  }

  // The texts of the extension, read once from its _locales, as Chrome does.
  /** @type {Record<string, Entry> | null} */
  let messages = null;
  function catalog() {
    messages ??= /** @type {Record<string, Entry>} */ (
      extensionFile(`_locales/${language}/messages.json`)
    );
    return messages;
  }

  /**
   * chrome.i18n.getMessage: $NAME$ is the placeholder, its content $1 the value.
   * @param {string} key
   * @param {string | string[]} [substitutions]
   */
  function getMessage(key, substitutions) {
    const entry = catalog()[key];
    if (entry === undefined) {
      return "";
    }
    const values =
      substitutions === undefined ? [] : [substitutions].flat().map(String);
    const placeholders = new Map(
      Object.entries(entry.placeholders ?? {}).map(
        ([name, { content }]) =>
          /** @type {const} */ ([name.toLowerCase(), content]),
      ),
    );
    /** @param {string} content */
    const fill = (content) =>
      content.replace(/\$([1-9])/g, (_, index) => values[index - 1] ?? "");
    return entry.message
      .replace(/\$([\w@]+)\$/g, (whole, name) => {
        const content = placeholders.get(name.toLowerCase());
        return content === undefined ? whole : fill(content);
      })
      .replaceAll("$$", "$");
  }

  /** @type {PromiseWithResolvers<void> | null} */
  let gate = null;
  let pending = 0;
  /** @type {Exclude<Outcome, { ok: true }> | null} */
  let refusal = null;

  // The venue mode as the options page sees it: which PINs are set, never a hash.
  /** @type {{ manager: boolean; idleMinutes: number | null; house: string | null }} */
  const venue = { manager: guarded, idleMinutes: null, house: null };

  /**
   * What the service worker answers to a request of the venue mode from pages/options.ts.
   * @param {VenueRequest} request
   * @returns {VenueReply}
   */
  function answerVenue(request) {
    switch (request.action) {
      case "managerPin":
        venue.manager = request.pin !== null;
        break;
      case "playerPin":
        demo(request.id).pin = request.pin !== null;
        break;
      case "idle":
        venue.idleMinutes = request.minutes;
        venue.house = request.house;
        break;
      case "status":
      case "unlock":
        // The page reads the status; without a manager PIN, it opens at once.
        break;
      default:
        return unknownRequest(request);
    }
    return {
      ok: true,
      status: {
        ...venue,
        accounts: accounts.map(({ id: key, name, username, pin: set }) => ({
          id: key,
          name,
          username,
          pin: set,
        })),
      },
    };
  }

  /**
   * A request of pages/players.ts, which harness.hold() keeps waiting and
   * harness.refuse() answers, unless it only asks for the view.
   * @param {PlayersRequest} request
   * @returns {Promise<PlayersReply>}
   */
  async function answerPlayers(request) {
    if (request.action !== "view") {
      if (gate !== null) {
        await gate.promise;
      }
      if (refusal !== null) {
        const reply = refusal;
        refusal = null;
        return { ...reply, view: view() };
      }
    }
    return answer(request);
  }

  /**
   * chrome.runtime.sendMessage: the reply of the service worker to a request of a page.
   * @param {WorkerRequest} message
   * @returns {Promise<PlayersReply | VenueReply | undefined>}
   */
  async function sendMessage(message) {
    pending += 1;
    try {
      switch (message.type) {
        case "popup":
          return await answerPlayers(message);
        case "venue":
          return answerVenue(message);
        // The worker answers neither the switcher, which asks to close, nor an input
        // that the content script saw; only the content script asks for its button,
        // and no page of the stage is one.
        case "switcher":
        case "activity":
        case "button":
          return undefined;
        default:
          return unknownRequest(message);
      }
    } finally {
      pending -= 1;
    }
  }

  /** @returns {Promise<void>} */
  const frame = () =>
    new Promise((resolve) => requestAnimationFrame(() => resolve()));

  const harness = {
    hold() {
      gate = Promise.withResolvers();
    },
    release() {
      gate?.resolve();
      gate = null;
    },
    /** @param {Exclude<Outcome, { ok: true }>} reply */
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
  Object.assign(window, { harness });

  const noListeners = { addListener() {}, removeListener() {} };
  const chrome = {
    i18n: { getMessage, getUILanguage: () => language },
    runtime: {
      sendMessage,
      openOptionsPage: async () => {},
      /** @param {string} path */
      getURL: (path) =>
        new URL(path, new URL("/extension/", location.href)).href,
      getManifest: () => ({
        ...extensionFile("manifest.json"),
        version: VERSION,
      }),
      onMessage: noListeners,
    },
    storage: {
      local: { get: async () => ({}), set: async () => {} },
      onChanged: noListeners,
    },
    // The shortcuts of the manifest, as the options page lists them.
    commands: {
      getAll: async () => [
        { name: "_execute_action", shortcut: "Alt+Shift+P" },
        { name: "toggle-switcher", shortcut: "Alt+Shift+O" },
      ],
    },
    tabs: { create: async () => {} },
  };
  Object.assign(globalThis, { chrome });
})();
