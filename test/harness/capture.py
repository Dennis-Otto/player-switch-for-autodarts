"""Renders the pictures of the extension from its real pages, for scripts/screenshots.sh.

The browser of the Playwright image opens test/harness/stage.html, which shows the
real popup.html or switcher.html in a frame, with chrome-stub.js in place of Chrome
and made-up accounts. Every file comes from the repository through a route of the
browser, and every other request fails, so that the network can't change a picture.
The size, the scale, the scheme and the data of each picture are fixed, and so are
its pixels. The one picture of a page of the browser itself, chrome://extensions for
the install from a release, comes from the whole Chromium of the image, as the
headless one has no such page.

Usage: python3 capture.py OUT, which writes each picture below OUT at its path in
the repository.
"""

from __future__ import annotations

import io
import mimetypes
import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

import imageio_ffmpeg
from PIL import Image
from playwright.sync_api import Browser, Page, Playwright, Route, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
ORIGIN = "http://harness.test"
STUB = ROOT / "test" / "harness" / "chrome-stub.js"
# The languages of the website, and with it of the pictures of the documentation. The
# pictures of the store come in every language of the extension: store_languages().
DOCUMENTATION_LANGUAGES = ("en", "de")
# Whether the stage, or a page in one of its frames, is larger than the window.
OVERFLOWS = """() => [document, ...[...document.querySelectorAll("iframe")].map(
    (frame) => frame.contentDocument)].some((page) => {
        const root = page.scrollingElement;
        const panel = page.querySelector(".panel");
        return root.scrollHeight > root.clientHeight || root.scrollWidth > root.clientWidth
            || (panel !== null && panel.scrollHeight > panel.clientHeight);
    })"""
# The ring around a control that a picture of the browser points at, in the amber of the
# steps for a person in the diagrams.
MARK = """(control) => {
    control.style.outline = "3px solid #f59e0b";
    control.style.outlineOffset = "4px";
    control.style.borderRadius = "8px";
}"""


@dataclass(frozen=True)
class Shot:
    """A picture: where it goes, the stage that it shows and the window it needs."""

    path: str
    query: str
    width: int
    height: int
    scale: float
    dark: bool = False
    # True: the picture is the stage as large as its content, for the popup alone;
    # False: the whole window, for a picture of an exact size.
    fit: bool = False


def variants(name: str, suffix: str) -> list[tuple[str, str, bool]]:
    """The language, the path and the scheme of each picture of the documentation:
    NAME.png, NAME.dark.png, NAME.de.png and NAME.de.dark.png, as the diagrams."""
    found = []
    for lang in DOCUMENTATION_LANGUAGES:
        for dark in (False, True):
            parts = (
                [name] + ([lang] if lang != "en" else []) + (["dark"] if dark else [])
            )
            found.append((lang, f"docs/images/{'.'.join(parts)}.{suffix}", dark))
    return found


def store_languages() -> list[str]:
    """Every folder of extension/_locales: the store takes pictures for each language of
    its listing, and a new language needs nothing here but the texts on its pictures."""
    found = sorted(
        path.name for path in (ROOT / "extension" / "_locales").iterdir() if path.is_dir()
    )
    for lang in found:
        if not (ROOT / "store" / f"pictures.{lang}.json").is_file():
            raise SystemExit(
                f"The extension speaks {lang}, but store/pictures.{lang}.json is "
                "missing: copy store/pictures.en.json and translate it."
            )
    return found


def locale(query: str) -> str:
    """The language that the browser reports for the language in the address of a stage,
    as Chrome reports it: en-US, de or pt-BR."""
    lang = parse_qs(query)["lang"][0]
    return "en-US" if lang == "en" else lang.replace("_", "-")


def shots() -> list[Shot]:
    """Every still picture: the documentation's in both schemes, the store's in light and
    in every language of the extension."""
    found = []
    for lang, path, dark in variants("manage", "png"):
        found.append(
            Shot(
                path,
                f"layout=frame&view=manage&lang={lang}",
                480,
                900,
                2,
                dark,
                fit=True,
            )
        )
    for lang, path, dark in variants("switcher", "png"):
        found.append(Shot(path, f"layout=board&lang={lang}", 960, 600, 1.5, dark))
    for lang in store_languages():
        for slide in (1, 2, 3):
            # 1280x800, the size that the Chrome Web Store asks for.
            found.append(
                Shot(
                    f"store/images/screenshot-{slide}.{lang}.png",
                    f"layout=store&slide={slide}&lang={lang}",
                    800,
                    500,
                    1.6,
                )
            )
        # 440x280 and 1400x560, the small and the large promo tile.
        found.append(
            Shot(
                f"store/images/promo-small.{lang}.png",
                f"layout=promo&lang={lang}",
                220,
                140,
                2,
            )
        )
        found.append(
            Shot(
                f"store/images/marquee.{lang}.png",
                f"layout=marquee&lang={lang}",
                1120,
                448,
                1.25,
            )
        )
    return found


