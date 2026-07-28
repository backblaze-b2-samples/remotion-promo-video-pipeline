"""Variant id -> pixel geometry.

Four variants are real re-renders of the same storyboard at different frame
sizes, never crops of the master. Dimensions are derived from the render tier
(the master's short edge: 720 or 1080) so one list in
`packages/shared/src/variants.json` serves both RENDER_PRESET values.
"""

from app.types.library import variant_defs

MASTER_VARIANT = "master-16x9"


def _even(value: float) -> int:
    """Round to the nearest even integer — x264 requires even dimensions."""
    return max(2, round(value / 2) * 2)


def variant_ids() -> list[str]:
    return [v["id"] for v in variant_defs()]


def variant_def(variant_id: str) -> dict | None:
    return next((v for v in variant_defs() if v["id"] == variant_id), None)


def variant_geometry(variant_id: str, tier: int) -> tuple[int, int]:
    """Pixel size for `variant_id` at `tier` (the master's short edge).

    16:9 at tier 720 -> 1280x720; 9:16 -> 720x1280; 1:1 -> 720x720.
    """
    spec = variant_def(variant_id)
    if spec is None:
        raise ValueError(f"Unknown variant '{variant_id}'")
    aspect_w = int(spec["aspect_w"])
    aspect_h = int(spec["aspect_h"])
    short_edge = max(2, int(tier))
    if aspect_w >= aspect_h:
        return _even(short_edge * aspect_w / aspect_h), _even(short_edge)
    return _even(short_edge), _even(short_edge * aspect_h / aspect_w)


def variant_spec(variant_id: str, tier: int) -> dict:
    """Full spec (label, geometry, fit, muted) for one variant at one tier."""
    spec = variant_def(variant_id)
    if spec is None:
        raise ValueError(f"Unknown variant '{variant_id}'")
    width, height = variant_geometry(variant_id, tier)
    return {
        "id": spec["id"],
        "label": spec["label"],
        "width": width,
        "height": height,
        "fit": spec["fit"],
        "muted": bool(spec["muted"]),
        "purpose": spec["purpose"],
    }


def tier_from_master(width: int, height: int) -> int:
    """The render tier implied by a master frame size (its short edge)."""
    return min(int(width), int(height))
