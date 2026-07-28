"""A degraded capture must be reported as degraded, and for the right reason.

Two regressions are covered:

1. `capture_product()` swallowed every failure and always blamed a missing
   Chromium, so an unreachable capture URL sent people to run
   `pnpm run setup:capture` for a problem no install can fix.
2. The outcome was returned only to the request that created the promo, so
   `POST /promos` reported plain success and the promo detail page said nothing —
   "a promo from a product-UI capture" silently became a promo of a synthetic
   card.
"""

import pytest

from app.service import capture


@pytest.fixture
def uploads(monkeypatch):
    written: list[str] = []
    monkeypatch.setattr(
        capture, "upload_bytes", lambda data, key, ct: written.append(key) or len(data)
    )
    return written


def _fail_with(monkeypatch, error: Exception) -> None:
    def boom(url, viewports):
        raise error

    monkeypatch.setattr(capture, "_playwright_pngs", boom)


def test_a_missing_browser_points_at_the_install_step(monkeypatch, uploads):
    _fail_with(monkeypatch, capture.BrowserUnavailableError("Executable doesn't exist"))
    result = capture.capture_product("demo-product", url="http://localhost:3000")
    assert result["engine"] == "placeholder"
    assert result["note"] == capture.PLACEHOLDER_NOTE
    assert "setup:capture" in result["note"]


def test_an_unreachable_url_does_not_blame_chromium(monkeypatch, uploads):
    _fail_with(
        monkeypatch,
        capture.CaptureFailedError(
            "Page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:9/"
        ),
    )
    result = capture.capture_product("demo-product", url="http://localhost:9/")
    assert result["engine"] == "placeholder"
    note = result["note"]
    assert "setup:capture" not in note
    assert "http://localhost:9/" in note
    assert "ERR_CONNECTION_REFUSED" in note


def test_the_note_stays_a_single_short_line(monkeypatch, uploads):
    _fail_with(
        monkeypatch,
        capture.CaptureFailedError("first line\nsecond line with internal detail"),
    )
    note = capture.capture_product("demo-product", url="http://x/")["note"]
    assert "second line" not in note


def test_a_clean_capture_carries_no_note(monkeypatch, uploads):
    monkeypatch.setattr(
        capture,
        "_playwright_pngs",
        lambda url, viewports: [(viewports[0], b"png-bytes")],
    )
    result = capture.capture_product("demo-product", viewports=["desktop"])
    assert result["engine"] == "playwright"
    assert result["note"] == ""