def serve(route: Route) -> None:
    """Answers a request of the browser with a file of the repository, and nothing else."""
    url = urlsplit(route.request.url)
    target = (ROOT / unquote(url.path).lstrip("/")).resolve()
    if (
        f"{url.scheme}://{url.netloc}" != ORIGIN
        or not target.is_relative_to(ROOT)
        or not target.is_file()
    ):
        route.abort()
        return
    kind = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
    route.fulfill(
        status=200,
        body=target.read_bytes(),
        headers={"Content-Type": kind, "Cache-Control": "no-store"},
    )


def open_stage(
    browser: Browser, query: str, width: int, height: int, scale: float, dark: bool
) -> Page:
    """A fresh page of the stage, once it stands still."""
    context = browser.new_context(
        viewport={"width": width, "height": height},
        device_scale_factor=scale,
        color_scheme="dark" if dark else "light",
        locale=locale(query),
        timezone_id="Europe/Berlin",
        reduced_motion="reduce",
    )
    context.route("**/*", serve)
    context.add_init_script(path=str(STUB))
    page = context.new_page()
    page.goto(f"{ORIGIN}/test/harness/stage.html?{query}")
    page.evaluate("stage.ready")
    return page


def picture(page: Page, fit: bool) -> Image.Image:
    """The stage as it stands, or its window, which must hold all of the stage: a
    picture of an exact size, such as one of the store, never cuts anything off."""
    if not fit and page.evaluate(OVERFLOWS):
        size = page.viewport_size or {}
        raise SystemExit(
            f"{page.url} needs more than {size.get('width')}x{size.get('height')}: "
            "shorten its text in store/pictures.<lang>.json, or give the picture more "
            "room in shots() or test/harness/stage.css."
        )
    options = {"animations": "disabled", "caret": "hide", "scale": "device"}
    data = (
        page.locator("#shot").screenshot(**options)
        if fit
        else page.screenshot(**options)
    )
    return Image.open(io.BytesIO(data)).convert("RGB")


def save(image: Image.Image, out: Path, path: str) -> None:
    target = out / path
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, "PNG", optimize=True)
    print(f"{path}: {image.width}x{image.height}", file=sys.stderr)


def switch(page: Page) -> list[tuple[Image.Image, int]]:
    """A tap on the second player and the switch to them, frame by frame, each frame
    with the milliseconds it shows. The popup grows when it says "Switching to …", so
    every frame is the stage as high as the highest one."""
    taken: list[tuple[Image.Image, float, float, int]] = []
    scale = page.evaluate("devicePixelRatio")

    def frame(milliseconds: int) -> None:
        page.evaluate("stage.drawn()")
        box = page.locator("#shot").bounding_box()
        assert box is not None
        whole = page.screenshot(animations="disabled", caret="hide", scale="device")
        taken.append(
            (
                Image.open(io.BytesIO(whole)).convert("RGB"),
                box["width"],
                box["height"],
                milliseconds,
            )
        )

    frame(1600)
    page.evaluate("stage.touch('.tile', 1)")
    frame(220)
    page.evaluate("stage.touch('.tile', 1, true)")
    frame(140)
    # The answer of the service worker waits, so that "Switching to …" shows.
    page.evaluate("stage.untouch(); stage.hold(); stage.click('.tile', 1)")
    frame(1200)
    page.evaluate("stage.release()")
    page.evaluate("stage.settled()")
    frame(2800)
    width = round(max(shot[1] for shot in taken) * scale)
    height = round(max(shot[2] for shot in taken) * scale)
    return [
        (image.crop((0, 0, width, height)), milliseconds)
        for image, _, _, milliseconds in taken
    ]


def animation(frames: list[tuple[Image.Image, int]], out: Path, path: str) -> None:
    """Writes the frames as a GIF that loops, with the same 256 colours in every frame,
    so that nothing flickers from one frame to the next."""
    canvases = [image for image, _ in frames]
    width, height = canvases[0].size
    sheet = Image.new("RGB", (width, height * len(canvases)))
    for index, canvas in enumerate(canvases):
        sheet.paste(canvas, (0, height * index))
    palette = sheet.quantize(
        colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE
    )
    indexed = [
        canvas.quantize(palette=palette, dither=Image.Dither.NONE)
        for canvas in canvases
    ]
    target = out / path
    target.parent.mkdir(parents=True, exist_ok=True)
    indexed[0].save(
        target,
        "GIF",
        save_all=True,
        append_images=indexed[1:],
        duration=[milliseconds for _, milliseconds in frames],
        loop=0,
        disposal=1,
    )
    size = target.stat().st_size // 1024
    print(
        f"{path}: {width}x{height}, {len(frames)} frames, {size} KiB", file=sys.stderr
    )
    film(target, canvases[0])


