"""Scoped asset library: `assets/<product>/` only.

Deliberately *not* the bucket explorer. `/files` stays untouched and shows the
whole bucket (forensics); this view answers "what brand material does this
product have?" — captures, the synthesized audio bed, SFX one-shots, brand
files — with presigned inline URLs so thumbnails and audio players work without
a public bucket.
"""

import logging
import mimetypes

from app.repo import get_presigned_inline_url, list_keys
from app.service.promos import get_storyboard
from app.types.formatting import humanize_bytes
from app.types.keys import STORYBOARDS_ROOT, asset_prefix, job_id_from_storyboard_key

logger = logging.getLogger(__name__)

_PLAYABLE = (".wav", ".mp3", ".mp4", ".jpg", ".jpeg", ".png", ".svg", ".json")


def _classify(key: str, prefix: str) -> tuple[str, str]:
    """(kind, group) for one asset key, derived from its position in the layout."""
    relative = key[len(prefix) :] if key.startswith(prefix) else key
    segments = relative.split("/")
    head = segments[0] if segments else ""
    if head == "captures":
        return "capture", segments[1] if len(segments) > 2 else "captures"
    if head == "audio":
        if len(segments) > 1 and segments[1] == "bgm":
            return "bgm", "bgm"
        return "sfx", segments[2] if len(segments) > 3 else "sfx"
    if head == "brand":
        return "brand", "brand"
    return "other", head or "root"


def list_assets(product: str) -> dict:
    """Every asset under `assets/<product>/`, newest first, with inline URLs."""
    prefix = asset_prefix(product)
    entries = []
    for row in list_keys(prefix):
        key = row["Key"]
        if key.endswith("/"):
            continue
        kind, group = _classify(key, prefix)
        name = key.rsplit("/", 1)[-1]
        content_type = mimetypes.guess_type(key)[0] or "application/octet-stream"
        url = (
            get_presigned_inline_url(key)
            if key.lower().endswith(_PLAYABLE)
            else None
        )
        entries.append(
            {
                "key": key,
                "name": name,
                "kind": kind,
                "group": group,
                "size_bytes": int(row["Size"]),
                "size_human": humanize_bytes(int(row["Size"])),
                "content_type": content_type,
                "updated_at": row["LastModified"],
                "url": url,
            }
        )
    entries.sort(key=lambda entry: (entry["kind"], entry["name"]))
    return {"product": product, "prefix": prefix, "entries": entries}


def list_products() -> list[str]:
    """Product slugs that have either assets or a storyboard.

    Read from B2 rather than a config list, so the picker reflects the bucket.
    """
    found: set[str] = set()
    for row in list_keys("assets/"):
        parts = row["Key"].split("/")
        if len(parts) > 2 and parts[1]:
            found.add(parts[1])
    for row in list_keys(STORYBOARDS_ROOT):
        job_id = job_id_from_storyboard_key(row["Key"])
        if not job_id:
            continue
        try:
            found.add(get_storyboard(job_id).product)
        except Exception:  # a broken storyboard must not hide the other products
            logger.warning("Skipping unreadable storyboard for key=%s", row["Key"])
    return sorted(found)


def list_captures(product: str) -> list[dict]:
    """Just the captures for `product` — used to wire shots to a capture."""
    return [
        entry for entry in list_assets(product)["entries"] if entry["kind"] == "capture"
    ]


def capture_keys_by_viewport(product: str) -> dict[str, str]:
    """viewport id -> capture key, for attaching captures to storyboard shots."""
    return {entry["group"]: entry["key"] for entry in list_captures(product)}
