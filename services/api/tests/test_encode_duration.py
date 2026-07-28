"""The delivered MP4 must be exactly as long as the frames it was built from.

Regression suite for a real shipped defect: `-af apad` (unbounded) plus
`-shortest` does NOT bound the output. Bare `apad` pads audio *indefinitely* and
`-shortest` is then limited by ffmpeg's sync-queue buffer
(`-shortest_buf_duration`, default 10s), so a 180-frame / 6.00s pass with the
6.5s synthesized bed muxed into a **10.84s** container — ~4.8s of frozen outro
frame plus silence shipped in the artifact a user posts. Verified against
ffmpeg 7.1.

No ffmpeg here: the argv is the contract, so the argv is what is asserted.
"""

from pathlib import Path

import pytest

from app.service import encode


@pytest.fixture
def captured(monkeypatch, tmp_path):
    """Capture the argv `encode_variant` would hand ffmpeg."""
    calls: list[list[str]] = []

    def fake_run(args, timeout, what):
        calls.append(list(args))
        Path(args[-1]).write_bytes(b"fake-mp4")

    monkeypatch.setattr(encode, "resolve_ffmpeg", lambda: "/fake/ffmpeg")
    monkeypatch.setattr(encode, "_run", fake_run)
    return calls


def _bed(tmp_path: Path) -> Path:
    path = tmp_path / "bed.wav"
    path.write_bytes(b"RIFF-not-really-a-wav")
    return path


def test_audio_length_is_bounded_to_the_visual_duration(captured, tmp_path):
    encode.encode_variant(
        tmp_path / "frames",
        tmp_path / "out.mp4",
        fps=30,
        audio_path=_bed(tmp_path),
        total_frames=180,
    )
    args = captured[0]
    # 180 frames at 30fps is exactly 6s: apad may not pad past it, and -t caps
    # the muxer so a longer bed cannot extend the container either.
    assert "apad=whole_dur=6.000000" in args
    assert args[args.index("-t") + 1] == "6.000000"


def test_a_longer_pass_gets_a_longer_bound(captured, tmp_path):
    encode.encode_variant(
        tmp_path / "frames",
        tmp_path / "out.mp4",
        fps=30,
        audio_path=_bed(tmp_path),
        total_frames=1086,
    )
    args = captured[0]
    assert "apad=whole_dur=36.200000" in args
    assert args[args.index("-t") + 1] == "36.200000"


def test_unbounded_apad_is_never_emitted_when_the_frame_count_is_known(
    captured, tmp_path
):
    encode.encode_variant(
        tmp_path / "frames",
        tmp_path / "out.mp4",
        fps=30,
        audio_path=_bed(tmp_path),
        total_frames=180,
    )
    # Bare "apad" is the bug; it must not survive anywhere in the argv.
    assert "apad" not in captured[0]


def test_muted_variants_still_carry_no_audio_stream(captured, tmp_path):
    encode.encode_variant(
        tmp_path / "frames",
        tmp_path / "out.mp4",
        fps=30,
        audio_path=_bed(tmp_path),
        muted=True,
        total_frames=180,
    )
    args = captured[0]
    assert "-an" in args
    # `-t` is pointless without an audio stream that could outrun the video.
    assert "-t" not in args


def test_an_unknown_frame_count_falls_back_to_shortest(captured, tmp_path):
    encode.encode_variant(
        tmp_path / "frames",
        tmp_path / "out.mp4",
        fps=30,
        audio_path=_bed(tmp_path),
    )
    args = captured[0]
    assert "apad" in args
    assert "-shortest" in args
    assert "-t" not in args
