"""Beat-grid snapping. Pure — no B2, no ffmpeg, no render."""

import pytest

from app.types.beatgrid import (
    MIN_SHOT_FRAMES,
    beat_frames,
    frames_per_beat,
    snap_storyboard,
    with_start_frames,
)


def test_frames_per_beat_at_30fps_120bpm():
    assert frames_per_beat(30, 120) == 15.0


def test_frames_per_beat_rejects_nonsense():
    with pytest.raises(ValueError):
        frames_per_beat(0, 120)
    with pytest.raises(ValueError):
        frames_per_beat(30, 0)


def test_beat_frames_land_on_the_grid():
    assert beat_frames(30, 120, 61) == [0, 15, 30, 45, 60]


def test_snap_preserves_total_duration():
    """The encode, the frame count and the manifest all depend on the total."""
    durations = [30, 24, 36, 30, 30, 30]  # release-teaser, 180 frames
    snapped = snap_storyboard(durations, fps=30, bpm=120)
    assert sum(snapped) == sum(durations) == 180
    assert len(snapped) == len(durations)


def test_snap_pulls_boundaries_onto_the_beat():
    # 30fps @ 120bpm -> a beat every 15 frames. 22 is 7 off the grid.
    snapped = snap_storyboard([22, 38], fps=30, bpm=120)
    assert snapped == [15, 45]
    assert sum(snapped) == 60


def test_snap_keeps_every_shot_renderable():
    """A snap must never collapse a shot to zero frames."""
    snapped = snap_storyboard([7, 7, 7, 7, 100], fps=30, bpm=120)
    assert all(duration >= MIN_SHOT_FRAMES for duration in snapped)
    assert sum(snapped) == 128


def test_snap_leaves_impossible_input_untouched():
    """Below MIN_SHOT_FRAMES per shot, snapping cannot be represented."""
    durations = [1, 1, 1]
    assert snap_storyboard(durations, fps=30, bpm=120) == durations


def test_snap_handles_edge_shapes():
    assert snap_storyboard([], 30, 120) == []
    assert snap_storyboard([180], 30, 120) == [180]


def test_snap_at_a_different_tempo():
    # 128 BPM at 30fps -> 14.0625 frames per beat.
    snapped = snap_storyboard([30, 30, 30], fps=30, bpm=128)
    assert sum(snapped) == 90
    assert snapped != [30, 30, 30]  # boundaries really moved


def test_with_start_frames_accumulates():
    assert with_start_frames([30, 24, 36]) == [(0, 30), (30, 24), (54, 36)]
