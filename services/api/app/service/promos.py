"""Promo-job CRUD, with B2 as the only store.

`storyboards/<job_id>.json` **is** the job record — listing that prefix
enumerates jobs, reading one returns the job, and editing one bumps `revision`.
`manifests/<job_id>.json` accumulates a `RenderPass` entry per completed pass.
That pairing is what makes the write-amplification loop explicit in the data
model rather than a claim in a README.
"""

import logging
import uuid
from datetime import UTC, datetime

from app.config import settings
from app.repo import delete_file, delete_prefix, get_json, put_json
from app.types.beatgrid import snap_storyboard, with_start_frames
from app.types.keys import (
    job_prefixes,
    manifest_key,
    slugify,
    storyboard_key,
)
from app.types.library import accent_ids, preset_by_id, sfx_ids, shot_card_ids
from app.types.promo import (
    DeliveryManifest,
    Shot,
    Storyboard,
    StoryboardCreate,
    StoryboardPatch,
    summarize_passes,
)
from app.types.variants import MASTER_VARIANT, variant_ids

logger = logging.getLogger(__name__)


class PromoNotFoundError(Exception):
    def __init__(self, job_id: str):
        self.detail = f"Promo '{job_id}' not found"
        super().__init__(self.detail)


class PromoValidationError(Exception):
    def __init__(self, detail: str):
        self.detail = detail
        super().__init__(detail)


def _now() -> datetime:
    return datetime.now(UTC)


def _validate_choice(value: str, allowed: set[str] | frozenset[str], field: str) -> None:
    if value not in allowed:
        raise PromoValidationError(
            f"Unknown {field} '{value}'. Allowed: {', '.join(sorted(allowed))}"
        )


def _format_copy(template: str, title: str, product: str) -> str:
    return template.replace("{title}", title).replace("{product}", product)


def build_shots(
    preset_id: str,
    title: str,
    product: str,
    bpm: int,
    fps: int,
    capture_keys: dict[str, str] | None = None,
) -> list[Shot]:
    """Expand a preset into beat-snapped shots.

    Snapping happens here, once, at authoring time — the stored storyboard is
    already beat-aligned, so the renderer never has to re-derive timing.
    """
    preset = preset_by_id(preset_id)
    if preset is None:
        raise PromoValidationError(f"Unknown storyboard preset '{preset_id}'")

    template_shots = preset["shots"]
    snapped = snap_storyboard(
        [int(shot["duration_frames"]) for shot in template_shots], fps, bpm
    )
    captures = capture_keys or {}
    default_capture = captures.get("desktop") or next(iter(captures.values()), None)

    shots: list[Shot] = []
    for template, (start, duration) in zip(
        template_shots, with_start_frames(snapped), strict=True
    ):
        card = template["card"]
        _validate_choice(card, shot_card_ids(), "shot card")
        shots.append(
            Shot(
                card=card,
                from_frame=start,
                duration_frames=duration,
                headline=_format_copy(template.get("headline", ""), title, product),
                sub=_format_copy(template.get("sub", ""), title, product),
                capture=default_capture,
                sfx=template.get("sfx", "none"),
            )
        )
    return shots


def create_promo(spec: StoryboardCreate, capture_keys: dict[str, str] | None = None) -> Storyboard:
    """Write a new storyboard at revision 1. Raises PromoValidationError."""
    _validate_choice(spec.accent, accent_ids(), "accent")
    for variant in spec.variants:
        _validate_choice(variant, set(variant_ids()), "variant")
    if MASTER_VARIANT not in spec.variants:
        # The poster and the frame-strip sample both come from the master, and
        # every other variant is a re-render of the same storyboard, so the
        # master is not optional.
        spec.variants = [MASTER_VARIANT, *spec.variants]

    product = slugify(spec.product, "product")
    now = _now()
    job_id = uuid.uuid4().hex[:12]
    storyboard = Storyboard(
        job_id=job_id,
        product=product,
        title=spec.title.strip(),
        preset=spec.preset,
        revision=1,
        created_at=now,
        updated_at=now,
        bpm=spec.bpm,
        fps=settings.render_fps,
        width=spec.width,
        height=spec.height,
        accent=spec.accent,
        variants=list(dict.fromkeys(spec.variants)),
        shots=build_shots(
            spec.preset,
            spec.title.strip(),
            product,
            spec.bpm,
            settings.render_fps,
            capture_keys,
        ),
    )
    _write_storyboard(storyboard)
    logger.info(
        "Promo created: job_id=%s product=%s preset=%s frames=%d",
        job_id,
        product,
        spec.preset,
        storyboard.duration_frames,
    )
    return storyboard


