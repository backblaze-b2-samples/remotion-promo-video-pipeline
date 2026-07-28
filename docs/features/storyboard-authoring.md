<!-- last_verified: 2026-07-28 -->
# Feature: Storyboard Authoring

## Purpose
Turn a shot-card library and a preset into a beat-snapped storyboard that is also
the job record, so a promo can be revised and re-rendered without losing history.

## Used By
- UI: `/promos/new` (create), `/promos/[id]/edit` (revise), `/shot-cards` (browse)
- API: `POST /promos`, `PATCH /promos/{id}`, `GET /shot-cards`,
  `GET /storyboard-presets`, `GET /promo-defaults`
- Job: none — authoring is synchronous

## Core Functions
- `app.service.promos.build_shots` — expand a preset into shots and snap them
- `app.service.promos.create_promo` / `update_promo` — write / revise the storyboard
- `app.types.beatgrid.snap_storyboard` — pure beat snapping
- `app.types.library` — loaders for the shared card / preset JSON
- `lib/storyboard-editor.ts` — the editor's pure reducer (add / remove / move / patch)

## Canonical Files
- Pattern exemplar: `services/api/app/types/beatgrid.py` (pure, testable, no I/O)
- Data source of truth: `packages/shared/src/shot-cards.json`,
  `packages/shared/src/storyboard-presets.json`
- Create form: `apps/web/src/components/promos/promo-create-form.tsx`
- Editor: `apps/web/src/components/promos/storyboard-editor.tsx`

## Inputs
- product: str (free text, slugified — becomes the `assets/<product>/` prefix)
- title: str (free text — becomes headline copy in the title and outro shots)
- preset: enum (`release-teaser` | `feature-tour` | `ink-press-full`)
- bpm: enum (90 | 110 | 120 | 128)
- width/height: enum (1280x720 | 1920x1080)
- variants: multi-select over the 4 variant ids
- accent: enum (`ink-amber` | `neon-cyan` | `mono-slate`)
- On edit: per-shot card id, duration frames, headline, sub, SFX id, order

## Outputs
- `storyboards/<job-id>.json` in B2 — the job record, at `revision: 1` on create
- Side effect on create: captures are taken first (see
  [asset-ingest.md](asset-ingest.md)) and wired into capture-using shots
- Side effect on edit: `revision` increments, so the next render is a new pass

## Flow
- Read the preset from `packages/shared/src/storyboard-presets.json`
- Format `{title}` / `{product}` placeholders into each shot's copy
- `snap_storyboard(durations, fps, bpm)` pulls every internal boundary to the
  nearest beat while preserving the total duration exactly
- Attach the product's desktop capture (falling back to any capture) to each shot
- Validate every card id, SFX id, accent and variant against the shared JSON
- Force `master-16x9` into the variant list — the poster and the frame strip come
  from it, and every other variant is a re-render of the same storyboard
- `put_json` the result

## Edge Cases
- Unknown preset / card / SFX / accent / variant -> `400` naming the allowed set
- BPM changed but shots untouched -> existing shots are re-snapped to the new grid
- Total below `MIN_SHOT_FRAMES * shot_count` -> snapping is skipped rather than
  collapsing a shot to zero frames
- Empty shot list on edit -> `400` (a storyboard with no shots has no duration)
- Editor cap of 16 shots -> "Add shot" disables; every extra shot is N more frames
  per variant per pass
- Duration outside 6..600 frames -> clamped by the reducer and rejected by Pydantic

## UX States (if applicable)
- Empty: `/promos` empty state points at **New promo**
- Loading: the create form mounts only after `/promo-defaults` resolves, so its
  selectors never render unselected
- Error: inline `ErrorState` with retry; validation errors render per field

## Verification
- Test files: `services/api/tests/test_beatgrid.py`,
  `services/api/tests/test_shot_library.py`,
  `services/api/tests/test_promo_routes.py`,
  `apps/web/src/lib/storyboard-editor.test.ts`
- Required cases: total preserved after snapping; boundaries land on beats; presets
  only name implemented cards; preset frame totals match their declared values;
  revision bumps; unknown card rejected; reducer clamps and refuses to empty the list
- Focused verify command: `cd services/api && .venv/bin/python -m pytest tests/test_beatgrid.py tests/test_shot_library.py -q`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` when E2E/live prerequisites apply
- Pass criteria: snapping preserves totals, every preset resolves, a create + edit
  round trip leaves a valid storyboard at the expected revision

## Related Docs
- [README.md](../../README.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [docs/app-workflows.md](../app-workflows.md)
- [frame-rendering.md](frame-rendering.md)
