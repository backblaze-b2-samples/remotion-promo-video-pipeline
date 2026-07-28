"""Beat-grid snapping. Pure functions, no I/O, no other layers.

A promo cuts on the music or it feels late. Every shot boundary is therefore
pulled to the nearest beat of the job's BPM grid, while the total duration is
preserved exactly — the encode, the frame count and the manifest all depend on
the total not drifting.

Lives at the lowest layer precisely because it is pure: `tests/test_beatgrid.py`
exercises it with no B2, no ffmpeg and no render.
"""

MIN_SHOT_FRAMES = 6


def frames_per_beat(fps: int, bpm: int) -> float:
    """Frames between two beats. 30 fps at 120 BPM -> 15.0."""
    if fps <= 0:
        raise ValueError("fps must be positive")
    if bpm <= 0:
        raise ValueError("bpm must be positive")
    return fps * 60.0 / bpm


def beat_frames(fps: int, bpm: int, total_frames: int) -> list[int]:
    """Every beat position (frame index) inside `total_frames`."""
    step = frames_per_beat(fps, bpm)
    out: list[int] = []
    index = 0
    while True:
        frame = round(index * step)
        if frame >= total_frames:
            break
        out.append(frame)
        index += 1
    return out


def snap_storyboard(durations: list[int], fps: int, bpm: int) -> list[int]:
    """Snap shot boundaries to the beat grid, preserving the total duration.

    `durations` is per-shot length in frames. The returned list has the same
    length and the same sum; only the internal boundaries move, each to the
    nearest beat, and every shot keeps at least `MIN_SHOT_FRAMES` frames so a
    snap can never collapse a shot to nothing.
    """
    if not durations:
        return []
    clean = [max(1, int(d)) for d in durations]
    total = sum(clean)
    count = len(clean)
    if count == 1:
        return [total]

    # Snapping needs at least MIN_SHOT_FRAMES per shot to be representable at
    # all; below that, hand back the input untouched rather than mangle it.
    if total < count * MIN_SHOT_FRAMES:
        return clean

    step = frames_per_beat(fps, bpm)
    boundaries: list[int] = []
    running = 0
    for index, duration in enumerate(clean[:-1]):
        running += duration
        snapped = int(round(running / step) * step)
        # Keep boundaries strictly increasing and leave room for the shots that
        # still have to fit after this one.
        floor = (boundaries[-1] if boundaries else 0) + MIN_SHOT_FRAMES
        ceiling = total - (count - index - 1) * MIN_SHOT_FRAMES
        boundaries.append(max(floor, min(snapped, ceiling)))

    out: list[int] = []
    previous = 0
    for boundary in boundaries:
        out.append(boundary - previous)
        previous = boundary
    out.append(total - previous)
    return out


def with_start_frames(durations: list[int]) -> list[tuple[int, int]]:
    """Turn durations into `(from_frame, duration)` pairs for `<Sequence>`."""
    out: list[tuple[int, int]] = []
    cursor = 0
    for duration in durations:
        out.append((cursor, duration))
        cursor += duration
    return out
