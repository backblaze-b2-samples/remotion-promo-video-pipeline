<!-- last_verified: 2026-07-28 -->
# Feature: Scoped Asset Library

## Purpose
Answer "what brand material does this product have?" — captures, the audio bed, SFX
one-shots, brand files — without making the user scan the whole bucket.

## Used By
- UI: `/library`
- API: `GET /assets?product=`, `GET /products`, `POST /assets/demo-audio`
- Job: none

## Core Functions
- `app.service.assets.list_assets` — list one prefix, classify, presign
- `app.service.assets._classify` — key position -> (kind, group)
- `app.service.assets.list_products` — product slugs found in the bucket
- `app.service.assets.capture_keys_by_viewport` — used when creating a promo
- `app.service.audio.ensure_audio_bed` / `ensure_sfx_pack`

## Canonical Files
- Pattern exemplar: `services/api/app/service/assets.py`
- UI: `apps/web/src/components/library/asset-library.tsx` (scope picker + states),
  `apps/web/src/components/library/asset-group-card.tsx` (one kind's card)
- Grouping logic: `apps/web/src/lib/asset-groups.ts` (pure — kind order, labels,
  per-kind empty copy)
- Slug handling for the `?product=` hand-off: `apps/web/src/lib/product-slug.ts`

## Inputs
- product: str (selector, populated from the bucket itself rather than a config list)
- `?product=<slug>` search param — the initial scope, so `/ingest` can link here
  with the product it just filed material under. Honoured only when the bucket has
  that product (the picker is a `Select` over a fixed list); anything else falls
  back to the first product

## Outputs
- `{product, prefix, entries[]}` where each entry carries key, name, kind, group,
  size, content type, last-modified and a presigned **inline** URL for playable types
- `POST /assets/demo-audio` additionally writes the bed + three SFX to B2

## Flow
- `asset_prefix(product)` -> `assets/<product>/`
- Paginated `list_objects_v2` over exactly that prefix
- Classify by position in the documented layout: `captures/<viewport>/…` ->
  capture, `audio/bgm/…` -> bgm, `audio/sfx/<category>/…` -> sfx, `brand/…` -> brand
- Presign inline URLs for image/audio/video/JSON so thumbnails and `<audio>` work
- Group in the UI: capture thumbnails as a grid, audio as players, the rest as a list
- **Every kind in `KIND_ORDER` renders, populated or not.** Empty kinds used to be
  filtered out, so a product with one brand file showed a single card and empty
  space below it: nothing said captures, an audio bed or SFX were part of a
  product's material, and the only empty affordance fired when the product had
  nothing of *any* kind — which a partially-populated product never hits. An empty
  kind now shows "0 objects" plus one line naming the way to fill *that* kind
  (capture → Ingest, bgm/sfx → "Synthesize demo audio", brand → Ingest upload)

## Edge Cases
- No assets for a product -> **one** whole-product empty state pointing at Ingest
  and at the "Synthesize demo audio" button (not five empty per-kind cards)
- Some kinds populated, others not -> every kind still renders; the empty ones carry
  their own one-line "how to populate this" copy
- `?product=` naming a product the bucket does not have (or a malformed slug like
  `../../etc`) -> ignored, the picker falls back to the first product
- No products at all -> the selector falls back to `PROMO_PRODUCT_DEFAULT`
- A storyboard whose product has no `assets/` prefix yet -> still listed as a
  product (the product list unions asset prefixes and storyboard products)
- An unreadable storyboard -> skipped with a warning; it cannot hide other products
- Deliberate overlap with `/files`: this view is scoped, `/files` is the whole
  bucket. **`/files` must never be scoped or removed** (AGENTS.md §3)

## UX States (if applicable)
- Empty: whole-product empty state when nothing at all is in the prefix
- Partially populated: a card per kind, empty ones showing "0 objects" + the one
  action that fills that kind
- Loading: labelled skeleton cards (`<FetchingState>`) while the product list and
  then the assets resolve. Both waits name the B2 read in flight — listing
  `assets/` + `storyboards/` for the product list, then `assets/<product>/` for the
  scoped one — because the product list must resolve before the scoped fetch starts,
  so unlabelled bars sat on screen for seconds
- Error: inline `ErrorState` with retry
- Arriving from Ingest: `?product=` opens the view already scoped to the product
  whose assets were just ingested

## Verification
- Test files: `apps/web/src/lib/asset-groups.test.ts` (every kind survives
  grouping; whole-product-empty detection), `apps/web/src/lib/product-slug.test.ts`
  (the `?product=` hand-off), `services/api/tests/test_keys.py` (prefix + slug
  safety), `services/api/tests/test_promo_routes.py` (capture wiring on create)
- Required cases: the listing never escapes `assets/<product>/`; classification maps
  each documented key shape to the right kind; playable types get a URL and others
  do not; a product with one populated kind still renders all five
- Focused verify command: `cd services/api && .venv/bin/python -m pytest tests/test_keys.py -q`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` when E2E/live prerequisites apply
- Pass criteria: captures render as thumbnails, the bed and SFX play inline, and no
  object outside the product prefix ever appears

## Related Docs
- [README.md](../../README.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [asset-ingest.md](asset-ingest.md)
- [file-browser.md](file-browser.md)
