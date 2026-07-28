"""Write-amplification maths and the manifest round-trip."""

from datetime import UTC, datetime

from app.types.promo import (
    DeliveryManifest,
    RenderedVariant,
    RenderPass,
    amplification_ratio,
    summarize_passes,
)


def _variant(name: str, frame_bytes: int, variant_bytes: int) -> RenderedVariant:
    return RenderedVariant(
        variant=name,
        width=1280,
        height=720,
        frame_count=180,
        frame_bytes=frame_bytes,
        variant_key=f"renders/job/{name}.mp4",
        variant_bytes=variant_bytes,
        poster_key=f"renders/job/{name}.poster.jpg",
        duration_seconds=6.0,
    )


def _pass(number: int, frame_bytes: int, variant_bytes: int) -> RenderPass:
    return RenderPass(
        pass_number=number,
        revision=number,
        started_at=datetime(2026, 7, 1, tzinfo=UTC),
        finished_at=datetime(2026, 7, 1, 0, 5, tzinfo=UTC),
        storyboard_key="storyboards/job.json",
        fps=30,
        bpm=120,
        duration_frames=180,
        shot_cards=["paper-title-card"],
        variants=[_variant("master-16x9", frame_bytes, variant_bytes)],
        frames_written=180,
        frame_bytes=frame_bytes,
        variant_bytes=variant_bytes,
        amplification_ratio=amplification_ratio(frame_bytes, variant_bytes),
    )


def test_ratio_is_intermediate_over_delivered():
    assert amplification_ratio(4_000_000, 400_000) == 10.0
    assert amplification_ratio(1000, 3) == 333.33


def test_ratio_is_zero_before_anything_is_delivered():
    """Never Infinity: an in-flight pass must not break the dashboard."""
    assert amplification_ratio(9_000_000, 0) == 0.0
    assert amplification_ratio(0, 0) == 0.0


def test_summarize_accumulates_across_passes():
    totals = summarize_passes([_pass(1, 3_000, 300), _pass(2, 5_000, 200)])
    assert totals.passes == 2
    assert totals.frames_written == 360
    assert totals.frame_bytes == 8_000
    assert totals.variant_bytes == 500
    assert totals.amplification_ratio == 16.0


def test_summarize_of_no_passes_is_all_zero():
    totals = summarize_passes([])
    assert totals.passes == 0
    assert totals.amplification_ratio == 0.0


def test_manifest_round_trips_through_json():
    """The manifest is stored as JSON in B2, so it must survive a round trip."""
    manifest = DeliveryManifest(
        job_id="job",
        product="demo-product",
        title="Ship faster",
        passes=[_pass(1, 3_000, 300)],
    )
    manifest.totals = summarize_passes(manifest.passes)

    document = manifest.model_dump(mode="json")
    restored = DeliveryManifest.model_validate(document)

    assert restored.job_id == manifest.job_id
    assert len(restored.passes) == 1
    assert restored.passes[0].variants[0].variant_key == "renders/job/master-16x9.mp4"
    assert restored.totals.amplification_ratio == 10.0
    assert restored.passes[0].finished_at == manifest.passes[0].finished_at


def test_appending_a_pass_recomputes_the_totals():
    """Editing a storyboard then re-rendering is the amplification loop."""
    manifest = DeliveryManifest(job_id="job", product="p", title="t", passes=[_pass(1, 1_000, 100)])
    manifest.totals = summarize_passes(manifest.passes)
    assert manifest.totals.passes == 1

    manifest.passes.append(_pass(2, 1_000, 100))
    manifest.totals = summarize_passes(manifest.passes)
    assert manifest.totals.passes == 2
    assert manifest.totals.frame_bytes == 2_000
    assert manifest.totals.amplification_ratio == 10.0
