<!-- last_verified: 2026-07-28 -->
# Feature: Delivery Manifest & Write-Amplification Accounting

## Purpose
Record what produced every delivered file, and make write amplification a measured
number instead of a claim.

## Used By
- UI: `/promos/[id]` manifest panel + frame strip; `/` dashboard stat cards and the
  bytes-per-pass chart
- API: `GET /promos/{id}` (embeds the manifest), `GET /promos/stats`,
  `GET /promos/volume`
- Job: written by `app.service.render_pass.run_pass` at the end of each pass

## Core Functions
- `app.types.promo.amplification_ratio` — intermediate bytes per delivered byte
- `app.types.promo.summarize_passes` — cumulative totals across passes
- `app.service.promos.save_manifest` — recompute totals, then `put_json`
- `app.service.promo_views.get_pipeline_stats` / `get_pass_volume` / `_frame_samples`
- `lib/amplification.ts` — the formatters (`formatAmplification`, `formatFrameCount`)

## Canonical Files
- Pattern exemplar: `services/api/app/types/promo.py`
- Read-side projections: `services/api/app/service/promo_views.py`
- UI: `apps/web/src/components/promos/manifest-panel.tsx`

## Inputs
- One completed `RenderPass`: pass number, revision, timestamps, storyboard key,
  fps, bpm, duration, shot cards used, and per-variant frame counts / byte totals

## Outputs
- `manifests/<job-id>.json` — `passes[]` plus `totals`
  (`passes`, `frames_written`, `frame_bytes`, `variant_bytes`, `amplification_ratio`)
- Dashboard aggregates across every manifest in the bucket
- A frame strip of six presigned PNG URLs read out of the master's frame prefix

## Flow
- Each variant contributes `frame_count`, `frame_bytes` (from the authoritative B2
  re-list), `variant_bytes`, `poster_key` and `duration_seconds`
- The pass sums those, computes its own ratio, and is **appended** — never replacing
  earlier passes
- `save_manifest` recomputes `totals` from the whole list, so the file is always
  internally consistent
- The dashboard lists `manifests/`, reads each document, and summarizes all passes

## Edge Cases
- Nothing delivered yet (`variant_bytes == 0`) -> ratio is `0.0`, never `Infinity`;
  the UI renders an em dash rather than "Infinityx"
- A malformed manifest document -> treated as missing, so one bad file cannot break
  the promo list or the dashboard
- Ratio >= 100 -> rendered without a decimal (`149x`); below that, one decimal
- A promo deleted -> its manifest goes with it (prefix-scoped delete), so the
  dashboard totals drop accordingly
- Frame counts include frames a *previous* attempt uploaded, because the count comes
  from B2 rather than from this attempt's loop

## UX States (if applicable)
- Empty: "No delivery manifest yet" explaining what a pass will add
- Loading: skeleton stat cards and a skeleton chart
- Error: inline `ErrorState` — never zeros presented as data

## Verification
- Test files: `services/api/tests/test_amplification.py`,
  `services/api/tests/test_promo_routes.py`,
  `apps/web/src/lib/amplification.test.ts`
- Required cases: ratio maths incl. the divide-by-zero guard; totals accumulate
  across passes; a manifest round-trips through JSON unchanged; appending a pass
  recomputes totals; `/promos/stats` and `/promos/volume` read the manifests;
  the formatter never prints `Infinityx`
- Focused verify command: `cd services/api && .venv/bin/python -m pytest tests/test_amplification.py -q`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` when E2E/live prerequisites apply
- Pass criteria: a real demo pass reports ~40x with `frames_written == 360`, and the
  dashboard's headline matches the manifest's `totals.amplification_ratio`

## Related Docs
- [README.md](../../README.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [dashboard.md](dashboard.md)
- [frame-rendering.md](frame-rendering.md)
