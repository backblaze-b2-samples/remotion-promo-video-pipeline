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
- UI: `apps/web/src/components/library/asset-library.tsx`

## Inputs
- product: str (selector, populated from the bucket itself rather than a config list)

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

## Edge Cases
- No assets for a product -> empty state pointing at Ingest and at the
  "Synthesize demo audio" button
- No products at all -> the selector falls back to `PROMO_PRODUCT_DEFAULT`
- A storyboard whose product has no `assets/` prefix yet -> still listed as a
  product (the product list unions asset prefixes and storyboard products)
- An unreadable storyboard -> skipped with a warning; it cannot hide other products
- Deliberate overlap with `/files`: this view is scoped, `/files` is the whole
  bucket. **`/files` must never be scoped or removed** (AGENTS.md §3)

## UX States (if applicable)
- Empty: per-product empty state
- Loading: skeleton cards while the product list and then the assets resolve
- Error: inline `ErrorState` with retry

## Verification
- Test files: `services/api/tests/test_keys.py` (prefix + slug safety),
  `services/api/tests/test_promo_routes.py` (capture wiring on create)
- Required cases: the listing never escapes `assets/<product>/`; classification maps
  each documented key shape to the right kind; playable types get a URL and others
  do not
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
