"""Asset routes: the scoped `assets/<product>/` library, captures and audio.

Scoped on purpose. `/files` (untouched from the starter) is the whole-bucket
explorer; this is "what material does this product have?", which is the view a
promo author actually works from.
"""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import settings
from app.service import assets as assets_service
from app.service import audio as audio_service
from app.service import capture as capture_service

logger = logging.getLogger(__name__)

router = APIRouter()


class CaptureRequest(BaseModel):
    product: str = Field(min_length=1, max_length=64)
    url: str = ""
    viewports: list[str] = Field(default_factory=list)
    accent: str = "ink-amber"
    name: str = "product"


class AudioRequest(BaseModel):
    product: str = Field(min_length=1, max_length=64)
    bpm: int = 120


@router.get("/products")
def list_products_endpoint():
    """Product slugs found in the bucket, plus the configured default."""
    try:
        products = assets_service.list_products()
    except RuntimeError:
        raise HTTPException(status_code=502, detail="Storage backend error") from None
    return {"products": products, "default": settings.promo_product_default}


@router.get("/assets")
def list_assets_endpoint(product: str = ""):
    target = product or settings.promo_product_default
    try:
        return assets_service.list_assets(target)
    except RuntimeError:
        raise HTTPException(status_code=502, detail="Storage backend error") from None


@router.post("/captures")
def create_captures_endpoint(request: CaptureRequest):
    """Capture a URL at the requested viewports into `assets/<product>/captures/`.

    Never fails for a missing browser: with no Chromium installed the response
    reports `engine: "placeholder"` and a note explaining how to install it.
    """
    try:
        return capture_service.capture_product(
            request.product,
            url=request.url,
            viewports=request.viewports,
            accent=request.accent,
            name=request.name,
        )
    except RuntimeError:
        raise HTTPException(status_code=502, detail="Storage backend error") from None


@router.post("/assets/demo-audio")
def demo_audio_endpoint(request: AudioRequest):
    """Make sure this product has an audio bed + three SFX one-shots in B2.

    Same code path the renderer uses, so `pnpm run make-demo-assets` and a render
    can never disagree about what the bed sounds like. Two consequences of sharing
    it: `bed_key` is whatever the renderer *would* pick (an uploaded bed wins over
    the synthesized one), and the bed synthesized here is only
    `DEMO_BED_SECONDS` long — a longer pass re-synthesizes a longer one instead of
    reusing this and shipping a truncated MP4.
    """
    from pathlib import Path
    from tempfile import TemporaryDirectory

    try:
        with TemporaryDirectory() as tmp:
            _, key = audio_service.ensure_audio_bed(
                request.product,
                request.bpm,
                audio_service.DEMO_BED_SECONDS,
                Path(tmp) / "bed.wav",
            )
            sfx = audio_service.ensure_sfx_pack(request.product)
    except RuntimeError:
        raise HTTPException(status_code=502, detail="Storage backend error") from None
    return {"product": request.product, "bed_key": key, "sfx": sfx}
