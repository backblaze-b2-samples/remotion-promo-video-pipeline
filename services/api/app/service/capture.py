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


def _playwright_pngs(url: str, viewports: list[dict]) -> list[tuple[dict, bytes]]:
    """Screenshot `url` at every viewport. Raises on any Playwright failure.

    Uses the SYNC Playwright API on purpose: every B2/render handler in this app
    is a sync `def` running in Starlette's threadpool, so there is no event loop
    in this thread for the async API to attach to.
    """
    from playwright.sync_api import sync_playwright

    shots: list[tuple[dict, bytes]] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            for viewport in viewports:
                context = browser.new_context(
                    viewport={"width": viewport["width"], "height": viewport["height"]},
                    device_scale_factor=DEVICE_SCALE_FACTOR,
                )
                page = context.new_page()
                page.goto(url, wait_until="load", timeout=CAPTURE_TIMEOUT_MS)
                # Settle late-arriving fonts/animations without waiting on
                # networkidle, which a polling dashboard never reaches.
                page.wait_for_timeout(1_200)
                shots.append((viewport, page.screenshot(full_page=False)))
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
    except Exception as e:  # any browser failure degrades to placeholders
        logger.warning("Playwright capture unavailable (%s); using placeholders", e)
        engine = "placeholder"
        note = PLACEHOLDER_NOTE
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
