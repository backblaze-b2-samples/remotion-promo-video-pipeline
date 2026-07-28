"""One render pass, end to end.

    resume scan -> render frames -> upload frames -> encode -> poster ->
    upload variant -> manifest

Every variant is a **real re-render** of the same storyboard at that variant's
pixel size, not a crop of the master, which is exactly why the intermediate
frame volume multiplies: N frames per variant per pass. Uploading all of them is
the point of the sample, so `FRAME_UPLOAD_ENABLED` defaults to true.

The resume scan is the reason B2 is the intermediate store and not `/tmp`: a
killed render lists `frames/<job>/pass-NN/<variant>/`, renders only the missing
tail, and pulls the frames that already landed back down for the encode.
"""

import json
import logging
import shutil
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

from app.config import settings
from app.repo import (
    fetch_frames,
    list_frame_numbers,
    put_frames,
    upload_bytes,
)
from app.service import promos
from app.service.audio_mix import pass_audio_track
from app.service.encode import encode_variant, extract_poster, poster_frame_number
from app.service.render_engine import render_frames
from app.service.render_payload import local_frame_bytes, render_payload
from app.types.keys import (
    frame_key,
    frame_name,
    frame_prefix,
    pass_label,
    poster_key,
    storyboard_key,
    variant_key,
)
from app.types.promo import (
    DeliveryManifest,
    RenderedVariant,
    RenderPass,
    Storyboard,
    amplification_ratio,
)
from app.types.variants import tier_from_master, variant_spec

logger = logging.getLogger(__name__)

# services/api/app/service/render_pass.py -> services/api/data/passes
WORK_ROOT = Path(__file__).resolve().parents[2] / "data" / "passes"

Reporter = Callable[..., None]

# Report upload progress every Nth object: the UI polls at 1.5s.
UPLOAD_REPORT_EVERY = 10


def _render_variant(
    storyboard: Storyboard,
    storyboard_path: Path,
    pass_number: int,
    variant: str,
    work: Path,
    audio_path: Path | None,
    report: Reporter,
    uploaded_before: int = 0,
) -> tuple[RenderedVariant, int]:
    """Render + upload + encode one variant.

    Returns the manifest row and the pass-cumulative upload count, threaded into
    the next variant so "N frames uploaded to B2 this pass" really is per-pass.
    """
    job_id = storyboard.job_id
    total_frames = storyboard.duration_frames
    spec = variant_spec(variant, tier_from_master(storyboard.width, storyboard.height))
    prefix = frame_prefix(job_id, pass_number, variant)
    out_dir = work / variant

    report(phase="resuming", variant=variant, rendered=0, total=total_frames)
    already = list_frame_numbers(prefix) if settings.frame_upload_enabled else {}
    missing = [number for number in range(total_frames) if number not in already]

    if missing:
        report(
            phase="rendering",
            variant=variant,
            rendered=len(already),
            total=total_frames,
            message=(
                f"Rendering {len(missing)} of {total_frames} frames"
                f"{' (resumed)' if already else ''}"
            ),
        )
        base = len(already)
        render_frames(
            storyboard_path,
            variant,
            out_dir,
            (min(missing), max(missing)),
            on_progress=lambda rendered, total: report(
                phase="rendering",
                variant=variant,
                rendered=min(total_frames, base + rendered),
                total=total_frames,
            ),
        )

        if settings.frame_upload_enabled:
            items = [
                (frame_key(job_id, pass_number, variant, number), out_dir / frame_name(number))
                for number in missing
                if (out_dir / frame_name(number)).exists()
            ]
            # `rendered`/`total` are re-pointed at the upload leg for its duration
            # (the phase label gives them meaning), so the bar and counter keep
            # moving instead of freezing at "180 / 180" for most of the wall clock.
            report(
                phase="uploading",
                variant=variant,
                message="Uploading frames to B2",
                rendered=0,
                total=len(items),
            )
            base_uploaded = uploaded_before

            def on_uploaded(done: int, count: int = len(items)) -> None:
                # Throttled: 1,086 frames would otherwise take the progress lock
                # 1,086 times per variant, for a bar the UI polls every 1.5s.
                if done % UPLOAD_REPORT_EVERY == 0 or done == count:
                    report(rendered=done, frames_uploaded=base_uploaded + done)

            put_frames(items, on_uploaded=on_uploaded)
            uploaded_before += len(items)
            report(rendered=len(items), frames_uploaded=uploaded_before)

    if settings.frame_upload_enabled:
        # Authoritative per-pass frame accounting, straight from the bucket:
        # counts and byte totals include frames a previous attempt uploaded.
        stored = list_frame_numbers(prefix)
        frame_count = len(stored)
        frame_bytes = sum(stored.values())
        # Pull back anything this attempt did not render locally so the encode
        # sees one complete sequence.
        to_fetch = [
            (frame_key(job_id, pass_number, variant, number), out_dir / frame_name(number))
            for number in stored
            if not (out_dir / frame_name(number)).exists()
        ]
        if to_fetch:
            report(
                phase="resuming",
                variant=variant,
                message=f"Restoring {len(to_fetch)} frames from B2",
            )
            fetch_frames(to_fetch)
    else:
        frame_count, frame_bytes = local_frame_bytes(out_dir, total_frames)

    report(phase="encoding", variant=variant, message=f"Encoding {variant}")
    mp4_local = work / f"{variant}.mp4"
    encode_variant(
        out_dir,
        mp4_local,
        storyboard.fps,
        audio_path=audio_path,
        muted=spec["muted"],
        # Bounds the MP4 to the frames it was built from — see `encode_variant`.
        total_frames=total_frames,
    )
    poster_local = work / f"{variant}.poster.jpg"
    extract_poster(out_dir / frame_name(poster_frame_number(total_frames)), poster_local)

    report(phase="publishing", variant=variant, message=f"Uploading {variant}.mp4")
    variant_bytes = upload_bytes(mp4_local.read_bytes(), variant_key(job_id, variant), "video/mp4")
    upload_bytes(poster_local.read_bytes(), poster_key(job_id, variant), "image/jpeg")

    # Frames live in B2 now; the local copies are disposable scratch.
    shutil.rmtree(out_dir, ignore_errors=True)

    row = RenderedVariant(
        variant=variant,
        width=spec["width"],
        height=spec["height"],
        frame_count=frame_count,
        frame_bytes=frame_bytes,
        variant_key=variant_key(job_id, variant),
        variant_bytes=variant_bytes,
        poster_key=poster_key(job_id, variant),
        duration_seconds=round(total_frames / max(1, storyboard.fps), 2),
    )
    return row, uploaded_before


