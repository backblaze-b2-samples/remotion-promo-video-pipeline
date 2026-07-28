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
- product: str (free text, slugified — becomes the `assets/<product>/` prefix).
  `/promos/new?product=<slug>` pre-fills it, which is how `/ingest` hands over the
  product it just filed assets under; a missing or malformed slug falls back to the
  server default. Validation is on shape only (`lib/product-slug.ts`), because a
  promo for a brand-new prefix is a normal first move
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
  from it, and every other variant is a re-render of the same storyboard. It is
  marked `"required": true` in `packages/shared/src/variants.json` and surfaced
  through `variant_spec()`, so both forms render it checked + disabled with an
  "always included" label and their PNG estimate counts it. A checkbox the
  backend overrides is a lie about what the pass will write
- A per-shot SFX id is **not** decoration: it becomes a beat-aligned cue on the
  pass audio track (see [encode-and-variants.md](encode-and-variants.md)). It used
  to reach nothing at all
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
- Arriving from Ingest: `?product=` becomes the product field's initial value and
  the field description says it was carried over, instead of the form silently
  re-seeding `PROMO_PRODUCT_DEFAULT` and building the promo against a prefix with
  none of the user's assets in it. Same mechanism as before — a real, editable,
  pre-filled value; only the default differs. Still no autofill button
- Loading: the create form mounts only after `/promo-defaults` resolves, so its
  selectors never render unselected AND its free-text fields open pre-filled with
  the server's safe defaults (see AGENTS.md §4 — placeholder-only defaults made
  the first submit a guaranteed validation failure)
- In flight on create: the shared `InFlightState` primitive — a spinner, the stage
  breakdown (capture → storyboard → write), a determinate bar and an elapsed
  counter, because the request blocks for ~9s and up to 20s per viewport when the
  URL is unreachable. `/ingest`'s capture panel renders the same component
- Delivery-variant sizes track the **selected** master resolution, not the server
  default — see [encode-and-variants.md](encode-and-variants.md#canonical-files)
- Capture viewports say plainly that every shot is wired to the **desktop** capture
  and that extra viewports are Library material costing up to 20s each; only
  `build_shots`' chosen capture reaches the storyboard
- Error: inline `ErrorState` with retry; validation errors render per field
- Unknown / deleted promo id: `ErrorState` distinguishes a genuine `404` from a
  transient fetch failure. A 404 drops **Retry** (re-reading an absent
  `storyboards/<id>.json` fails identically forever) and offers **All promos** /
  **New promo** instead; the breadcrumb also links every real ancestor route, so a
  stale bookmark no longer depends on the sidebar for escape

## Verification
- Test files: `services/api/tests/test_beatgrid.py`,
  `services/api/tests/test_shot_library.py`,
  `services/api/tests/test_promo_routes.py`,
  `apps/web/src/lib/storyboard-editor.test.ts`,
  `apps/web/src/lib/product-slug.test.ts`
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
