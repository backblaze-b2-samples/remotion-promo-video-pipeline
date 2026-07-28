"""Read-side projections over the storyboards + manifests in B2.

Kept apart from `promos.py` (which owns writes) so each file stays inside the
300-line ceiling and so the read path is obvious: everything here is derived
from `storyboards/` and `manifests/`, and every media URL it hands out is a
short-lived presigned URL.
"""

import logging
from datetime import datetime

from app.repo import (
    get_json_many,
    get_presigned_inline_url,
    list_frame_numbers,
    list_keys,
)
from app.service.jobs import rendering_job_ids
from app.service.promos import get_manifest, get_storyboard
from app.types.formatting import humanize_bytes
from app.types.keys import (
    MANIFESTS_ROOT,
    STORYBOARDS_ROOT,
    frame_key,
    frame_prefix,
    job_id_from_storyboard_key,
    manifest_key,
    storyboard_key,
)
from app.types.promo import (
    DeliveryManifest,
    PassVolumePoint,
    PipelineStats,
    PromoDetail,
    PromoStatus,
    PromoSummary,
    Storyboard,
    VariantPlayback,
    summarize_passes,
)
from app.types.variants import MASTER_VARIANT, tier_from_master, variant_spec

logger = logging.getLogger(__name__)

FRAME_SAMPLE_COUNT = 6


def _status(job_id: str, has_passes: bool, in_flight: set[str]) -> PromoStatus:
    """The promo's status, in-flight state first.

    The manifest only gains an entry when a pass *finishes*, so manifest-only
    derivation reported a promo mid-pass as "Rendered" (or "Draft" on its first
    pass) and the UI's `rendering` badge / disabled render button never engaged.
    """
    if job_id in in_flight:
        return "rendering"
    return "rendered" if has_passes else "draft"


def list_promos() -> list[PromoSummary]:
    """Every promo, newest first. One listing, then all documents in parallel.

    Both key sets are known from the listing alone (`storyboards/<id>.json` ->
    `manifests/<id>.json`), so storyboards AND manifests go out in ONE batched,
    concurrent fetch. Walking them one promo at a time was two blocking B2 GETs
    per row — 17 promos meant 34 sequential round trips and a ~7s response, which
    is why the list showed nothing but skeletons on every visit.
    """
    in_flight = rendering_job_ids()
    job_ids = [
        job_id
        for job_id in (
            job_id_from_storyboard_key(row["Key"]) for row in list_keys(STORYBOARDS_ROOT)
        )
        if job_id
    ]
    documents = get_json_many(
        [storyboard_key(job_id) for job_id in job_ids]
        + [manifest_key(job_id) for job_id in job_ids]
    )

    summaries: list[PromoSummary] = []
    for job_id in job_ids:
        document = documents.get(storyboard_key(job_id))
        if document is None:
            continue
        manifest_document = documents.get(manifest_key(job_id))
        summaries.append(
            _summarize(
                Storyboard.model_validate(document),
                DeliveryManifest.model_validate(manifest_document)
                if manifest_document
                else None,
                in_flight,
            )
        )
    summaries.sort(key=lambda s: s.updated_at, reverse=True)
    return summaries


def _summarize(
    storyboard: Storyboard,
    manifest: DeliveryManifest | None,
    in_flight: set[str] | None = None,
) -> PromoSummary:
    passes = manifest.passes if manifest else []
    poster_url = None
    if passes:
        last = passes[-1]
        master = next(
            (v for v in last.variants if v.variant == MASTER_VARIANT), None
        ) or (last.variants[0] if last.variants else None)
        if master and master.poster_key:
            poster_url = get_presigned_inline_url(master.poster_key)
    return PromoSummary(
        job_id=storyboard.job_id,
        product=storyboard.product,
        title=storyboard.title,
        preset=storyboard.preset,
        revision=storyboard.revision,
        updated_at=storyboard.updated_at,
        status=_status(storyboard.job_id, bool(passes), in_flight or set()),
        duration_frames=storyboard.duration_frames,
        fps=storyboard.fps,
        bpm=storyboard.bpm,
        variants=storyboard.variants,
        passes=len(passes),
        poster_url=poster_url,
        amplification_ratio=manifest.totals.amplification_ratio if manifest else 0.0,
    )


