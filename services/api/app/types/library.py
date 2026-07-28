"""Loaders for the shared card / preset / variant JSON.

`packages/shared/src/*.json` is the single source of truth read by BOTH the
Node render package (`packages/remotion`) and this API. Nothing here duplicates
that data — it only parses it, so a new shot card is added in exactly one file.

Lives in `types/` because it is pure data with no dependency on any other layer.
"""

import functools
import json
from pathlib import Path

# services/api/app/types/library.py -> repo root is four parents up.
SHARED_DIR = Path(__file__).resolve().parents[4] / "packages" / "shared" / "src"

SHOT_CARDS_FILE = SHARED_DIR / "shot-cards.json"
PRESETS_FILE = SHARED_DIR / "storyboard-presets.json"
VARIANTS_FILE = SHARED_DIR / "variants.json"


class LibraryError(RuntimeError):
    """Raised when the shared JSON is missing or unreadable."""


def _read(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except FileNotFoundError as e:
        raise LibraryError(
            f"Shared data file missing: {path}. It ships with the repo under "
            "packages/shared/src/ — restore it or re-clone."
        ) from e
    except json.JSONDecodeError as e:
        raise LibraryError(f"Shared data file {path} is not valid JSON: {e}") from e


@functools.lru_cache(maxsize=1)
def shot_card_library() -> dict:
    """Full shot-card library document (cards + sfx + accents + attribution)."""
    return _read(SHOT_CARDS_FILE)


@functools.lru_cache(maxsize=1)
def shot_cards() -> list[dict]:
    return list(shot_card_library()["cards"])


@functools.lru_cache(maxsize=1)
def shot_card_ids() -> frozenset[str]:
    return frozenset(card["id"] for card in shot_cards())


@functools.lru_cache(maxsize=1)
def sfx_ids() -> frozenset[str]:
    return frozenset(item["id"] for item in shot_card_library()["sfx"])


@functools.lru_cache(maxsize=1)
def accent_ids() -> frozenset[str]:
    return frozenset(item["id"] for item in shot_card_library()["accents"])


@functools.lru_cache(maxsize=1)
def presets() -> list[dict]:
    return list(_read(PRESETS_FILE)["presets"])


def preset_by_id(preset_id: str) -> dict | None:
    return next((p for p in presets() if p["id"] == preset_id), None)


@functools.lru_cache(maxsize=1)
def variant_defs() -> list[dict]:
    return list(_read(VARIANTS_FILE)["variants"])
