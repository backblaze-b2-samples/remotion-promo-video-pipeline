"""Locally synthesized audio, so no third-party audio licence enters the repo.

Upstream video-shotcraft bundles Mixkit BGM/SFX. This sample references those
but vendors nothing: the bed and the SFX are generated on demand as 16-bit PCM
WAV using the Python standard library (`wave` + `math`), then uploaded to B2
under `assets/<product>/audio/`. Consequences worth stating:

* **No binary asset is committed**, and no audio licence applies.
* **No encoder dependency** — PCM WAV needs no codec, so this path works even
  before ffmpeg is resolved.
* The bed is generated *at the job's BPM*, so the click lands exactly on the
  beat grid `types/beatgrid.py` snapped the shots to.

Bed selection scans the whole `assets/<product>/audio/bgm/` prefix and is
**duration-aware** — see `ensure_audio_bed`. Both properties are load-bearing:
the first makes an uploaded bed actually replace the synthesized one, the second
stops a bed left over from a shorter pass from truncating the MP4.
"""

import io
import logging
import math
import re
import struct
import wave
from pathlib import Path

from app.repo import get_object_bytes, get_presigned_inline_url, list_keys, upload_bytes
from app.types.keys import bgm_key, bgm_prefix, sfx_key

logger = logging.getLogger(__name__)

SAMPLE_RATE = 44_100
CHANNELS = 2
SAMPLE_WIDTH = 2  # 16-bit PCM
_PEAK = 32_767

# Only these can be a bed; `service/upload.py` accepts exactly wav + mp3 audio.
AUDIO_EXTENSIONS = (".wav", ".mp3")
# Beds are read fully into memory to probe and to hand to ffmpeg, so the ceiling
# matches the upload limit rather than being unbounded.
MAX_BED_BYTES = 100 * 1024 * 1024
# Extra tail on a freshly synthesized bed: frame-count / fps rounding must never
# leave the bed a hair shorter than the pass.
BED_HEADROOM_SECONDS = 0.5
# One frame at 30fps — a bed this close to the pass length is close enough.
_DURATION_TOLERANCE = 0.034
# Our own beds, named by `bed_name()`. Anything else in the prefix is a user's.
_SYNTH_BED_RE = re.compile(r"(?:^|/)pulse-\d+bpm\.wav$")

# What `pnpm run make-demo-assets` synthesizes up front. Deliberately short (the
# demo preset is 6s): a longer pass re-synthesizes a longer bed on demand.
DEMO_BED_SECONDS = 8.0

SFX_RECIPES = {
    # id -> (category, seconds, start_hz, end_hz, decay)
    "riser": ("transition", 0.9, 220.0, 1320.0, 1.2),
    "impact": ("emphasis", 0.6, 180.0, 60.0, 9.0),
    "tick": ("rhythm", 0.18, 1800.0, 1600.0, 26.0),
}


def bed_name(bpm: int) -> str:
    return f"pulse-{int(bpm)}bpm"


def _write_wav(samples: list[float]) -> bytes:
    """Pack mono float samples in [-1, 1] into a stereo 16-bit PCM WAV."""
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(CHANNELS)
        handle.setsampwidth(SAMPLE_WIDTH)
        handle.setframerate(SAMPLE_RATE)
        frames = bytearray()
        for value in samples:
            clipped = max(-1.0, min(1.0, value))
            packed = struct.pack("<h", int(clipped * _PEAK))
            frames += packed * CHANNELS
        handle.writeframes(bytes(frames))
    return buffer.getvalue()


def synthesize_bed(bpm: int, duration_seconds: float) -> bytes:
    """A click-and-pad bed whose transients sit exactly on the BPM grid."""
    beat_seconds = 60.0 / max(1, bpm)
    total = max(1, int(duration_seconds * SAMPLE_RATE))
    samples: list[float] = []
    for index in range(total):
        t = index / SAMPLE_RATE
        # Two-note pad, slowly detuned so it does not sound like a test tone.
        pad = 0.20 * math.sin(2 * math.pi * 110.0 * t) + 0.12 * math.sin(
            2 * math.pi * 164.81 * t
        )
        # Percussive click, retriggered every beat with an exponential decay.
        phase = t % beat_seconds
        downbeat = int(t / beat_seconds) % 4 == 0
        click = (
            (0.5 if downbeat else 0.28)
            * math.sin(2 * math.pi * (1200.0 if downbeat else 900.0) * phase)
            * math.exp(-24.0 * phase / beat_seconds)
        )
        # Gentle fade at both ends so the mux never starts or ends on a pop.
        fade = min(1.0, t / 0.35, max(0.0, (duration_seconds - t)) / 0.6)
        samples.append((pad + click) * fade)
    return _write_wav(samples)


def synthesize_sfx(recipe: tuple[str, float, float, float, float]) -> bytes:
    _category, seconds, start_hz, end_hz, decay = recipe
    total = max(1, int(seconds * SAMPLE_RATE))
    samples: list[float] = []
    for index in range(total):
        t = index / SAMPLE_RATE
        progress = index / total
        frequency = start_hz + (end_hz - start_hz) * progress
        samples.append(0.6 * math.sin(2 * math.pi * frequency * t) * math.exp(-decay * t))
    return _write_wav(samples)


