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
"""

import io
import logging
import math
import struct
import wave
from pathlib import Path

from app.repo import get_object_bytes, get_presigned_inline_url, list_keys, upload_bytes
from app.types.keys import bgm_key, sfx_key

logger = logging.getLogger(__name__)

SAMPLE_RATE = 44_100
CHANNELS = 2
SAMPLE_WIDTH = 2  # 16-bit PCM
_PEAK = 32_767

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


def ensure_audio_bed(
    product: str, bpm: int, duration_seconds: float, local_path: Path
) -> tuple[Path, str]:
    """Make the bed available locally and in B2. Returns (local path, B2 key).

    Reuses the bed already in B2 when one exists for this product+BPM — the same
    bed is correct for every pass at that tempo, so re-synthesizing it would
    just churn the bucket.
    """
    key = bgm_key(product, bed_name(bpm))
    local_path.parent.mkdir(parents=True, exist_ok=True)

    existing = [row for row in list_keys(key) if row["Key"] == key]
    if existing:
        local_path.write_bytes(get_object_bytes(key))
        return local_path, key

    data = synthesize_bed(bpm, duration_seconds)
    local_path.write_bytes(data)
    upload_bytes(data, key, "audio/wav")
    logger.info("Synthesized audio bed: key=%s bytes=%d bpm=%d", key, len(data), bpm)
    return local_path, key


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
