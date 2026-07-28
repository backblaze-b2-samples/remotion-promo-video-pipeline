"""Per-shot SFX -> the pass audio track.

The storyboard editor has always exposed a per-shot SFX `Select` (No SFX /
Riser / Impact / Tick) and the timeline badges the chosen id, but the choice used
to reach **nothing**: `service/render_payload.py` forwards `sfx` to Node, no shot
card reads it, PNG frames carry no audio, and `encode_variant()` only ever saw
the bed. A user could set shot 03 to `impact`, save revision 2, render, and the
delivered MP4's audio was byte-identical to the plain bed.

This module closes that gap. Shots are already beat-snapped at authoring time
(`types/beatgrid.py`), so a cue's offset is exactly `shot.from / fps` — the
one-shot lands on the same grid click the bed was synthesized against, with no
second timing model to keep in sync.

The mix is built **once per pass** (not per variant) because every variant of a
pass shares one audio track; muted variants are encoded with `-an` and never see
it at all.
"""

import logging
from pathlib import Path

from app.service import audio
from app.service.audio import ensure_audio_bed
from app.service.encode import mix_audio_cues
from app.types.promo import Storyboard
from app.types.variants import tier_from_master, variant_spec

logger = logging.getLogger(__name__)

# Ids that mean "no cue on this shot".
NO_SFX = frozenset({"", "none"})


def sfx_cues(storyboard: Storyboard) -> list[tuple[float, str]]:
    """(offset in seconds, sfx id) for every shot carrying an SFX.

    A cue at or past the end of the pass is dropped: `-t` would cut it anyway,
    and keeping it would push `amix` past the bed for no audible gain.
    """
    fps = max(1, storyboard.fps)
    limit = storyboard.duration_frames / fps
    cues: list[tuple[float, str]] = []
    for shot in storyboard.shots:
        if (shot.sfx or "none") in NO_SFX:
            continue
        offset = shot.from_frame / fps
        if offset >= limit:
            continue
        cues.append((offset, shot.sfx))
    return cues


def build_pass_audio(storyboard: Storyboard, bed_path: Path, work: Path) -> Path:
    """Bed + the storyboard's SFX cues, mixed. Returns the track to encode with.

    Falls back to the plain bed when the storyboard has no SFX (the common case),
    so a promo that never touched the control pays no extra ffmpeg pass.
    """
    cues = sfx_cues(storyboard)
    if not cues:
        return bed_path

    resolved: list[tuple[float, Path]] = []
    for offset, sfx_id in cues:
        path = audio.ensure_local_sfx(storyboard.product, sfx_id, work)
        if path is None:
            logger.warning("Unknown SFX id in storyboard, skipping: sfx=%s", sfx_id)
            continue
        resolved.append((offset, path))
    if not resolved:
        return bed_path

    logger.info(
        "Mixing SFX cues into the pass bed: job_id=%s cues=%d",
        storyboard.job_id,
        len(resolved),
    )
    return mix_audio_cues(
        bed_path,
        resolved,
        work / "bed-with-sfx.wav",
        storyboard.duration_frames / max(1, storyboard.fps),
    )


def pass_audio_track(storyboard: Storyboard, work: Path) -> Path | None:
    """The one audio track this pass encodes with, or None if every variant is muted.

    Owns the whole audio side of a pass so `service/render_pass.py` stays about
    frames:

    * **Nothing at all** when every variant is muted — no bed is synthesized and
      no B2 round trip happens, because `-an` is what those variants get anyway.
    * A bed that **covers the pass**. The duration is an *input* to bed selection,
      not a hint: a bed shorter than the pass once shipped an 8s MP4 for a 36.2s
      pass, so `ensure_audio_bed` re-synthesizes rather than reuse a short one.
    * The per-shot SFX mixed in, once, since all variants share the track.
    """
    tier = tier_from_master(storyboard.width, storyboard.height)
    if all(variant_spec(variant, tier)["muted"] for variant in storyboard.variants):
        return None
    bed, _key = ensure_audio_bed(
        storyboard.product,
        storyboard.bpm,
        storyboard.duration_frames / max(1, storyboard.fps),
        work / "bed.wav",
    )
    return build_pass_audio(storyboard, bed, work)