def get_pipeline_stats() -> PipelineStats:
    """Cumulative write-amplification totals across every promo."""
    manifests = _all_manifests()
    all_passes = [p for manifest in manifests for p in manifest.passes]
    totals = summarize_passes(all_passes)
    return PipelineStats(
        **totals.model_dump(),
        promos=len(manifests),
        variants_delivered=sum(len(p.variants) for p in all_passes),
        frame_bytes_human=humanize_bytes(totals.frame_bytes),
        variant_bytes_human=humanize_bytes(totals.variant_bytes),
    )


def get_pass_volume(limit: int = 8) -> list[PassVolumePoint]:
    """Frame bytes vs delivered bytes for the most recent passes."""
    rows: list[tuple[datetime, PassVolumePoint]] = []
    for manifest in _all_manifests():
        for render_pass in manifest.passes:
            label = f"{manifest.title[:14]} p{render_pass.pass_number}"
            rows.append(
                (
                    render_pass.finished_at,
                    PassVolumePoint(
                        label=label,
                        frame_bytes=render_pass.frame_bytes,
                        variant_bytes=render_pass.variant_bytes,
                    ),
                )
            )
    rows.sort(key=lambda row: row[0])
    return [point for _, point in rows[-max(1, limit) :]]


def _all_manifests() -> list[DeliveryManifest]:
    """Every delivery manifest, fetched concurrently (same cost story as above)."""
    documents = get_json_many([row["Key"] for row in list_keys(MANIFESTS_ROOT)])
    return [
        DeliveryManifest.model_validate(document)
        for document in documents.values()
        if document
    ]


def get_promo_detail(job_id: str) -> PromoDetail:
    """Storyboard + manifest + presigned playback URLs + a frame-strip sample."""
    storyboard = get_storyboard(job_id)
    manifest = get_manifest(job_id)
    passes = manifest.passes if manifest else []
    last = passes[-1] if passes else None

    playback: list[VariantPlayback] = []
    tier = tier_from_master(storyboard.width, storyboard.height)
    if last:
        for rendered in last.variants:
            spec = variant_spec(rendered.variant, tier)
            playback.append(
                VariantPlayback(
                    variant=rendered.variant,
                    label=spec["label"],
                    width=rendered.width,
                    height=rendered.height,
                    muted=spec["muted"],
                    key=rendered.variant_key,
                    url=get_presigned_inline_url(rendered.variant_key),
                    poster_url=(
                        get_presigned_inline_url(rendered.poster_key)
                        if rendered.poster_key
                        else None
                    ),
                    size_bytes=rendered.variant_bytes,
                    duration_seconds=rendered.duration_seconds,
                )
            )

    return PromoDetail(
        storyboard=storyboard,
        manifest=manifest,
        playback=playback,
        frame_samples=_frame_samples(storyboard, last.pass_number if last else 0),
        status=_status(job_id, bool(passes), rendering_job_ids()),
    )


def _frame_samples(storyboard: Storyboard, pass_number: int) -> list[str]:
    """Evenly spaced presigned frame URLs from the master variant of a pass.

    This is the visible proof that every intermediate frame really is on B2 —
    the strip reads them straight out of `frames/<job>/pass-NN/master-16x9/`.
    """
    if pass_number <= 0:
        return []
    prefix = frame_prefix(storyboard.job_id, pass_number, MASTER_VARIANT)
    numbers = sorted(list_frame_numbers(prefix))
    if not numbers:
        return []
    step = max(1, len(numbers) // FRAME_SAMPLE_COUNT)
    chosen = numbers[::step][:FRAME_SAMPLE_COUNT]
    return [
        get_presigned_inline_url(
            frame_key(storyboard.job_id, pass_number, MASTER_VARIANT, number)
        )
        for number in chosen
    ]
