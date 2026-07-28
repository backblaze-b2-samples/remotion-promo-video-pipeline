"""ffmpeg: PNG sequence + audio bed -> H.264/AAC MP4, plus poster extraction.

ffmpeg is resolved in three steps so a fresh clone needs no system install:

1. `FFMPEG_BINARY` — explicit override wins.
2. The `imageio-ffmpeg` wheel's bundled static build (a declared requirement).
3. `ffmpeg` on `PATH`.

If all three fail the error names all three, because "ffmpeg not found" with no
remedy is the single most common way a render pipeline wastes someone's evening.
"""

import functools
import logging
import shutil
import subprocess
from pathlib import Path

from app.config import settings
from app.types.keys import FRAME_NUMBER_DIGITS

logger = logging.getLogger(__name__)

# A 1086-frame 1080p encode is comfortably under a minute on a laptop; the
# ceiling exists so a wedged ffmpeg can never hang the single pass worker.
ENCODE_TIMEOUT_SECONDS = 1800
POSTER_TIMEOUT_SECONDS = 120


class BinaryMissingError(RuntimeError):
    """Raised when a required external binary cannot be resolved."""


@functools.lru_cache(maxsize=1)
def resolve_ffmpeg() -> str:
    """Absolute path to a usable ffmpeg. Raises BinaryMissingError."""
    if settings.ffmpeg_binary:
        configured = shutil.which(settings.ffmpeg_binary) or settings.ffmpeg_binary
        if Path(configured).exists():
            return configured
        raise BinaryMissingError(
            f"FFMPEG_BINARY points at '{settings.ffmpeg_binary}', which does not exist. "
            "Fix the path in .env, or unset it to use the bundled imageio-ffmpeg build."
        )

    try:
        import imageio_ffmpeg

        bundled = imageio_ffmpeg.get_ffmpeg_exe()
        if bundled and Path(bundled).exists():
            return bundled
    except Exception:  # any failure here just means "try the next option"
        logger.warning("Bundled imageio-ffmpeg unavailable; falling back to PATH")

    on_path = shutil.which("ffmpeg")
    if on_path:
        return on_path

    raise BinaryMissingError(
        "No ffmpeg found. Tried: FFMPEG_BINARY (unset), the bundled imageio-ffmpeg "
        "build (run `pnpm run setup` to install services/api/requirements.txt), and "
        "`ffmpeg` on PATH (`brew install ffmpeg` / `apt install ffmpeg`)."
    )


def _run(args: list[str], timeout: int, what: str) -> None:
    result = subprocess.run(  # argv list, never a shell string
        args,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
    if result.returncode != 0:
        tail = (result.stderr or "").strip().splitlines()[-6:]
        raise RuntimeError(f"{what} failed (exit {result.returncode}): {' | '.join(tail)}")


def encode_variant(
    frames_dir: Path,
    out_path: Path,
    fps: int,
    audio_path: Path | None = None,
    muted: bool = False,
    total_frames: int | None = None,
) -> int:
    """Mux the PNG sequence (+ audio bed) into an MP4. Returns bytes written.

    Muted variants (the autoplaying hero loop) are encoded with `-an` rather
    than a silent track: no audio stream at all is what browsers want for
    `autoplay`.

    `total_frames` is the pass's frame count. Passing it makes the output
    duration EXACT — see the comment on the audio arguments below, and
    `tests/test_encode_duration.py`.
    """
    ffmpeg = resolve_ffmpeg()
    use_audio = audio_path is not None and not muted and audio_path.exists()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    visual_seconds = (
        total_frames / max(1, fps) if total_frames and total_frames > 0 else None
    )

    args = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-framerate",
        str(fps),
        "-start_number",
        "0",
        "-i",
        str(frames_dir / f"frame-%0{FRAME_NUMBER_DIGITS}d.png"),
    ]
    if use_audio:
        args += ["-i", str(audio_path)]
    args += [
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
    ]
    # Output duration must equal the *visual* duration, whatever the bed's length.
    #
    # `-af apad` (unbounded) + `-shortest` is NOT enough and shipped a real bug:
    # bare `apad` pads audio *indefinitely*, and `-shortest` is then bounded by
    # ffmpeg's sync-queue buffer (`-shortest_buf_duration`, default 10s), so a
    # 6.00s / 180-frame pass with a 6.5s synthesized bed muxed to a **10.84s**
    # container — ~4.8s of frozen outro frame plus silence in the artifact a user
    # posts. Reproduced on ffmpeg 7.1; see tests/test_encode_duration.py.
    #
    # The fix is to make the target length explicit instead of implied:
    #   -af apad=whole_dur=D  pads a SHORT bed with silence up to exactly D (so a
    #                         bed that cannot be probed can never end the output
    #                         early) and never pads past it
    #   -t D                  hard-caps the output, so a LONGER bed is trimmed
    #                         deterministically rather than via `-shortest`
    # `-shortest` stays as the fallback when the frame count is unknown.
    if not use_audio:
        args += ["-an"]
    elif visual_seconds is None:
        args += ["-af", "apad", "-c:a", "aac", "-b:a", "128k", "-shortest"]
    else:
        args += [
            "-af",
            f"apad=whole_dur={visual_seconds:.6f}",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-shortest",
            "-t",
            f"{visual_seconds:.6f}",
        ]
    args += [str(out_path)]

    _run(args, ENCODE_TIMEOUT_SECONDS, "ffmpeg encode")
    size = out_path.stat().st_size
    logger.info(
        "Encoded variant: out=%s bytes=%d audio=%s", out_path.name, size, use_audio
    )
    return size


