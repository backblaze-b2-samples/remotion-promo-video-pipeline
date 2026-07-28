<!-- last_verified: 2026-07-28 -->
# Feature: Encode & Per-Platform Variants

## Purpose
Mux the PNG sequence with a beat-locked audio bed into an H.264/AAC MP4, and
deliver four platform cutdowns that are **real re-renders** at each variant's
dimensions rather than crops of the master.

## Used By
- UI: `/promos/[id]` per-variant `<video>` players and poster thumbnails
- API: part of `POST /promos/{id}/render`; playback URLs from `GET /promos/{id}`
- Job: `app.service.render_pass` (inside the single pass worker)

## Core Functions
- `app.service.encode.resolve_ffmpeg` — `FFMPEG_BINARY` -> bundled
  `imageio-ffmpeg` -> `ffmpeg` on `PATH`
- `app.service.encode.encode_variant` — frames (+ audio) -> MP4
- `app.service.encode.extract_poster` / `poster_frame_number` — a JPEG poster from
  a representative frame (20% in, never the black first frame)
- `app.service.audio.ensure_audio_bed` — synthesize/reuse the WAV bed at the job BPM
- `app.types.variants.variant_geometry` — variant id + tier -> even pixel dimensions
- `packages/remotion/src/Root.tsx` `calculateMetadata` — the per-variant frame size

## Canonical Files
- Pattern exemplar: `services/api/app/service/encode.py`
- Variant geometry, one definition per language: `packages/shared/src/variants.json`,
  read by `services/api/app/types/variants.py` and
  `packages/remotion/src/lib/variant.ts`

## Inputs
- A complete local frame sequence for one variant (`frame-%06d.png`, from 0)
- fps: int (30 by default)
- audio bed: a local WAV path, or none for a muted variant
- variant id: `master-16x9` | `vertical-9x16` | `square-1x1` | `loop-muted-16x9`

## Outputs
- `renders/<job-id>/<variant>.mp4` — H.264 (`libx264`, CRF 20, `yuv420p`,
  `+faststart`) + AAC 128k, or `-an` for the muted loop
- `renders/<job-id>/<variant>.poster.jpg`
- `assets/<product>/audio/bgm/pulse-<bpm>bpm.wav` on first use
- Byte totals fed into the pass's manifest entry

## Flow
- Resolve ffmpeg once per process (`lru_cache`)
- Ensure the audio bed exists: reuse the object already in
  `assets/<product>/audio/bgm/` for this BPM, else synthesize a WAV and upload it
- `ffmpeg -framerate <fps> -start_number 0 -i frame-%06d.png [-i bed.wav] …` with
  `-shortest` so a longer bed is trimmed to the visual duration
- Muted variants get `-an` (no audio stream at all — what browsers want for
  `autoplay`), not a silent track
- Extract the poster from an already-on-disk frame (a cheap transcode, no decode pass)
- Upload the MP4 and poster, then delete the local frame directory — the frames are
  in B2

## Edge Cases
- No ffmpeg anywhere -> `503` naming all three lookup locations and how to install
- `FFMPEG_BINARY` set to a nonexistent path -> `503`, distinct message
- Odd variant dimensions -> impossible: geometry is rounded to even (`x264` requires it)
- Muted variant -> no audio bed is synthesized at all if *every* variant is muted
- Encode timeout (30 min) / render timeout (60 min) -> the child is killed so the
  single worker is never held forever
- 1-frame storyboard -> the poster is frame 0

## UX States (if applicable)
- Empty: "No rendered variants yet" pointing at Render
- Loading: **Muxing frames + audio with ffmpeg** / **Uploading the variant + poster**
- Error: the pass fails with the tail of ffmpeg's stderr in the progress panel

## Verification
- Test files: `services/api/tests/test_binary_resolution.py`,
  `services/api/tests/test_shot_library.py` (geometry, even dimensions, muted set)
- Required cases: bundled ffmpeg resolves on a fresh clone; a bad override is
  actionable; 16:9/9:16/1:1 geometry at both tiers; every dimension even; only
  `loop-muted-16x9` is muted; the poster frame is never frame 0 for a real duration
- Focused verify command: `cd services/api && .venv/bin/python -m pytest tests/test_binary_resolution.py -q`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` when E2E/live prerequisites apply
- **Manual:** after a real pass, both variants must play inline on `/promos/[id]`
  and `renders/<job>/` must hold two MP4s and two posters.
- Pass criteria: MP4s play in a browser, posters are real frames, and
  `vertical-9x16` really is 720x1280 pixels (not a letterboxed master)

## Related Docs
- [README.md](../../README.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [frame-rendering.md](frame-rendering.md)
- [../LICENSING.md](../LICENSING.md) — why the audio is synthesized, not vendored
