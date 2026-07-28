"""Promo-pipeline models. Mirrors packages/shared/src/types.ts.

`Storyboard` is the job record: `storyboards/<job_id>.json` in B2 is the only
place job state lives. `DeliveryManifest` accumulates one `RenderPass` entry per
completed pass, which is what makes write amplification measurable rather than
asserted.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, computed_field

PromoStatus = Literal["draft", "rendering", "rendered", "failed"]
RenderPhase = Literal[
    # "idle" is NOT "queued": a promo that has never been rendered has nothing
    # scheduled, and reporting "Queued" made first-time users wait for a pass
    # that would never start. "queued" means a pass really is waiting on the
    # single render worker.
    "idle",
    "queued",
    "resuming",
    "rendering",
    "uploading",
    "encoding",
    "publishing",
    "done",
    "error",
]

BPM_OPTIONS = (90, 110, 120, 128)
RESOLUTION_OPTIONS = ((1280, 720), (1920, 1080))
VIEWPORT_OPTIONS = (
    {"id": "desktop", "label": "Desktop 1440x900", "width": 1440, "height": 900},
    {"id": "tablet", "label": "Tablet 834x1112", "width": 834, "height": 1112},
    {"id": "mobile", "label": "Mobile 390x844", "width": 390, "height": 844},
)


class Shot(BaseModel):
    card: str
    from_frame: int = Field(default=0, alias="from")
    duration_frames: int
    headline: str = ""
    sub: str = ""
    capture: str | None = None
    sfx: str = "none"

    model_config = {"populate_by_name": True}


class Storyboard(BaseModel):
    job_id: str
    product: str
    title: str
    preset: str
    revision: int = 1
    created_at: datetime
    updated_at: datetime
    bpm: int = 120
    fps: int = 30
    width: int
    height: int
    accent: str = "ink-amber"
    variants: list[str]
    shots: list[Shot]
    # How the capture wired into this promo's shots was actually produced, and
    # why if it degraded. Recorded on the job record (not just returned once from
    # POST /promos) so the promo detail page can keep telling the truth about a
    # promo built from synthetic placeholder cards instead of the product UI.
    # Defaults are empty, not "playwright": a storyboard written before this field
    # existed is *unknown*, and claiming a real capture would be the same lie.
    capture_engine: str = ""
    capture_note: str = ""

    @computed_field  # serialized, so the UI never re-derives the total itself
    @property
    def duration_frames(self) -> int:
        return sum(shot.duration_frames for shot in self.shots)


class StoryboardCreate(BaseModel):
    product: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=120)
    preset: str
    bpm: int
    width: int
    height: int
    accent: str = "ink-amber"
    variants: list[str] = Field(min_length=1)
    capture_url: str = ""
    viewports: list[str] = Field(default_factory=list)


class ShotPatch(BaseModel):
    card: str
    duration_frames: int = Field(ge=6, le=600)
    headline: str = ""
    sub: str = ""
    sfx: str = "none"
    capture: str | None = None


class StoryboardPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    bpm: int | None = None
    accent: str | None = None
    variants: list[str] | None = None
    shots: list[ShotPatch] | None = None


class RenderedVariant(BaseModel):
    variant: str
    width: int
    height: int
    frame_count: int
    frame_bytes: int
    variant_key: str
    variant_bytes: int
    poster_key: str | None = None
    duration_seconds: float


class RenderPass(BaseModel):
    pass_number: int
    revision: int
    started_at: datetime
    finished_at: datetime
    storyboard_key: str
    fps: int
    bpm: int
    duration_frames: int
    shot_cards: list[str]
    variants: list[RenderedVariant]
    frames_written: int
    frame_bytes: int
    variant_bytes: int
    amplification_ratio: float


class AmplificationStats(BaseModel):
    passes: int = 0
    frames_written: int = 0
    frame_bytes: int = 0
    variant_bytes: int = 0
    amplification_ratio: float = 0.0


class DeliveryManifest(BaseModel):
    job_id: str
    product: str
    title: str
    passes: list[RenderPass] = Field(default_factory=list)
    totals: AmplificationStats = Field(default_factory=AmplificationStats)


class PromoSummary(BaseModel):
    job_id: str
    product: str
    title: str
    preset: str
    revision: int
    updated_at: datetime
    status: PromoStatus
    duration_frames: int
    fps: int
    bpm: int
    variants: list[str]
    passes: int
    poster_url: str | None = None
    amplification_ratio: float = 0.0


class VariantPlayback(BaseModel):
    variant: str
    label: str
    width: int
    height: int
    muted: bool
    key: str
    url: str | None = None
    poster_url: str | None = None
    size_bytes: int = 0
    duration_seconds: float = 0.0


class PromoDetail(BaseModel):
    storyboard: Storyboard
    manifest: DeliveryManifest | None = None
    playback: list[VariantPlayback] = Field(default_factory=list)
    frame_samples: list[str] = Field(default_factory=list)
    status: PromoStatus = "draft"


class RenderProgress(BaseModel):
    job_id: str
    status: PromoStatus = "draft"
    phase: RenderPhase = "queued"
    pass_number: int = 0
    variant: str | None = None
    variant_index: int = 0
    variant_total: int = 0
    rendered: int = 0
    total: int = 0
    frames_uploaded: int = 0
    message: str = ""
    error: str | None = None
    updated_at: datetime


class PipelineStats(AmplificationStats):
    promos: int = 0
    variants_delivered: int = 0
    frame_bytes_human: str = "0 B"
    variant_bytes_human: str = "0 B"


class PassVolumePoint(BaseModel):
    label: str
    frame_bytes: int
    variant_bytes: int


def amplification_ratio(frame_bytes: int, variant_bytes: int) -> float:
    """Intermediate bytes written per delivered byte.

    The headline number of this sample: one 36.2s 1080p pass writes 1,086 PNG
    frames (several GB) to produce a ~40 MB MP4. Returns 0.0 when nothing has
    been delivered yet, so an in-flight pass can never report a divide-by-zero
    infinity in the dashboard.
    """
    if variant_bytes <= 0:
        return 0.0
    return round(frame_bytes / variant_bytes, 2)


def summarize_passes(passes: list[RenderPass]) -> AmplificationStats:
    """Cumulative write-amplification totals across every completed pass."""
    frame_bytes = sum(p.frame_bytes for p in passes)
    variant_bytes = sum(p.variant_bytes for p in passes)
    return AmplificationStats(
        passes=len(passes),
        frames_written=sum(p.frames_written for p in passes),
        frame_bytes=frame_bytes,
        variant_bytes=variant_bytes,
        amplification_ratio=amplification_ratio(frame_bytes, variant_bytes),
    )
