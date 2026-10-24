// Builds the stage of a picture from the address of stage.html, and gives the driver,
// test/harness/capture.py, `window.stage` to wait for it and to play a switch:
//
//   layout=frame   the popup alone (view=manage opens "Manage accounts")
//   layout=board   the switcher over a match on a board display
//   layout=store   a 1280×800 picture of the store listing, slide=1, 2 or 3
//   layout=promo   the small promo tile of the store
//   layout=marquee the large promo tile of the store
//   lang=en|de     the language of the extension and of the text around it
//
// The pages of the extension in the frames are the real ones; chrome-stub.js stands
// in for Chrome in each of them.

const setup = new URLSearchParams(location.search);
const layout = setup.get("layout") ?? "frame";
const lang = setup.get("lang") === "de" ? "de" : "en";
const shot = document.querySelector("#shot");
document.documentElement.lang = lang;

const ICON = "/extension/icons/icon-128.png";

// The texts around the extension. The extension's own texts come from its _locales.
const TEXTS = {
  en: {
    note: "Not affiliated with Autodarts.",
    tagline: "One tap to switch players",
    marquee:
      "One shared display, everyone on their own account, one tap to switch.",
    slides: {
      1: {
        eyebrow: "Player Switch for Autodarts",
        title: "One display. Every account. One tap.",
        lead: "Everyone plays under their own Autodarts account, without signing in again and again.",
        points: [
          "Save each account once",
          "Switch with a single tap",
          "Sessions stay ready in the background",
        ],
        numbered: true,
      },
      2: {
        eyebrow: "Optional",
        title: "Keeps itself going.",
        lead: "Parked sessions are renewed in the background. If you like, the extension remembers a password and signs an account back in by itself.",
        points: [
          "Everything stays on your computer",
          "Only Autodarts, no tracking",
          "English and German",
        ],
      },
      3: {
        eyebrow: "On the board display",
        title: "Switch right on the board.",
        lead: "In fullscreen or kiosk mode, a round button on the page opens the players in big tiles for a touch screen.",
        points: [
          "Fullscreen and kiosk mode",
          "Keys 1 to 9 pick a player",
          "Asks before a match ends",
        ],
      },
    },
  },
  de: {
    note: "Nicht mit Autodarts verbunden.",
    tagline: "Spieler wechseln mit einem Tipp",
    marquee:
      "Ein gemeinsames Display, jeder mit seinem eigenen Konto, ein Tipp zum Wechseln.",
    slides: {
      1: {
        eyebrow: "Player Switch for Autodarts",
        title: "Ein Display. Alle Konten. Ein Tipp.",
        lead: "Jeder spielt unter seinem eigenen Autodarts-Konto, ohne sich jedes Mal neu anzumelden.",
        points: [
          "Konten einmal speichern",
          "Mit einem Tipp wechseln",
          "Sitzungen bleiben im Hintergrund bereit",
        ],
        numbered: true,
      },
      2: {
        eyebrow: "Optional",
        title: "Läuft von selbst weiter.",
        lead: "Geparkte Sitzungen werden im Hintergrund erneuert. Auf Wunsch merkt sich die Erweiterung ein Passwort und meldet ein Konto von selbst wieder an.",
        points: [
          "Alles bleibt auf deinem Computer",
          "Nur Autodarts, kein Tracking",
          "Deutsch und Englisch",
        ],
      },
      3: {
        eyebrow: "Am Board-Display",
        title: "Direkt am Board wechseln.",
        lead: "Im Vollbild oder Kiosk-Modus öffnet ein runder Knopf auf der Seite die Spieler in großen Kacheln für den Touchscreen.",
        points: [
          "Vollbild und Kiosk-Modus",
          "Die Tasten 1 bis 9 wählen",
          "Fragt, bevor ein Match endet",
        ],
      },
    },
  },
}[lang];

/** An element with its class and children; a string child becomes text. */
function make(tag, className, ...children) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  element.append(...children);
  return element;
}

const frames = [];

/** A page of the extension in a frame, with the setup of chrome-stub.js. */
function extensionPage(page, accounts) {
  const iframe = document.createElement("iframe");
  iframe.title = page;
  iframe.src = `/extension/${page}.html?lang=${lang}&accounts=${accounts}`;
  const loaded = new Promise((resolve) =>
    iframe.addEventListener("load", resolve, { once: true }),
  );
  frames.push({ iframe, loaded });
  return iframe;
}

/** The popup in its window, as large as its page, as Chrome sizes a popup. */
function popup(accounts) {
  const iframe = extensionPage("popup", accounts);
  iframe.addEventListener("load", () => {
    const body = iframe.contentDocument.body;
    const fit = () => {
      const box = body.getBoundingClientRect();
      iframe.style.width = `${Math.ceil(box.width)}px`;
      iframe.style.height = `${Math.ceil(box.height)}px`;
    };
    new ResizeObserver(fit).observe(body);
    fit();
  });
  return make("div", "window", iframe);
}