def film(gif: Path, first: Image.Image) -> None:
    """Writes the video and the poster beside the GIF, NAME.mp4 and NAME.webp, which
    the website shows in its place: a video that the reader can pause, that plays only
    while it is in view and stays still for a reader who asks for less motion (WCAG
    2.2.2), and the first frame until it plays. ffmpeg makes the video from the GIF,
    whose colours are exact, as H.264 with its index first, so that it starts while it
    loads, an even width and height, which yuv420p needs, and one thread, so that its
    bytes are the same on every run."""
    video = gif.with_suffix(".mp4")
    subprocess.run(
        [
            imageio_ffmpeg.get_ffmpeg_exe(),
            *("-loglevel", "error", "-y", "-i", str(gif)),
            *("-vf", "crop=trunc(iw/2)*2:trunc(ih/2)*2"),
            *("-c:v", "libx264", "-preset", "veryslow", "-crf", "28"),
            *("-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an"),
            *("-map_metadata", "-1", "-fflags", "+bitexact", "-flags:v", "+bitexact"),
            *("-threads", "1", "-x264-params", "threads=1"),
            str(video),
        ],
        check=True,
    )
    poster = gif.with_suffix(".webp")
    first.save(poster, "WEBP", quality=85, method=6)
    for made in (video, poster):
        size = made.stat().st_size // 1024
        print(f"{made.relative_to(gif.parents[2])}: {size} KiB", file=sys.stderr)


def load_unpacked(playwright: Playwright, out: Path) -> None:
    """The top of chrome://extensions in the language of the page, with Developer mode
    on and what the install from a release asks for marked. Without an extension in
    the picture, a release doesn't change its pixels."""
    for lang, path, dark in variants("load-unpacked", "png"):
        # A profile of its own, as Chromium opens no such page in the private profile
        # of a new context, and a browser for each language, which it reads as it starts.
        with tempfile.TemporaryDirectory() as profile:
            context = playwright.chromium.launch_persistent_context(
                profile,
                executable_path=str(whole_chromium()),
                args=[f"--lang={lang}"] + (["--force-dark-mode"] if dark else []),
                env={**os.environ, "LANGUAGE": lang},
                viewport={"width": 800, "height": 260},
                device_scale_factor=2,
                color_scheme="dark" if dark else "light",
                reduced_motion="reduce",
            )
            page = context.pages[0]
            page.goto("chrome://extensions/")
            page.locator("extensions-toolbar #devMode").click()
            page.locator("extensions-toolbar #loadUnpacked").wait_for(state="visible")
            for control in ("#devMode", "#loadUnpacked"):
                page.locator(f"extensions-toolbar {control}").evaluate(MARK)
            data = page.locator("extensions-toolbar").screenshot(
                animations="disabled", caret="hide", scale="device"
            )
            save(Image.open(io.BytesIO(data)).convert("RGB"), out, path)
            context.close()


def main(out: Path) -> None:
    with sync_playwright() as playwright:
        load_unpacked(playwright, out)
        # The browser of the image, whichever version of Playwright drives it.
        browser = playwright.chromium.launch(executable_path=str(chromium()))
        for shot in shots():
            page = open_stage(
                browser, shot.query, shot.width, shot.height, shot.scale, shot.dark
            )
            save(picture(page, shot.fit), out, shot.path)
            page.context.close()
        for lang, path, dark in variants("switch", "gif"):
            page = open_stage(browser, f"layout=frame&lang={lang}", 480, 900, 2, dark)
            animation(switch(page), out, path)
            page.context.close()
        browser.close()


def whole_chromium() -> Path:
    """The whole Chromium of the Playwright image, whose pages of its own the headless
    one lacks."""
    found = sorted(Path("/ms-playwright").glob("chromium-*/chrome-linux*/chrome"))
    if not found:
        raise SystemExit("The Playwright image has no Chromium in /ms-playwright.")
    return found[-1]


def chromium() -> Path:
    """The headless Chromium of the Playwright image."""
    found = sorted(
        Path("/ms-playwright").glob(
            "chromium_headless_shell-*/chrome-headless-shell-linux*/chrome-headless-shell"
        )
    )
    if not found:
        raise SystemExit(
            "The Playwright image has no headless Chromium in /ms-playwright."
        )
    return found[-1]


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]))