def _write_storyboard(storyboard: Storyboard) -> None:
    put_json(
        storyboard_key(storyboard.job_id),
        storyboard.model_dump(mode="json", by_alias=True),
    )


def get_storyboard(job_id: str) -> Storyboard:
    document = get_json(storyboard_key(job_id))
    if document is None:
        raise PromoNotFoundError(job_id)
    return Storyboard.model_validate(document)


def get_manifest(job_id: str) -> DeliveryManifest | None:
    document = get_json(manifest_key(job_id))
    return DeliveryManifest.model_validate(document) if document else None


def save_manifest(manifest: DeliveryManifest) -> None:
    manifest.totals = summarize_passes(manifest.passes)
    put_json(manifest_key(manifest.job_id), manifest.model_dump(mode="json"))


def update_promo(job_id: str, patch: StoryboardPatch) -> Storyboard:
    """Apply an edit and bump `revision` — the next render becomes a new pass."""
    storyboard = get_storyboard(job_id)

    if patch.title is not None:
        storyboard.title = patch.title.strip()
    if patch.accent is not None:
        _validate_choice(patch.accent, accent_ids(), "accent")
        storyboard.accent = patch.accent
    if patch.variants is not None:
        for variant in patch.variants:
            _validate_choice(variant, set(variant_ids()), "variant")
        merged = [MASTER_VARIANT, *patch.variants]
        storyboard.variants = list(dict.fromkeys(merged))
    if patch.bpm is not None:
        storyboard.bpm = patch.bpm

    if patch.shots is not None:
        if not patch.shots:
            raise PromoValidationError("A storyboard needs at least one shot")
        for shot in patch.shots:
            _validate_choice(shot.card, shot_card_ids(), "shot card")
            _validate_choice(shot.sfx, sfx_ids(), "SFX")
        snapped = snap_storyboard(
            [shot.duration_frames for shot in patch.shots],
            storyboard.fps,
            storyboard.bpm,
        )
        storyboard.shots = [
            Shot(
                card=patch_shot.card,
                from_frame=start,
                duration_frames=duration,
                headline=patch_shot.headline,
                sub=patch_shot.sub,
                capture=patch_shot.capture,
                sfx=patch_shot.sfx,
            )
            for patch_shot, (start, duration) in zip(
                patch.shots, with_start_frames(snapped), strict=True
            )
        ]
    elif patch.bpm is not None:
        # BPM changed but the shot list did not: re-snap the existing shots to
        # the new grid so the storyboard is never stored off-beat.
        snapped = snap_storyboard(
            [shot.duration_frames for shot in storyboard.shots],
            storyboard.fps,
            storyboard.bpm,
        )
        for shot, (start, duration) in zip(
            storyboard.shots, with_start_frames(snapped), strict=True
        ):
            shot.from_frame = start
            shot.duration_frames = duration

    storyboard.revision += 1
    storyboard.updated_at = _now()
    _write_storyboard(storyboard)
    logger.info(
        "Promo updated: job_id=%s revision=%d frames=%d",
        job_id,
        storyboard.revision,
        storyboard.duration_frames,
    )
    return storyboard


def delete_promo(job_id: str) -> dict:
    """Purge exactly this promo's four prefixes. Nothing else is touched."""
    get_storyboard(job_id)  # 404 before deleting anything
    removed = 0
    for target in job_prefixes(job_id):
        if target.endswith("/"):
            removed += delete_prefix(target)
        else:
            delete_file(target)
            removed += 1
    logger.info("Promo deleted: job_id=%s objects_removed=%d", job_id, removed)
    return {"deleted": True, "job_id": job_id, "objects_removed": removed}
