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
- `app.service.encode.encode_variant` — frames (+ audio) -> MP4, bounded to
  `total_frames / fps`
- `app.service.encode.mix_audio_cues` — bed + delayed one-shots -> one PCM WAV
- `app.service.audio_mix.pass_audio_track` — the ONE track a pass encodes with
  (None when every variant is muted), owning bed selection + the SFX mix
- `app.service.audio_mix.sfx_cues` / `build_pass_audio` — the storyboard's
  per-shot SFX as beat-aligned cues, mixed once per pass
- `app.service.audio.ensure_local_sfx` — one SFX WAV locally, synthesized and
  uploaded if B2 lacks it
- `app.service.encode.extract_poster` / `poster_frame_number` — a JPEG poster from
  a representative frame (20% in, never the black first frame)
- `app.service.audio.ensure_audio_bed` — pick a bed from
  `assets/<product>/audio/bgm/` that covers this pass, else synthesize one at the
  job BPM
- `app.service.audio.wav_duration_seconds` / `candidate_beds` — the duration probe
  and the preference order behind that choice
- `app.types.variants.variant_geometry` — variant id + tier -> even pixel dimensions
- `packages/remotion/src/Root.tsx` `calculateMetadata` — the per-variant frame size

## Canonical Files
- Pattern exemplar: `services/api/app/service/encode.py`
- Variant geometry, one definition per language: `packages/shared/src/variants.json`
  holds the **aspect ratios**; the aspect -> even-pixels derivation is
  `packages/shared/src/variant-geometry.ts` (the single TypeScript copy, imported by
  BOTH `packages/remotion/src/lib/variant.ts` and `apps/web`) mirrored by
  `services/api/app/types/variants.py`
- **Every surface derives sizes from the master it will actually render**, never
  from `/promo-defaults`' `RENDER_PRESET` tier. That endpoint can only answer for
  its own default, so `/promos/new` at 1920x1080 used to label all four variants
  720p ("Master 16:9 … 1280x720") while the pass went on to deliver 1080p and the
  promo page's badges said so — one resource, two contradictory sizes. The create
  form now re-derives from the selected resolution and the storyboard editor from
  the stored storyboard's own `width`/`height`

## Inputs
- A complete local frame sequence for one variant (`frame-%06d.png`, from 0)
- fps: int (30 by default)
- audio bed: a local WAV/MP3 path, or none for a muted variant
- variant id: `master-16x9` | `vertical-9x16` | `square-1x1` | `loop-muted-16x9`

## Outputs
- `renders/<job-id>/<variant>.mp4` — H.264 (`libx264`, CRF 20, `yuv420p`,
  `+faststart`) + AAC 128k, or `-an` for the muted loop
- `renders/<job-id>/<variant>.poster.jpg`
- `assets/<product>/audio/bgm/pulse-<bpm>bpm.wav` on first use — and rewritten,
  longer, the first time a pass needs more than it holds
- Byte totals fed into the pass's manifest entry

