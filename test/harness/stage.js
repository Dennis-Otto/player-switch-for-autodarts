// Builds the stage of a picture from the address of stage.html, and gives the driver,
// test/harness/capture.py, `window.stage` to wait for it and to play a switch:
//
//   layout=frame   the popup alone (view=manage opens "Manage accounts")
//   layout=board   the switcher over a match on a board display
//   layout=store   a 1280×800 picture of the store listing, slide=1, 2 or 3
//   layout=promo   the small promo tile of the store
//   layout=marquee the large promo tile of the store
//   lang=en        the language of the extension and of the text around it: a folder of
//                  extension/_locales, with that text in store/pictures.<lang>.json
//
// The pages of the extension in the frames are the real ones; chrome-stub.js stands
// in for Chrome in each of them.

const setup = new URLSearchParams(location.search);
const layout = setup.get("layout") ?? "frame";
const lang = setup.get("lang") ?? "en";
const shot = document.querySelector("#shot");
document.documentElement.lang = lang.replace("_", "-");

const ICON = "/extension/icons/icon-128.png";

// The texts around the extension, read once from the folder of the listing, as
// chrome-stub.js reads the extension's own texts from its _locales.
const TEXTS = (() => {
  const request = new XMLHttpRequest();
  request.open("GET", `/store/pictures.${lang}.json`, false);
  request.send();
  return JSON.parse(request.responseText);
})();

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

function copy(slide, numbered) {
  const list = make(
    "ul",
    "points",
    ...slide.points.map((point, index) =>
      make(
        "li",
        "",
        make("span", "mark", numbered ? String(index + 1) : "✓"),
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
    const slide = Number(setup.get("slide"));
    const number = slide === 2 || slide === 3 ? slide : 1;
    let visual;
    if (number === 1) {
      visual = popup(3);
    } else if (number === 2) {
      openManage();
      visual = popup(2);
    } else {
      // Three players fill one row of the smaller display.
      visual = make("div", "screen", board(3));
    }
    shot.className = ["store", "store tall", "store wide"][number - 1];
    shot.append(
      // The first slide lists the steps of a player, the others what comes with it.
      copy(TEXTS.slides[number], number === 1),
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
      // An animation that loops forever never finishes; it doesn't wait for it.
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.effect?.getComputedTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished),
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