def run_pass(job_id: str, report: Reporter) -> RenderPass:
    """Render every variant of `job_id`'s current revision and record the pass."""
    started = datetime.now(UTC)
    storyboard = promos.get_storyboard(job_id)
    manifest = promos.get_manifest(job_id) or DeliveryManifest(
        job_id=job_id, product=storyboard.product, title=storyboard.title
    )
    pass_number = len(manifest.passes) + 1
    total_frames = storyboard.duration_frames

    work = WORK_ROOT / job_id / pass_label(pass_number)
    work.mkdir(parents=True, exist_ok=True)
    storyboard_path = work / "storyboard.json"
    storyboard_path.write_text(json.dumps(render_payload(storyboard), indent=2))

    report(
        phase="queued",
        pass_number=pass_number,
        variant_total=len(storyboard.variants),
        total=total_frames,
        message=f"Pass {pass_number}, revision {storyboard.revision}",
    )

    audio_path = pass_audio_track(storyboard, work)

    rendered: list[RenderedVariant] = []
    uploaded = 0
    for index, variant in enumerate(storyboard.variants, start=1):
        report(variant_index=index, variant=variant)
        row, uploaded = _render_variant(
            storyboard,
            storyboard_path,
            pass_number,
            variant,
            work,
            audio_path,
            report,
            uploaded_before=uploaded,
        )
        rendered.append(row)

    frame_bytes = sum(item.frame_bytes for item in rendered)
    variant_bytes = sum(item.variant_bytes for item in rendered)
    render_pass = RenderPass(
        pass_number=pass_number,
        revision=storyboard.revision,
        started_at=started,
        finished_at=datetime.now(UTC),
        storyboard_key=storyboard_key(job_id),
        fps=storyboard.fps,
        bpm=storyboard.bpm,
        duration_frames=total_frames,
        shot_cards=[shot.card for shot in storyboard.shots],
        variants=rendered,
        frames_written=sum(item.frame_count for item in rendered),
        frame_bytes=frame_bytes,
        variant_bytes=variant_bytes,
        amplification_ratio=amplification_ratio(frame_bytes, variant_bytes),
    )
    manifest.title = storyboard.title
    manifest.passes.append(render_pass)
    promos.save_manifest(manifest)

    shutil.rmtree(work, ignore_errors=True)
    report(
        phase="done",
        message=(
            f"Pass {pass_number} complete: {render_pass.frames_written} frames, "
            f"{render_pass.amplification_ratio}x write amplification"
        ),
    )
    logger.info(
        "Pass complete: job_id=%s pass=%d frames=%d ratio=%.2f",
        job_id,
        pass_number,
        render_pass.frames_written,
        render_pass.amplification_ratio,
    )
    return render_pass