/** The switcher over a made-up match, with that many accounts. */
function board(accounts) {
  const player = (name, score, up) =>
    make(
      "div",
      up ? "player up" : "player",
      make("span", "name", name),
      make("span", "score", score),
    );
  const match = make(
    "div",
    "match",
    make(
      "div",
      "players",
      player("Mia Keller", "141", true),
      player("Jonas Berg", "203", false),
    ),
    make(
      "div",
      "darts",
      ...["T20", "T19", "D12"].map((dart) => make("span", "", dart)),
    ),
  );
  match.setAttribute("aria-hidden", "true");
  return make("div", "board", match, extensionPage("switcher", accounts));
}

function copy(slide) {
  const list = make(
    "ul",
    "points",
    ...slide.points.map((point, index) =>
      make(
        "li",
        "",
        make("span", "mark", slide.numbered ? String(index + 1) : "✓"),
        point,
      ),
    ),
  );
  return make(
    "div",
    "copy",
    make("p", "eyebrow", slide.eyebrow),
    make("h1", "", slide.title),
    make("p", "lead", slide.lead),
    list,
  );
}

function icon() {
  const image = document.createElement("img");
  image.src = ICON;
  image.alt = "";
  return image;
}

// What to do once the frames are there, such as opening "Manage accounts".
let prepare = async () => {};

function openManage() {
  prepare = async () => {
    stage.click("#manage");
    await stage.settled();
  };
}

switch (layout) {
  case "board":
    shot.append(board(4));
    break;
  case "store": {
    const number = ["1", "2", "3"].includes(setup.get("slide"))
      ? setup.get("slide")
      : "1";
    const visual = {
      1: () => popup(3),
      2: () => {
        openManage();
        return popup(2);
      },
      // Three players fill one row of the smaller display.
      3: () => make("div", "screen", board(3)),
    }[number]();
    shot.className = number === "3" ? "store wide" : "store";
    shot.append(
      copy(TEXTS.slides[number]),
      visual,
      make("p", "note", TEXTS.note),
    );
    break;
  }
  case "promo":
    shot.className = "promo";
    shot.append(
      icon(),
      make(
        "div",
        "",
        make(
          "p",
          "name",
          "Player Switch",
          make("span", "for", "for Autodarts"),
        ),
        make("p", "tagline", TEXTS.tagline),
      ),
    );
    break;
  case "marquee":
    shot.className = "marquee";
    shot.append(
      make(
        "div",
        "copy",
        make(
          "div",
          "brand",
          icon(),
          make("span", "", "Player Switch for Autodarts"),
        ),
        make("h1", "", TEXTS.slides[1].title),
        make("p", "lead", TEXTS.marquee),
      ),
      popup(2),
      make("p", "note", TEXTS.note),
    );
    break;
  default:
    shot.className = "frame";
    shot.append(popup(3));
    if (setup.get("view") === "manage") {
      openManage();
    }
}

const nextFrame = () =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));
const pages = () => frames.map(({ iframe }) => iframe.contentWindow);
let touch = null;

const stage = {
  /** Resolves once every frame is loaded, has drawn its players and stands still. */
  ready: (async () => {
    await Promise.all(frames.map(({ loaded }) => loaded));
    await Promise.all(
      [...document.images].map((image) => image.decode().catch(() => {})),
    );
    await stage.settled();
    // A switcher gives its first player the focus, for the keyboard; a picture shows
    // it as a touch screen sees it.
    for (const page of pages()) {
      page.document.activeElement?.blur();
    }
    await prepare();
    await stage.settled();
  })(),

  /** Waits until no request is open and nothing moves, in the frames and here. */
  async settled() {
    await Promise.all(pages().map((page) => page.harness.idle()));
    await nextFrame();
    await Promise.all(
      document.getAnimations().map((animation) => animation.finished),
    );
    await nextFrame();
  },

  /** Waits until the frames and the stage have drawn what changed, also while a
   * request waits. */
  async drawn() {
    await Promise.all(pages().map((page) => page.harness.drawn()));
    await nextFrame();
  },

  /** Taps an element of the popup, the way players.js receives a tap. */
  click(selector, index = 0) {
    pages()[0].document.querySelectorAll(selector)[index].click();
  },

  /** Shows a finger on the element, a dot first and then, with fading, a ring. */
  touch(selector, index = 0, fading = false) {
    const [first] = frames;
    const target =
      first.iframe.contentDocument.querySelectorAll(selector)[index];
    const inner = target.getBoundingClientRect();
    const outer = first.iframe.getBoundingClientRect();
    if (touch === null) {
      touch = make("div", "touch");
      touch.style.left = `${outer.left + inner.left + inner.width * 0.62 + scrollX}px`;
      touch.style.top = `${outer.top + inner.top + inner.height * 0.5 + scrollY}px`;
      document.body.append(touch);
    }
    touch.classList.toggle("fading", fading);
  },

  untouch() {
    touch?.remove();
    touch = null;
  },

  /** Keeps the next request of the popup waiting, for the moment of "Switching to …". */
  hold() {
    pages()[0].harness.hold();
  },

  release() {
    pages()[0].harness.release();
  },
};

window.stage = stage;
