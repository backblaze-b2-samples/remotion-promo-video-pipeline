<!-- last_verified: 2026-07-28 -->
# Feature: Frame Rendering (resumable, B2-backed)

## Purpose
Render a storyboard to PNG frames with Remotion and keep **every frame** in B2, so
a killed render resumes instead of restarting and the intermediate volume is
measurable rather than thrown away.

## Used By
- UI: `POST /promos/{id}/render` from the promo list row action or the detail page;
  live phase + frame count in `RenderProgressPanel`
- API: `POST /promos/{id}/render` (202), `GET /promos/{id}/progress`
- Job: `app.service.jobs` — a single in-process worker

## Core Functions
- `app.service.jobs.start_render` / `get_progress` — queue + progress registry
- `app.service.render_pass._render_variant` — resume scan, render, upload, restore
- `app.service.render_engine.render_frames` — spawn the Node CLI, parse NDJSON
- `app.service.render_payload.render_payload` — capture keys -> presigned URLs
- `app.repo.b2_frames.put_frames` / `fetch_frames` / `list_frame_numbers`
- `packages/remotion/render-frames.mjs` — `bundle()` -> `selectComposition()` ->
  `renderFrames()`

## Canonical Files
- Pattern exemplar: `services/api/app/service/render_pass.py`
- The Node boundary: `packages/remotion/render-frames.mjs`
- Bulk B2 I/O: `services/api/app/repo/b2_frames.py`

## Inputs
- job_id: str (path)
- The stored storyboard: shots, fps, bpm, master width/height, accent, variants
- `RENDER_CONCURRENCY` (default `auto`), `FRAME_UPLOAD_CONCURRENCY` (default 8),
  `FRAME_UPLOAD_ENABLED` (default true), `REMOTION_GL` (unset)

## Outputs
- `frames/<job-id>/pass-<NN>/<variant>/frame-%06d.png` — one object per frame per
  variant
- Progress events into the in-process registry (phase, variant, rendered/total,
  frames uploaded)
- Local scratch under `services/api/data/passes/<job>/pass-NN/`, deleted after the
  pass

## Flow
1. `pass_number = len(manifest.passes) + 1` — a killed pass keeps its number, so a
   retry lands on the same frame prefix
2. Write the render payload (presigned capture URLs) to the pass scratch dir
3. Per variant, in storyboard order (master first):
   - **resume scan**: `list_frame_numbers(prefix)` -> `{frame: size}` already in B2
   - render only `min(missing)..max(missing)` via Remotion's `frameRange`
   - upload the newly rendered frames, threaded, invalidating the listing cache once
   - re-list the prefix for authoritative frame count + byte totals
   - download any frame the current attempt did not render locally, so the encode
     sees a complete sequence
4. Hand off to [encode-and-variants](encode-and-variants.md)

## Edge Cases
- Killed render -> the next attempt renders only the missing tail; already-landed
  frames are downloaded rather than re-rendered
- Non-contiguous missing set -> the range spans `min..max`; already-present frames
  are simply re-rendered and re-uploaded (correct, slightly wasteful, rare)
- `FRAME_UPLOAD_ENABLED=false` -> frame accounting falls back to local file sizes
  and resume is unavailable (nothing in B2 to resume from)
- A second render for the same promo while one is in flight -> `409`
- Missing node / render CLI / `node_modules` -> `503` with a message naming the fix
- Remotion failure -> `RenderError` carrying the tail of Remotion's own stderr
- Non-JSON on the CLI's stdout -> logged as a contract violation, the pass continues
- Expired presigned capture URL -> the card's `onError` falls back to a drawn mock
  rather than failing 1,086 frames
- `RENDER_CONCURRENCY=auto` on a 1-core host -> resolves to 1, never 0

## UX States (if applicable)
- Empty: "No render yet"
- Loading: phase label + real frames-rendered/total + a `Progress` bar, `aria-live`
- Error: **Failed** phase with the error text inline; the traceback stays in the log

## Verification
- Test files: `services/api/tests/test_promo_routes.py` (202 + `Location`, 409,
  failure surfacing), `services/api/tests/test_binary_resolution.py` (actionable
  binary errors), `apps/web/src/lib/amplification.test.ts` (`renderPercent`)
- Required cases: 202 + progress location; 404 for an unknown promo; a failing pass
  reports `status: failed` with the message; missing binaries are actionable
- Focused verify command: `cd services/api && .venv/bin/python -m pytest tests/test_promo_routes.py -q`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` when E2E/live prerequisites apply
- **Manual (not automated):** run a real `release-teaser` pass and confirm
  `frames/<job>/pass-01/<variant>/frame-000000.png` exists in `/files`. No gate in
  `pnpm verify` renders a frame — see docs/dev-workflows.md.
- Pass criteria: 360 PNG objects for a default demo pass (180 x 2 variants), and the
  progress stream advances monotonically to the frame total

## Related Docs
- [README.md](../../README.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [docs/RELIABILITY.md](../RELIABILITY.md)
- [encode-and-variants.md](encode-and-variants.md)
