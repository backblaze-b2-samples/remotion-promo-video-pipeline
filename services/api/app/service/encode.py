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
) -> int:
    """Mux the PNG sequence (+ audio bed) into an MP4. Returns bytes written.

    Muted variants (the autoplaying hero loop) are encoded with `-an` rather
    than a silent track: no audio stream at all is what browsers want for
    `autoplay`.
    """
    ffmpeg = resolve_ffmpeg()
    use_audio = audio_path is not None and not muted and audio_path.exists()
    out_path.parent.mkdir(parents=True, exist_ok=True)

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
    # Output duration must equal the *visual* duration, whatever the bed's length:
    #   -shortest  trims a longer bed instead of padding the MP4 with a still frame
    #   -af apad   pads a shorter bed with silence, so audio can never end the
    #              output early (which silently truncated the video before)
    # `service/audio.py` already picks a bed long enough; apad is the belt to that
    # braces, and it covers a user-uploaded MP3 whose length cannot be probed.
    args += (
        ["-af", "apad", "-c:a", "aac", "-b:a", "128k", "-shortest"]
        if use_audio
        else ["-an"]
    )
    args += [str(out_path)]

    _run(args, ENCODE_TIMEOUT_SECONDS, "ffmpeg encode")
    size = out_path.stat().st_size
    logger.info(
        "Encoded variant: out=%s bytes=%d audio=%s", out_path.name, size, use_audio
    )
    return size


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