## Flow
- Resolve ffmpeg once per process (`lru_cache`)
- Ensure a bed that **covers this pass** exists. `ensure_audio_bed` lists
  `assets/<product>/audio/bgm/` and takes the first candidate that is long enough:
  an uploaded bed first (the Ingest → "Audio bed" promise), then
  `pulse-<bpm>bpm.wav`. Beds synthesized for a *different* BPM are skipped (their
  clicks would sit off this job's beat grid). If nothing covers the pass, a new bed
  is synthesized at the pass length + 0.5s and uploaded over `pulse-<bpm>bpm.wav`
- Mix the storyboard's per-shot SFX one-shots onto the bed, once per pass
  (`app.service.audio_mix.build_pass_audio`). Shots are beat-snapped at authoring
  time, so a cue's offset is exactly `shot.from / fps`; `adelay=…:all=1` delays
  every channel together and `amix=normalize=0` keeps the bed at its authored
  level (the default would divide every input by the input count and duck the bed)
- **Invariant: output duration == visual duration, whatever the bed's length.**
  `ffmpeg -framerate <fps> -start_number 0 -i frame-%06d.png [-i bed.wav] …` bounds
  the audio **explicitly** to `total_frames / fps`:
  `-af apad=whole_dur=<D>` pads a short (or unprobeable) bed with silence up to
  exactly D and no further, and `-t <D>` hard-caps the muxer so a longer bed is
  trimmed. `-shortest` is kept only as the fallback when the frame count is
  unknown. Two separate bugs are why this is explicit:
  - keying the bed on BPM alone once shipped an 8s MP4 for a 36.2s pass while
    every frame was still rendered, uploaded and counted
  - unbounded `-af apad` + `-shortest` shipped a **10.84s** container for a 6.00s /
    180-frame pass: bare `apad` pads indefinitely and `-shortest` is then limited
    by ffmpeg's sync-queue buffer (`-shortest_buf_duration`, default 10s), so
    ~4.8s of frozen outro frame plus silence went out in the artifact
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
- Bed shorter than the pass (an 8s `make-demo-assets` bed, then a `full` pass;
  or a storyboard that grew longer since the last render) -> re-synthesized at the
  new length, **not** reused
- Uploaded bed that cannot be probed with the standard library (MP3) -> used as-is
  and padded with silence if it runs out; the video is never shortened
- Uploaded bed that is measurably shorter than the pass -> skipped with a log line
  and the synthesized bed is used instead
- Encode timeout (30 min) / render timeout (60 min) -> the child is killed so the
  single worker is never held forever
- 1-frame storyboard -> the poster is frame 0

## UX States (if applicable)
- Empty: "No rendered variants yet" pointing at Render
- Loading: **Muxing frames + audio with ffmpeg** / **Uploading the variant + poster**
- Error: the pass fails with the tail of ffmpeg's stderr in the progress panel

## Verification
- Test files: `services/api/tests/test_binary_resolution.py`,
  `services/api/tests/test_audio_bed.py`,
  `services/api/tests/test_encode_duration.py`,
  `services/api/tests/test_sfx_mix.py`,
  `services/api/tests/test_shot_library.py` (geometry, even dimensions, muted set)
- Required cases: bundled ffmpeg resolves on a fresh clone; a bad override is
  actionable; 16:9/9:16/1:1 geometry at both tiers; every dimension even; only
  `loop-muted-16x9` is muted; the poster frame is never frame 0 for a real duration;
  a long-enough bed is reused, a too-short one is re-synthesized, a full-preset pass
  gets a bed >= 36.2s, and an uploaded bed beats the synthesized one; the audio
  argv is bounded to the frame count and bare `apad` never survives; a per-shot SFX
  becomes a cue at its beat-snapped offset and the mix does not duck the bed
- Focused verify command: `cd services/api && .venv/bin/python -m pytest tests/test_binary_resolution.py tests/test_audio_bed.py tests/test_encode_duration.py tests/test_sfx_mix.py -q`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` when E2E/live prerequisites apply
- **Manual:** after a real pass, both variants must play inline on `/promos/[id]`
  and `renders/<job>/` must hold two MP4s and two posters. `ffprobe` each MP4:
  **container, video and audio duration must all equal `duration_frames / fps`**.
  A variant that stops early is the bed-truncation bug; a container longer than the
  video (a frozen tail frame + silence, and a player readout that disagrees with the
  card) is the unbounded-`apad` bug. Neither is an encoding taste.
- **Manual:** set one shot's SFX in the editor, save, render, and confirm the
  one-shot is audible at that shot's start in `master-16x9.mp4`. A silent output is
  the no-op regression this feature exists to prevent.
- Pass criteria: MP4s play in a browser, posters are real frames, and
  `vertical-9x16` really is 720x1280 pixels (not a letterboxed master)

## Related Docs
- [README.md](../../README.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [frame-rendering.md](frame-rendering.md)
- [../LICENSING.md](../LICENSING.md) — why the audio is synthesized, not vendored
