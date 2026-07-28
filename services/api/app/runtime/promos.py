"""Promo-job routes: the full create / read / edit / delete / run lifecycle.

Handlers are sync `def` on purpose — the whole chain below is blocking boto3 and
subprocess work, and Starlette runs sync handlers in its threadpool. An
`async def` here would stall every other request behind one bucket scan.

`POST /promos/{id}/render` returns 202 immediately and the pass runs in the
single background worker (`service/jobs.py`); `GET /promos/{id}/progress` is the
poll target.
"""

import logging

from fastapi import APIRouter, HTTPException, Response

from app.config import settings
from app.service import assets as assets_service
from app.service import capture as capture_service
from app.service import jobs, promo_views, promos
from app.service.encode import BinaryMissingError
from app.types.library import accent_ids, presets
from app.types.promo import (
    BPM_OPTIONS,
    RESOLUTION_OPTIONS,
    VIEWPORT_OPTIONS,
    PassVolumePoint,
    PipelineStats,
    PromoDetail,
    PromoSummary,
    RenderProgress,
    Storyboard,
    StoryboardCreate,
    StoryboardPatch,
)
from app.types.variants import tier_from_master, variant_ids, variant_spec

logger = logging.getLogger(__name__)

router = APIRouter()

# SECURITY: like every other route in this app, these are intentionally
# UNAUTHENTICATED and single-tenant (see docs/SECURITY.md). A multi-tenant fork
# must both require auth here AND scope storyboards/manifests per caller.


def _handle(exc: Exception) -> HTTPException:
    if isinstance(exc, promos.PromoNotFoundError):
        return HTTPException(status_code=404, detail=exc.detail)
    if isinstance(exc, promos.PromoValidationError):
        return HTTPException(status_code=400, detail=exc.detail)
    if isinstance(exc, jobs.RenderBusyError):
        return HTTPException(status_code=409, detail=exc.detail)
    if isinstance(exc, BinaryMissingError):
        # 503, not 500: the request was fine, the host is missing a binary and
        # the message says exactly which one and how to install it.
        return HTTPException(status_code=503, detail=str(exc))
    return HTTPException(status_code=502, detail="Storage backend error")


@router.get("/promos", response_model=list[PromoSummary])
def list_promos_endpoint():
    try:
        return promo_views.list_promos()
    except RuntimeError as e:
        raise _handle(e) from None


@router.post("/promos", response_model=Storyboard, status_code=201)
def create_promo_endpoint(spec: StoryboardCreate):
    """Create a storyboard at revision 1, capturing the product UI first.

    The capture runs inline (three viewports, a couple of seconds) so a new
    promo already has real product screenshots wired into its capture-using
    shots. With no Chromium installed — or with an unreachable URL — it degrades
    to placeholder cards instead of failing (see `service/capture.py`), and the
    outcome is recorded on the storyboard so the degrade is never silent.
    """
    try:
        capture = capture_service.capture_product(
            spec.product,
            url=spec.capture_url,
            viewports=spec.viewports,
            accent=spec.accent,
        )
        capture_keys = assets_service.capture_keys_by_viewport(spec.product)
        return promos.create_promo(spec, capture_keys=capture_keys, capture=capture)
    except (promos.PromoValidationError, RuntimeError) as e:
        raise _handle(e) from None


@router.get("/promos/stats", response_model=PipelineStats)
def promo_stats_endpoint():
    try:
        return promo_views.get_pipeline_stats()
    except RuntimeError as e:
        raise _handle(e) from None


@router.get("/promos/volume", response_model=list[PassVolumePoint])
def promo_volume_endpoint(limit: int = 8):
    if limit < 1 or limit > 50:
        raise HTTPException(status_code=400, detail="Limit must be between 1 and 50")
    try:
        return promo_views.get_pass_volume(limit)
    except RuntimeError as e:
        raise _handle(e) from None


@router.get("/promo-defaults")
def promo_defaults_endpoint():
    """Form hints for `/promos/new`.

    These are *hints* — placeholders and descriptions — never an autofill
    button: the create form should teach the safe default, not fill it in behind
    the user's back.
    """
    tier = min(settings.frame_width, settings.frame_height)
    return {
        "product": settings.promo_product_default,
        "title": "Ship faster with " + settings.promo_product_default,
        "capture_url": settings.capture_url_default,
        "preset": settings.default_storyboard_preset,
        "bpm": 120,
        "fps": settings.render_fps,
        "width": settings.frame_width,
        "height": settings.frame_height,
        "variants": settings.default_variants,
        "accent": "ink-amber",
        "bpm_options": list(BPM_OPTIONS),
        "resolution_options": [
            {"width": w, "height": h, "label": f"{w}x{h}"} for w, h in RESOLUTION_OPTIONS
        ],
        "variant_options": [variant_spec(variant, tier) for variant in variant_ids()],
        "viewport_options": [dict(v) for v in VIEWPORT_OPTIONS],
        "accent_options": sorted(accent_ids()),
        "preset_options": [
            {
                "id": preset["id"],
                "label": preset["label"],
                "description": preset["description"],
                "duration_frames": preset["duration_frames"],
                "shot_count": len(preset["shots"]),
            }
            for preset in presets()
        ],
        "render_preset": settings.render_preset,
        "render_concurrency": settings.resolved_render_concurrency,
        "frame_upload_enabled": settings.frame_upload_enabled,
    }


@router.get("/promos/{job_id}", response_model=PromoDetail)
def get_promo_endpoint(job_id: str):
    try:
        return promo_views.get_promo_detail(job_id)
    except (promos.PromoNotFoundError, RuntimeError) as e:
        raise _handle(e) from None


@router.patch("/promos/{job_id}", response_model=Storyboard)
def update_promo_endpoint(job_id: str, patch: StoryboardPatch):
    try:
        return promos.update_promo(job_id, patch)
    except (promos.PromoNotFoundError, promos.PromoValidationError, RuntimeError) as e:
        raise _handle(e) from None


@router.delete("/promos/{job_id}")
def delete_promo_endpoint(job_id: str):
    """Prefix-scoped purge: storyboard, frames, renders, manifest. Nothing else."""
    try:
        result = promos.delete_promo(job_id)
    except (promos.PromoNotFoundError, RuntimeError) as e:
        raise _handle(e) from None
    jobs.forget(job_id)
    return result


@router.post("/promos/{job_id}/render", response_model=RenderProgress, status_code=202)
def render_promo_endpoint(job_id: str, response: Response):
    try:
        progress = jobs.start_render(job_id)
    except (promos.PromoNotFoundError, jobs.RenderBusyError, RuntimeError) as e:
        raise _handle(e) from None
    response.headers["Location"] = f"/promos/{job_id}/progress"
    return progress


@router.get("/promos/{job_id}/progress", response_model=RenderProgress)
def render_progress_endpoint(job_id: str):
    try:
        return jobs.get_progress(job_id)
    except RuntimeError as e:
        raise _handle(e) from None


@router.get("/promos/{job_id}/variant-specs")
def variant_specs_endpoint(job_id: str):
    """Geometry the storyboard's variants will render at, for the editor UI."""
    try:
        storyboard = promos.get_storyboard(job_id)
    except (promos.PromoNotFoundError, RuntimeError) as e:
        raise _handle(e) from None
    tier = tier_from_master(storyboard.width, storyboard.height)
    return [variant_spec(variant, tier) for variant in storyboard.variants]
