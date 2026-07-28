<!-- last_verified: 2026-07-28 -->
# Feature: Amplification Dashboard

## Purpose
Lead with the number that explains why this workload belongs on object storage:
intermediate bytes written per delivered byte, measured from the manifests.

## Used By
- UI: `/` (stat cards, bytes-per-pass chart, recent renders table)
- API: `GET /promos/stats`, `GET /promos/volume?limit=`, `GET /promos`
- Job: none — every figure is derived from `manifests/`

## Core Functions
- `app.service.promo_views.get_pipeline_stats` — cumulative totals + humanized bytes
- `app.service.promo_views.get_pass_volume` — the last N passes, oldest to newest
- `lib/amplification.ts` — `formatAmplification`, `formatFrameCount`, `renderPercent`

## Canonical Files
- Pattern exemplar: `apps/web/src/components/dashboard/stats-cards.tsx`
- Chart: `apps/web/src/components/dashboard/write-volume-chart.tsx`
- Table: `apps/web/src/components/dashboard/recent-renders-table.tsx`

## Inputs
- limit: int 1..50 for the chart (default 8)

## Outputs
- Stat cards: **write amplification** (lead, visually distinguished), frames
  archived (+ humanized `frames/` bytes), delivered video (+ variant count), render
  passes (+ promos with a manifest)
- Grouped bar chart: `frame_bytes` vs `variant_bytes` per pass, y-axis humanized
- Recent renders: title, product, duration, revision/pass, ratio, updated, status

## Flow
- List `manifests/`, read each document, flatten every pass
- `summarize_passes` for the totals; the chart sorts passes by `finished_at` and
  takes the last N
- Each card states the prefix its number came from, so a figure is never unsourced

## Edge Cases
- No passes yet -> ratio renders as an em dash and the chart shows an empty state
  pointing at a first render; zeros are never presented as data
- API unreachable -> inline `ErrorState` with retry instead of a zeroed dashboard
- `limit` outside 1..50 -> `400`
- Ratio >= 100 -> shown without a decimal
- A pass with `variant_bytes == 0` (impossible after a successful pass) -> ratio 0.0,
  never `Infinity`

## UX States (if applicable)
- Empty: "No render passes yet" + "Create one from Promos → New promo"
- Loading: skeleton values in the cards, skeleton bars in the chart
- Error: `ErrorState` per component, so one failing query does not blank the page

## Verification
- Test files: `services/api/tests/test_promo_routes.py` (stats/volume with and
  without manifests, limit validation), `apps/web/src/lib/amplification.test.ts`
- Required cases: zeros before any pass; real values read from a manifest; limit
  bounds; formatter edge cases (0, Infinity, null, >= 100)
- Focused verify command: `pnpm test:web`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` when E2E/live prerequisites apply
- Pass criteria: after a demo pass the headline reads ~40x and matches
  `manifests/<job>.json` `totals.amplification_ratio`

## Related Docs
- [README.md](../../README.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [delivery-manifest.md](delivery-manifest.md)