def mix_audio_cues(
    bed_path: Path,
    cues: list[tuple[float, Path]],
    out_path: Path,
    duration_seconds: float,
) -> Path:
    """Overlay one-shot SFX onto the bed at fixed offsets. Returns `out_path`.

    Emitted as PCM WAV, so the result is just another bed as far as
    `encode_variant` is concerned and it is built once per pass rather than once
    per variant. Two filter details are load-bearing:

    * `adelay=...:all=1` delays every channel, so a cue does not drift between
      the left and right channels of the stereo bed.
    * `amix=normalize=0` keeps the bed at its authored level. The default
      (`normalize=1`) divides every input by the input count, so adding one
      one-shot would audibly duck the whole bed.

    A cue whose offset is past the end of the pass is dropped by the caller;
    `duration=first` plus `-t` keeps the mix exactly as long as the bed.
    """
    if not cues:
        return bed_path
    ffmpeg = resolve_ffmpeg()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    args = [ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-i", str(bed_path)]
    for _offset, cue_path in cues:
        args += ["-i", str(cue_path)]

    chains = [
        f"[{index}:a]adelay=delays={round(offset * 1000)}:all=1[cue{index}]"
        for index, (offset, _path) in enumerate(cues, start=1)
    ]
    labels = "".join(f"[cue{index}]" for index in range(1, len(cues) + 1))
    graph = ";".join(
        [*chains, f"[0:a]{labels}amix=inputs={len(cues) + 1}:normalize=0:duration=first[mix]"]
    )
    args += [
        "-filter_complex",
        graph,
        "-map",
        "[mix]",
        "-c:a",
        "pcm_s16le",
        "-t",
        f"{max(0.0, duration_seconds):.6f}",
        str(out_path),
    ]
    _run(args, POSTER_TIMEOUT_SECONDS, "ffmpeg audio mix")
    logger.info("Mixed SFX into the bed: cues=%d out=%s", len(cues), out_path.name)
    return out_path


def extract_poster(frame_path: Path, out_path: Path) -> int:
    """Convert one rendered PNG frame into a JPEG poster. Returns bytes written.

    Taken from an existing frame rather than by seeking the MP4: the frame is
    already on disk, so this is a cheap transcode with no decode pass, and the
    `/promos` list gets real media instead of a placeholder box.
    """
    ffmpeg = resolve_ffmpeg()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    _run(
        [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(frame_path),
            "-q:v",
            "3",
            str(out_path),
        ],
        POSTER_TIMEOUT_SECONDS,
        "ffmpeg poster extraction",
    )
    return out_path.stat().st_size


def poster_frame_number(total_frames: int) -> int:
    """Pick a representative frame: 20% in, never the black first frame."""
    if total_frames <= 1:
        return 0
    return min(total_frames - 1, max(1, int(total_frames * 0.2)))
