"""A chosen per-shot SFX must reach the delivered audio track.

Regression suite for a silent no-op: the storyboard editor exposed a per-shot SFX
`Select`, `PATCH /promos/{id}` stored it, the timeline badged it and the three
one-shot WAVs really existed in B2 — but nothing ever read `shot.sfx` on the way
to an output. `render_payload.py` forwarded it to Node, no shot card consumed it,
PNG frames carry no audio, and `encode_variant()` only ever saw the bed. The
delivered MP4's audio was byte-identical to the plain bed.

No ffmpeg and no B2: the cue list and the ffmpeg argv are the contract.
"""

from datetime import UTC, datetime
from pathlib import Path

import pytest

from app.service import audio, audio_mix, encode
from app.types.promo import Shot, Storyboard


def _storyboard(sfx: list[str], fps: int = 30, duration: int = 30) -> Storyboard:
    now = datetime.now(UTC)
    return Storyboard(
        job_id="jobabc123",
        product="demo-product",
        title="Ship faster",
        preset="release-teaser",
        created_at=now,
        updated_at=now,
        bpm=120,
        fps=fps,
        width=1280,
        height=720,
        variants=["master-16x9"],
        shots=[
            Shot(
                card="paper-title-card",
                **{"from": index * duration},
                duration_frames=duration,
                sfx=value,
            )
            for index, value in enumerate(sfx)
        ],
    )


def test_only_shots_with_an_sfx_become_cues():
    storyboard = _storyboard(["none", "impact", "", "tick"])
    assert audio_mix.sfx_cues(storyboard) == [(1.0, "impact"), (3.0, "tick")]


def test_a_cue_offset_is_the_shots_beat_snapped_start():
    # Shot 03 of a 30-frame-per-shot storyboard at 30fps starts at 2.0s.
    storyboard = _storyboard(["none", "none", "impact"])
    assert audio_mix.sfx_cues(storyboard) == [(2.0, "impact")]


def test_a_cue_past_the_end_of_the_pass_is_dropped():
    storyboard = _storyboard(["impact"])
    # Pretend the shot starts after the pass ends (defensive: a hand-edited
    # storyboard, or a duration recomputed smaller than a stored `from`).
    storyboard.shots[0].from_frame = 999
    assert audio_mix.sfx_cues(storyboard) == []


def test_no_sfx_means_the_plain_bed_and_no_extra_ffmpeg_pass(monkeypatch, tmp_path):
    bed = tmp_path / "bed.wav"
    bed.write_bytes(b"bed")
    monkeypatch.setattr(
        audio_mix, "mix_audio_cues", lambda *a, **k: pytest.fail("must not mix")
    )
    assert audio_mix.build_pass_audio(_storyboard(["none"]), bed, tmp_path) is bed


def test_cues_are_delayed_to_their_offset_and_mixed_without_ducking(
    monkeypatch, tmp_path
):
    bed = tmp_path / "bed.wav"
    bed.write_bytes(b"bed")
    fetched: list[str] = []

    def fake_local_sfx(product: str, sfx_id: str, out_dir: Path) -> Path:
        fetched.append(sfx_id)
        path = out_dir / f"sfx-{sfx_id}.wav"
        path.write_bytes(b"cue")
        return path

    calls: list[list[str]] = []

    def fake_run(args, timeout, what):
        calls.append(list(args))
        Path(args[-1]).write_bytes(b"mixed")

    monkeypatch.setattr(audio, "ensure_local_sfx", fake_local_sfx)
    monkeypatch.setattr(encode, "resolve_ffmpeg", lambda: "/fake/ffmpeg")
    monkeypatch.setattr(encode, "_run", fake_run)

    storyboard = _storyboard(["none", "impact", "none", "riser"])
    out = audio_mix.build_pass_audio(storyboard, bed, tmp_path)

    assert out.name == "bed-with-sfx.wav"
    assert fetched == ["impact", "riser"]
    graph = calls[0][calls[0].index("-filter_complex") + 1]
    # 1.0s and 3.0s -> 1000ms and 3000ms, every channel delayed together.
    assert "adelay=delays=1000:all=1" in graph
    assert "adelay=delays=3000:all=1" in graph
    # normalize=0 or the bed gets divided by the input count and audibly ducks.
    assert "amix=inputs=3:normalize=0:duration=first" in graph
    # The mix is exactly as long as the pass (4 shots x 30 frames at 30fps = 4s).
    assert calls[0][calls[0].index("-t") + 1] == "4.000000"


def test_an_unknown_sfx_id_degrades_to_the_plain_bed(monkeypatch, tmp_path):
    bed = tmp_path / "bed.wav"
    bed.write_bytes(b"bed")
    monkeypatch.setattr(audio, "ensure_local_sfx", lambda *a, **k: None)
    monkeypatch.setattr(
        audio_mix, "mix_audio_cues", lambda *a, **k: pytest.fail("must not mix")
    )
    storyboard = _storyboard(["retired-sfx-id"])
    assert audio_mix.build_pass_audio(storyboard, bed, tmp_path) is bed


def test_ensure_local_sfx_synthesizes_and_uploads_when_b2_lacks_it(
    monkeypatch, tmp_path
):
    uploaded: list[str] = []
    monkeypatch.setattr(audio, "list_keys", lambda prefix: [])
    monkeypatch.setattr(
        audio, "upload_bytes", lambda data, key, ct: uploaded.append(key) or len(data)
    )
    monkeypatch.setattr(audio, "SAMPLE_RATE", 8_000)

    path = audio.ensure_local_sfx("demo-product", "impact", tmp_path)

    assert path is not None and path.exists()
    assert uploaded == ["assets/demo-product/audio/sfx/emphasis/impact.wav"]


def test_ensure_local_sfx_returns_none_for_a_non_sfx_id(tmp_path):
    assert audio.ensure_local_sfx("demo-product", "none", tmp_path) is None


def test_pass_audio_track_is_none_when_every_variant_is_muted(monkeypatch, tmp_path):
    """No bed is synthesized and no B2 round trip happens — `-an` is what they get."""
    storyboard = _storyboard(["impact"])
    storyboard.variants = ["loop-muted-16x9"]
    monkeypatch.setattr(
        audio_mix, "ensure_audio_bed", lambda *a, **k: pytest.fail("must not touch B2")
    )
    assert audio_mix.pass_audio_track(storyboard, tmp_path) is None


def test_pass_audio_track_beds_then_mixes_for_an_unmuted_variant(monkeypatch, tmp_path):
    storyboard = _storyboard(["none", "impact"])
    storyboard.variants = ["loop-muted-16x9", "master-16x9"]  # one unmuted is enough
    calls = {}

    def fake_bed(product, bpm, seconds, path):
        calls["bed"] = (product, bpm, round(seconds, 3))
        path.write_bytes(b"bed")
        return path, "assets/x/audio/bgm/pulse-120bpm.wav"

    def fake_mix(bed, cues, out, duration):
        calls["mix"] = [offset for offset, _path in cues]
        calls["mix_duration"] = duration
        return out

    monkeypatch.setattr(audio_mix, "ensure_audio_bed", fake_bed)
    monkeypatch.setattr(audio_mix, "mix_audio_cues", fake_mix)
    monkeypatch.setattr(audio, "ensure_local_sfx", lambda p, i, d: d / f"sfx-{i}.wav")
    out = audio_mix.pass_audio_track(storyboard, tmp_path)

    # The bed is requested for the FULL pass length, never a shorter hint.
    assert calls["bed"] == ("demo-product", 120, 2.0)
    assert calls["mix"] == [1.0]
    assert calls["mix_duration"] == 2.0
    assert out is not None
