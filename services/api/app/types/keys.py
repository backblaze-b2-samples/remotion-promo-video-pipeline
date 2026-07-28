"""Every B2 object key this app writes is built here.

One module so the bucket layout is auditable in one read, and so
`job_prefixes()` can guarantee that deleting a promo touches only that promo's
own keys. No caller concatenates key strings itself.

Layout:

    assets/<product>/captures/<viewport>/<name>@2x.png
    assets/<product>/audio/bgm/<name>.wav
    assets/<product>/audio/sfx/<category>/<name>.wav
    assets/<product>/brand/<name>.(png|json)
    storyboards/<job-id>.json                  # also the job record
    frames/<job-id>/pass-<NN>/<variant>/frame-%06d.png
    renders/<job-id>/<variant>.mp4
    renders/<job-id>/<variant>.poster.jpg
    manifests/<job-id>.json
"""

import re

ASSETS_ROOT = "assets/"
STORYBOARDS_ROOT = "storyboards/"
FRAMES_ROOT = "frames/"
RENDERS_ROOT = "renders/"
MANIFESTS_ROOT = "manifests/"

FRAME_NUMBER_DIGITS = 6
_FRAME_RE = re.compile(rf"frame-(\d{{{FRAME_NUMBER_DIGITS}}})\.png$")
_SLUG_RE = re.compile(r"[^a-z0-9._-]+")


def slugify(value: str, fallback: str = "item") -> str:
    """Lowercase, filesystem- and key-safe segment. Never empty, never nested."""
    slug = _SLUG_RE.sub("-", (value or "").strip().lower()).strip("-._")
    return slug[:64] or fallback


# --- assets ---------------------------------------------------------------


def asset_prefix(product: str) -> str:
    return f"{ASSETS_ROOT}{slugify(product, 'product')}/"


def capture_prefix(product: str) -> str:
    return f"{asset_prefix(product)}captures/"


def capture_key(product: str, viewport: str, name: str) -> str:
    return f"{capture_prefix(product)}{slugify(viewport, 'desktop')}/{slugify(name, 'capture')}@2x.png"


def bgm_prefix(product: str) -> str:
    return f"{asset_prefix(product)}audio/bgm/"


def bgm_key(product: str, name: str) -> str:
    return f"{bgm_prefix(product)}{slugify(name, 'bed')}.wav"


def sfx_key(product: str, category: str, name: str) -> str:
    return (
        f"{asset_prefix(product)}audio/sfx/"
        f"{slugify(category, 'general')}/{slugify(name, 'hit')}.wav"
    )


def brand_key(product: str, name: str) -> str:
    return f"{asset_prefix(product)}brand/{slugify(name, 'brand')}"


# --- jobs -----------------------------------------------------------------


def storyboard_key(job_id: str) -> str:
    return f"{STORYBOARDS_ROOT}{job_id}.json"


def job_id_from_storyboard_key(key: str) -> str | None:
    if not key.startswith(STORYBOARDS_ROOT) or not key.endswith(".json"):
        return None
    job_id = key[len(STORYBOARDS_ROOT) : -len(".json")]
    return job_id or None


def manifest_key(job_id: str) -> str:
    return f"{MANIFESTS_ROOT}{job_id}.json"


def pass_label(pass_number: int) -> str:
    return f"pass-{int(pass_number):02d}"


def frame_prefix(job_id: str, pass_number: int, variant: str) -> str:
    return f"{FRAMES_ROOT}{job_id}/{pass_label(pass_number)}/{variant}/"


def frame_key(job_id: str, pass_number: int, variant: str, frame_number: int) -> str:
    return f"{frame_prefix(job_id, pass_number, variant)}{frame_name(frame_number)}"


def frame_name(frame_number: int) -> str:
    return f"frame-{int(frame_number):0{FRAME_NUMBER_DIGITS}d}.png"


def frame_number_from_key(key: str) -> int | None:
    match = _FRAME_RE.search(key)
    return int(match.group(1)) if match else None


def variant_key(job_id: str, variant: str) -> str:
    return f"{RENDERS_ROOT}{job_id}/{variant}.mp4"


def poster_key(job_id: str, variant: str) -> str:
    return f"{RENDERS_ROOT}{job_id}/{variant}.poster.jpg"


def job_prefixes(job_id: str) -> tuple[str, ...]:
    """Exactly the keys/prefixes a promo owns — nothing else is ever deleted.

    Deleting a promo walks only these four. There is deliberately no
    bucket-wide delete path anywhere in this codebase, so a shared bucket
    cannot be damaged by a promo delete.
    """
    return (
        storyboard_key(job_id),
        f"{FRAMES_ROOT}{job_id}/",
        f"{RENDERS_ROOT}{job_id}/",
        manifest_key(job_id),
    )
