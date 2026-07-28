"""Product-page capture ingest.

Playwright Chromium at `device_scale_factor=2` across three viewports, straight
into `assets/<product>/captures/<viewport>/<name>@2x.png` on B2.

The Chromium download is ~150 MB and therefore **opt-in**
(`pnpm run setup:capture`). With no browser installed this falls back to a
Pillow-drawn placeholder card and says so in the response, so the whole pipeline
is demoable end to end on a cold clone — a render never fails just because a
capture could not be taken.
"""

import logging
from io import BytesIO

from app.config import settings
from app.repo import upload_bytes
from app.types.keys import capture_key, slugify
from app.types.promo import VIEWPORT_OPTIONS

logger = logging.getLogger(__name__)

CAPTURE_TIMEOUT_MS = 20_000
DEVICE_SCALE_FACTOR = 2
# Bounded settle budget AFTER `load`. The target page's own TanStack queries land
# well after `load`, so a plain `load` + short sleep captured the app mid-skeleton
# — grey blocks where the stat values, chart and table rows belong. Every step is
# best-effort: a timeout means "carry on and shoot it", never "fail the capture".
SKELETON_TIMEOUT_MS = 8_000
# Deliberately shorter than the skeleton wait: it runs SECOND, as a mop-up for
# late images on pages that have no skeletons to watch, and a page that polls
# never reaches idle at all — so this budget is pure overhead there.
NETWORK_IDLE_TIMEOUT_MS = 3_000
SETTLE_MS = 600
# shadcn/ui's `Skeleton` primitive stamps `data-slot="skeleton"` on every loading
# placeholder, so "no skeleton is attached" is a real content-ready signal for
# this app's own UI (the default capture URL) and a harmless no-op elsewhere.
SKELETON_SELECTOR = '[data-slot="skeleton"]'

_ACCENT_RGB = {
    "ink-amber": (24, 22, 20),
    "neon-cyan": (8, 22, 30),
    "mono-slate": (20, 23, 28),
}
_ACCENT_FG = {
    "ink-amber": (245, 176, 66),
    "neon-cyan": (86, 226, 236),
    "mono-slate": (203, 213, 225),
}

PLACEHOLDER_NOTE = (
    "Playwright's Chromium is not installed, so these are Pillow-drawn "
    "placeholder cards. Run `pnpm run setup:capture` (~150 MB) and re-ingest to "
    "capture the real product UI."
)


class BrowserUnavailableError(RuntimeError):
    """Playwright itself (or its Chromium download) is missing."""


class CaptureFailedError(RuntimeError):
    """The browser launched but the page could not be loaded or screenshotted."""


def _unreachable_note(url: str, reason: str) -> str:
    """Note for a capture that failed at the PAGE, not at the browser.

    Blaming a missing Chromium for an unreachable URL sent people to run
    `setup:capture` for a problem that install can never fix, so the two causes
    are reported separately.
    """
    first_line = (reason or "").strip().splitlines()[0][:160] if reason else ""
    return (
        f"Chromium is installed but could not capture {url}"
        f"{f' ({first_line})' if first_line else ''}, so these are Pillow-drawn "
        "placeholder cards. Check that the URL is reachable from this machine "
        "and re-ingest."
    )


def viewport_specs(ids: list[str] | None) -> list[dict]:
    """Resolve viewport ids to specs, defaulting to all three."""
    wanted = set(ids or [])
    chosen = [v for v in VIEWPORT_OPTIONS if not wanted or v["id"] in wanted]
    return chosen or list(VIEWPORT_OPTIONS)


