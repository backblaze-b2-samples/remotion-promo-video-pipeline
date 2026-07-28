"""Bed selection must never hand the encoder a bed shorter than the pass.

This is a regression suite for a truncation bug: `ensure_audio_bed` used to key
the bed on BPM alone and return whatever was already in the bucket, so an 8s bed
from `pnpm run make-demo-assets` was reused for a 36.2s pass and
`ffmpeg -shortest` cut the delivered MP4 to 8s while all 1,086 frames per variant
were still rendered, uploaded and counted. Nothing in the manifest revealed it.

No network, no credentials, no ffmpeg: the three repo calls `service/audio.py`
makes are replaced with an in-memory prefix.
"""

import io
import wave

import pytest

from app.service import audio
from app.types.keys import bgm_key, bgm_prefix

PRODUCT = "demo-product"
BPM = 120
# The write-amplification headliner: `ink-press-full` is 1,086 frames at 30fps.
FULL_PRESET_SECONDS = 1086 / 30


class FakeBgmPrefix:
    """Minimal stand-in for the `assets/<product>/audio/bgm/` prefix in B2."""

    def __init__(self):
        self.objects: dict[str, bytes] = {}
        self.uploads: list[str] = []

    def list_keys(self, prefix: str) -> list[dict]:
        return [
            {"Key": key, "Size": len(body), "LastModified": None}
            for key, body in sorted(self.objects.items())
            if key.startswith(prefix)
        ]

    def get_object_bytes(self, key: str) -> bytes:
        return self.objects[key]

    def upload_bytes(self, data: bytes, key: str, content_type: str) -> int:
        self.objects[key] = data
        self.uploads.append(key)
        return len(data)


@pytest.fixture
def bucket(monkeypatch):
    store = FakeBgmPrefix()
    monkeypatch.setattr(audio, "list_keys", store.list_keys)
    monkeypatch.setattr(audio, "get_object_bytes", store.get_object_bytes)
    monkeypatch.setattr(audio, "upload_bytes", store.upload_bytes)
    # 8 kHz keeps the pure-Python synthesis loop fast; every duration assertion
    # reads the WAV header, so the rate is irrelevant to what is being tested.
    monkeypatch.setattr(audio, "SAMPLE_RATE", 8_000)
    return store


def wav_seconds(data: bytes) -> float:
    with wave.open(io.BytesIO(data), "rb") as handle:
        return handle.getnframes() / handle.getframerate()


def test_wav_duration_is_read_from_the_header():
    data = audio.synthesize_bed(BPM, 1.0)
    assert audio.wav_duration_seconds(data) == pytest.approx(1.0, abs=0.01)


def test_unreadable_bytes_are_unmeasurable_not_zero_length():
    """An uploaded MP3 is usable; it just cannot be probed with `wave`."""
    assert audio.wav_duration_seconds(b"ID3\x04not-a-wav") is None


def test_bed_long_enough_is_reused_without_re_synthesizing(bucket, tmp_path):
    key = bgm_key(PRODUCT, audio.bed_name(BPM))
    bucket.objects[key] = audio.synthesize_bed(BPM, 12.0)

    path, chosen = audio.ensure_audio_bed(PRODUCT, BPM, 6.0, tmp_path / "bed.wav")

    assert chosen == key
    assert bucket.uploads == []
    assert wav_seconds(path.read_bytes()) == pytest.approx(12.0, abs=0.01)


def test_bed_shorter_than_the_pass_is_re_synthesized(bucket, tmp_path):
    key = bgm_key(PRODUCT, audio.bed_name(BPM))
    bucket.objects[key] = audio.synthesize_bed(BPM, 8.0)

    path, chosen = audio.ensure_audio_bed(PRODUCT, BPM, 18.0, tmp_path / "bed.wav")

    assert chosen == key
    assert bucket.uploads == [key]
    assert wav_seconds(path.read_bytes()) >= 18.0
    # The replacement is in the bucket too, so the next pass reuses it.
    assert wav_seconds(bucket.objects[key]) >= 18.0


def test_full_preset_pass_gets_a_bed_at_least_as_long_as_the_pass(bucket, tmp_path):
    """The exact reachable break: make-demo-assets' 8s bed + a `full` pass."""
    key = bgm_key(PRODUCT, audio.bed_name(BPM))
    bucket.objects[key] = audio.synthesize_bed(BPM, audio.DEMO_BED_SECONDS)

    path, _ = audio.ensure_audio_bed(
        PRODUCT, BPM, FULL_PRESET_SECONDS, tmp_path / "bed.wav"
    )

    assert wav_seconds(path.read_bytes()) >= FULL_PRESET_SECONDS