def wav_duration_seconds(data: bytes) -> float | None:
    """Exact duration of a WAV, or None when the bytes are not a readable WAV.

    None means "unmeasurable here", not "zero": an uploaded MP3 bed is perfectly
    usable, it just cannot be probed with the standard library. Callers treat
    unmeasurable as acceptable because `service/encode.py` pads a short bed with
    silence rather than letting it shorten the video.
    """
    try:
        with wave.open(io.BytesIO(data), "rb") as handle:
            rate = handle.getframerate()
            if rate <= 0:
                return None
            return handle.getnframes() / float(rate)
    except (wave.Error, EOFError, OSError):
        return None


def candidate_beds(product: str, bpm: int) -> list[str]:
    """Beds under `assets/<product>/audio/bgm/` that may serve this job, best first.

    A **user-uploaded** bed wins over our synthesized one: that is the documented
    promise of Ingest -> "Audio bed", and honouring it here is what makes the
    prefix, not a filename convention, the source of truth.

    Synthesized beds for a *different* BPM are excluded — their clicks would land
    off this job's beat grid, which is the one thing the bed exists to get right.
    """
    own = bgm_key(product, bed_name(bpm))
    rows = [
        row["Key"]
        for row in list_keys(bgm_prefix(product))
        if row["Key"].lower().endswith(AUDIO_EXTENSIONS)
        and int(row.get("Size") or 0) <= MAX_BED_BYTES
    ]
    uploaded = sorted(key for key in rows if not _SYNTH_BED_RE.search(key))
    return uploaded + [key for key in rows if key == own]


def ensure_audio_bed(
    product: str, bpm: int, duration_seconds: float, local_path: Path
) -> tuple[Path, str]:
    """Make a bed that covers `duration_seconds` available locally and in B2.

    Returns (local path, B2 key). The prefix — not a single conventional key — is
    scanned, so an uploaded bed is really used and a bed left over from a shorter
    pass is really replaced.

    Reuse is **duration-aware**. Keying only on BPM was a silent truncation bug:
    an 8s bed from `pnpm run make-demo-assets` would be reused for a 36.2s pass
    and `ffmpeg -shortest` would cut the MP4 to 8s while every frame still
    rendered and uploaded. A bed measurably shorter than the pass is therefore
    skipped and re-synthesized at the pass length (plus a little headroom so
    rounding can never leave it a hair short).
    """
    local_path.parent.mkdir(parents=True, exist_ok=True)
    required = max(0.0, float(duration_seconds))

    for candidate in candidate_beds(product, bpm):
        data = get_object_bytes(candidate)
        measured = wav_duration_seconds(data)
        if measured is not None and measured < required - _DURATION_TOLERANCE:
            logger.info(
                "Audio bed too short for this pass, skipping: key=%s bed=%.2fs pass=%.2fs",
                candidate,
                measured,
                required,
            )
            continue
        local_path.write_bytes(data)
        logger.info(
            "Reusing audio bed: key=%s bed=%s pass=%.2fs",
            candidate,
            f"{measured:.2f}s" if measured is not None else "unmeasured",
            required,
        )
        return local_path, candidate

    key = bgm_key(product, bed_name(bpm))
    data = synthesize_bed(bpm, required + BED_HEADROOM_SECONDS)
    local_path.write_bytes(data)
    upload_bytes(data, key, "audio/wav")
    logger.info(
        "Synthesized audio bed: key=%s bytes=%d bpm=%d seconds=%.2f",
        key,
        len(data),
        bpm,
        required + BED_HEADROOM_SECONDS,
    )
    return local_path, key


def ensure_local_sfx(product: str, sfx_id: str, out_dir: Path) -> Path | None:
    """Local WAV for one SFX id, synthesizing + uploading it if B2 lacks it.

    Returns None for an unknown id (including `"none"`), so a storyboard row the
    library no longer offers degrades to "no cue" instead of failing the pass.
    """
    recipe = SFX_RECIPES.get(sfx_id)
    if recipe is None:
        return None
    path = out_dir / f"sfx-{sfx_id}.wav"
    if path.exists():
        return path

    key = sfx_key(product, recipe[0], sfx_id)
    if [row for row in list_keys(key) if row["Key"] == key]:
        data = get_object_bytes(key)
    else:
        data = synthesize_sfx(recipe)
        upload_bytes(data, key, "audio/wav")
        logger.info("Synthesized SFX: key=%s bytes=%d", key, len(data))
    out_dir.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path


def ensure_sfx_pack(product: str) -> list[dict]:
    """Synthesize and upload the three SFX one-shots. Idempotent.

    Returns one row per SFX with its key and a presigned inline URL so the asset
    library can play them without the bucket being public.
    """
    out: list[dict] = []
    for sfx_id, recipe in SFX_RECIPES.items():
        key = sfx_key(product, recipe[0], sfx_id)
        if not [row for row in list_keys(key) if row["Key"] == key]:
            data = synthesize_sfx(recipe)
            upload_bytes(data, key, "audio/wav")
            logger.info("Synthesized SFX: key=%s bytes=%d", key, len(data))
        out.append(
            {"id": sfx_id, "key": key, "url": get_presigned_inline_url(key)}
        )
    return out