def _placeholder_png(url: str, viewport: dict, accent: str) -> bytes:
    from PIL import Image, ImageDraw

    width = viewport["width"] * DEVICE_SCALE_FACTOR
    height = viewport["height"] * DEVICE_SCALE_FACTOR
    background = _ACCENT_RGB.get(accent, _ACCENT_RGB["ink-amber"])
    foreground = _ACCENT_FG.get(accent, _ACCENT_FG["ink-amber"])

    image = Image.new("RGB", (width, height), background)
    draw = ImageDraw.Draw(image)
    margin = int(min(width, height) * 0.08)
    draw.rectangle(
        [margin, margin, width - margin, height - margin],
        outline=foreground,
        width=max(2, width // 400),
    )
    # A fake browser chrome bar so the card still reads as "a product screen".
    bar = margin + int(height * 0.06)
    draw.rectangle([margin, margin, width - margin, bar], fill=foreground)
    lines = [
        "CAPTURE PLACEHOLDER",
        viewport["label"],
        url[:60],
        "pnpm run setup:capture",
    ]
    y = bar + margin
    for line in lines:
        draw.text((margin + margin // 2, y), line, fill=foreground)
        y += int(height * 0.06)

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _wait_for_content(page) -> None:
    """Best-effort wait for the page to stop being a loading skeleton.

    Three bounded steps, each of which may time out harmlessly:

    1. no attached `Skeleton` — the precise content-ready signal for a shadcn/ui
       app, and an instant no-op on a page that has none. First on purpose: it is
       both the fastest and the most meaningful of the three.
    2. `networkidle` — mop-up for late images on pages with no skeletons to watch.
       Bounded (and swallowed) because a page that polls forever never reaches idle.
    3. a short fixed settle for fonts and entrance animations.
    """
    from playwright.sync_api import Error as PlaywrightError

    for wait in (
        lambda: page.wait_for_selector(
            SKELETON_SELECTOR, state="detached", timeout=SKELETON_TIMEOUT_MS
        ),
        lambda: page.wait_for_load_state("networkidle", timeout=NETWORK_IDLE_TIMEOUT_MS),
    ):
        try:
            wait()
        except PlaywrightError as e:
            logger.info("Capture settle step timed out, shooting anyway (%s)", e)
    page.wait_for_timeout(SETTLE_MS)


def _playwright_pngs(url: str, viewports: list[dict]) -> list[tuple[dict, bytes]]:
    """Screenshot `url` at every viewport.

    Raises `BrowserUnavailableError` when Playwright or its Chromium is missing
    and `CaptureFailedError` when the browser is fine but the page is not, so the
    caller can say which actually happened instead of always blaming the install.

    Uses the SYNC Playwright API on purpose: every B2/render handler in this app
    is a sync `def` running in Starlette's threadpool, so there is no event loop
    in this thread for the async API to attach to.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        raise BrowserUnavailableError(str(e)) from e

    shots: list[tuple[dict, bytes]] = []
    with sync_playwright() as playwright:
        try:
            browser = playwright.chromium.launch()
        except Exception as e:
            raise BrowserUnavailableError(str(e)) from e
        try:
            for viewport in viewports:
                context = browser.new_context(
                    viewport={"width": viewport["width"], "height": viewport["height"]},
                    device_scale_factor=DEVICE_SCALE_FACTOR,
                )
                page = context.new_page()
                try:
                    page.goto(url, wait_until="load", timeout=CAPTURE_TIMEOUT_MS)
                    _wait_for_content(page)
                    shots.append((viewport, page.screenshot(full_page=False)))
                except Exception as e:
                    raise CaptureFailedError(str(e)) from e
                finally:
                    context.close()
        finally:
            browser.close()
    return shots


def capture_product(
    product: str,
    url: str = "",
    viewports: list[str] | None = None,
    accent: str = "ink-amber",
    name: str = "product",
) -> dict:
    """Capture `url` into B2 for `product`. Never raises for a missing browser.

    Returns `{product, url, engine, note, captures: [{key, viewport, bytes}]}`.
    """
    target = url or settings.capture_url_default
    specs = viewport_specs(viewports)
    engine = "playwright"
    note = ""

    try:
        shots = _playwright_pngs(target, specs)
    except Exception as e:  # any capture failure degrades to placeholders
        logger.warning("Capture fell back to placeholders (%s)", e)
        engine = "placeholder"
        note = (
            PLACEHOLDER_NOTE
            if isinstance(e, BrowserUnavailableError)
            else _unreachable_note(target, str(e))
        )
        shots = [(spec, _placeholder_png(target, spec, accent)) for spec in specs]

    captures = []
    for viewport, png in shots:
        key = capture_key(product, viewport["id"], name)
        upload_bytes(png, key, "image/png")
        captures.append(
            {
                "key": key,
                "viewport": viewport["id"],
                "label": viewport["label"],
                "size_bytes": len(png),
            }
        )
    logger.info(
        "Captured product: product=%s engine=%s count=%d",
        slugify(product),
        engine,
        len(captures),
    )
    return {
        "product": slugify(product, "product"),
        "url": target,
        "engine": engine,
        "note": note,
        "captures": captures,
    }