def test_first_pass_with_an_empty_prefix_synthesizes_the_pass_length(bucket, tmp_path):
    path, chosen = audio.ensure_audio_bed(PRODUCT, BPM, 6.0, tmp_path / "bed.wav")

    assert chosen == bgm_key(PRODUCT, audio.bed_name(BPM))
    assert bucket.uploads == [chosen]
    assert wav_seconds(path.read_bytes()) >= 6.0


def test_uploaded_bed_is_preferred_over_the_synthesized_one(bucket, tmp_path):
    """docs/LICENSING.md and the Ingest hint both promise this."""
    mine = bgm_key(PRODUCT, audio.bed_name(BPM))
    theirs = f"{bgm_prefix(PRODUCT)}licensed-track.wav"
    bucket.objects[mine] = audio.synthesize_bed(BPM, 40.0)
    bucket.objects[theirs] = audio.synthesize_bed(90, 40.0)

    _, chosen = audio.ensure_audio_bed(PRODUCT, BPM, 6.0, tmp_path / "bed.wav")

    assert chosen == theirs
    assert bucket.uploads == []


def test_uploaded_bed_that_cannot_be_probed_is_still_used(bucket, tmp_path):
    """A short MP3 is not truncating: `encode.py` pads it with `-af apad`."""
    theirs = f"{bgm_prefix(PRODUCT)}licensed-track.mp3"
    bucket.objects[theirs] = b"ID3\x04pretend-this-is-an-mp3"

    _, chosen = audio.ensure_audio_bed(PRODUCT, BPM, 6.0, tmp_path / "bed.wav")

    assert chosen == theirs
    assert bucket.uploads == []


def test_uploaded_bed_too_short_falls_back_to_a_synthesized_one(bucket, tmp_path):
    theirs = f"{bgm_prefix(PRODUCT)}licensed-track.wav"
    bucket.objects[theirs] = audio.synthesize_bed(BPM, 4.0)

    path, chosen = audio.ensure_audio_bed(PRODUCT, BPM, 18.0, tmp_path / "bed.wav")

    assert chosen == bgm_key(PRODUCT, audio.bed_name(BPM))
    assert wav_seconds(path.read_bytes()) >= 18.0


def test_a_bed_synthesized_for_another_bpm_is_never_reused(bucket, tmp_path):
    """Its clicks would sit off this job's beat grid."""
    other = bgm_key(PRODUCT, audio.bed_name(90))
    bucket.objects[other] = audio.synthesize_bed(90, 40.0)

    _, chosen = audio.ensure_audio_bed(PRODUCT, BPM, 6.0, tmp_path / "bed.wav")

    assert chosen == bgm_key(PRODUCT, audio.bed_name(BPM))
    assert bucket.uploads == [chosen]


def test_beds_of_another_product_are_out_of_scope(bucket, tmp_path):
    foreign = bgm_key("other-product", audio.bed_name(BPM))
    bucket.objects[foreign] = audio.synthesize_bed(BPM, 40.0)

    _, chosen = audio.ensure_audio_bed(PRODUCT, BPM, 6.0, tmp_path / "bed.wav")

    assert chosen.startswith(bgm_prefix(PRODUCT))
    assert chosen != foreign


def test_a_bed_over_the_size_ceiling_is_ignored(bucket, tmp_path, monkeypatch):
    monkeypatch.setattr(audio, "MAX_BED_BYTES", 1_000)
    theirs = f"{bgm_prefix(PRODUCT)}huge-track.wav"
    bucket.objects[theirs] = audio.synthesize_bed(BPM, 40.0)

    _, chosen = audio.ensure_audio_bed(PRODUCT, BPM, 6.0, tmp_path / "bed.wav")

    assert chosen == bgm_key(PRODUCT, audio.bed_name(BPM))


def test_non_audio_objects_in_the_prefix_are_ignored(bucket, tmp_path):
    bucket.objects[f"{bgm_prefix(PRODUCT)}notes.txt"] = b"not audio"

    _, chosen = audio.ensure_audio_bed(PRODUCT, BPM, 6.0, tmp_path / "bed.wav")

    assert chosen == bgm_key(PRODUCT, audio.bed_name(BPM))


def test_sfx_pack_is_idempotent(bucket, monkeypatch):
    monkeypatch.setattr(
        audio, "get_presigned_inline_url", lambda key, *a, **k: f"https://signed/{key}"
    )
    first = audio.ensure_sfx_pack(PRODUCT)
    uploaded_once = list(bucket.uploads)
    second = audio.ensure_sfx_pack(PRODUCT)

    assert [row["id"] for row in first] == list(audio.SFX_RECIPES)
    assert [row["key"] for row in second] == [row["key"] for row in first]
    assert bucket.uploads == uploaded_once  # nothing re-uploaded
