<!-- last_verified: 2026-07-28 -->
# Architecture

## Components

- **apps/web/** — Next.js 16 frontend (App Router, Tailwind v4, shadcn/ui)
  - Amplification-first dashboard (ratio, frames archived, bytes per pass)
  - Promo list + detail (per-variant `<video>`, storyboard timeline, manifest)
  - Storyboard editor (card selector, copy, duration, SFX, reorder)
  - Scoped asset library (`assets/<product>/`) and the untouched full-bucket explorer
  - Dark mode via `next-themes`
- **services/api/** — FastAPI backend (layered architecture)
  - Promo CRUD over B2 (no database), render orchestration, live progress
  - Capture ingest (Playwright), audio synthesis (stdlib `wave`), encode (ffmpeg)
  - Health check with B2 connectivity, JSON logging, Prometheus-format metrics
- **packages/remotion/** — the Remotion composition, 10 shot cards, and the
  `render-frames.mjs` CLI the backend spawns
- **packages/shared/** — TypeScript types **plus** the shot-card, storyboard-preset
  and variant JSON read by both the renderer and the API. `variant-geometry.ts` is
  the single TypeScript aspect-ratio -> pixels derivation over `variants.json`,
  imported by `packages/remotion` *and* `apps/web` (mirrored in
  `services/api/app/types/variants.py`) so no surface can label a variant with a
  size the pass will not render

## Backend Layering

```
types/     Pydantic models, key builders, beat grid, shared-JSON loaders
  |
config/    Settings (pydantic-settings) — depends only on types
  |
repo/      Data access (boto3 B2 client, bulk frame I/O, JSON docs) — no logic
  |
service/   Business logic: promo CRUD, render pass, encode, capture, audio, runner
  |
runtime/   FastAPI routes — calls service, never repo directly
```

### Layering Rules

1. Dependencies flow downward only: `types` -> `config` -> `repo` -> `service` -> `runtime`
2. No backward imports (service must not import from runtime)
3. `boto3` only in `repo/`
4. All boundary data uses Pydantic models (no raw dicts across layers)
5. Each file stays under 300 lines — enforced by `tests/test_structure.py`

### Directory Structure

```
services/api/
  main.py                  App entrypoint, middleware, router registration
  app/
    types/
      promo.py             Storyboard, RenderPass, DeliveryManifest, amplification maths
      beatgrid.py          PURE beat snapping (no I/O, no other layers)
      keys.py              EVERY B2 key builder + job_prefixes() for scoped delete
      variants.py          Variant id -> pixel geometry (from the shared JSON)
      library.py           Loaders for packages/shared/src/*.json
      files.py stats.py upload.py errors.py formatting.py
    config/settings.py     Settings; s3_endpoint derived from B2_REGION
    repo/
      b2_client.py         Cached boto3 client, listing cache, health TTL cache
      b2_frames.py         Threaded bulk frame put/fetch, resume scan, prefix delete
      b2_json.py           put_json / get_json / get_json_many for storyboards + manifests
      b2_media.py          Presigned URLs (inline + attachment), raw byte writes
      b2_object.py         Single-object body reads
      b2_stats.py          Bucket-wide aggregates
      counter.py           Download counter persistence
    service/
      promos.py            Promo CRUD (writes)
      promo_views.py       Read-side projections: list, detail, stats, pass volume.
                           Every list-shaped view batches its per-promo document
                           reads through repo.get_json_many (one concurrent hop,
                           not two blocking B2 GETs per row)
      render_pass.py       One pass: resume -> render -> upload -> encode -> manifest
      render_payload.py    The document handed to Node (capture keys -> presigned URLs)
      render_engine.py     Spawns render-frames.mjs, parses its NDJSON stream
      encode.py            ffmpeg mux + poster + SFX mix, ffmpeg resolution
      audio.py             Locally synthesized WAV bed + SFX (stdlib `wave`)
      audio_mix.py         Per-shot SFX -> beat-aligned cues on the pass bed
      capture.py           Playwright captures, Pillow placeholder fallback
      assets.py            Scoped assets/<product>/ listing
      jobs.py              Single-worker pass runner + progress registry
      files.py upload.py metadata.py
    runtime/
      promos.py assets.py shotcards.py files.py health.py metrics.py ratelimit.py upload.py
  tests/                   pytest (structural + unit + mocked-S3 route tests)
```

## The Python -> Node boundary

Remotion is a React renderer, so frames must be produced by Node. Exactly one
subprocess crosses that boundary.

```
service/render_pass.py
  writes  <work>/storyboard.json      (render_payload.py: capture keys -> presigned URLs)
  spawns  node packages/remotion/render-frames.mjs \
            --storyboard <path> --variant <id> --out-dir <dir> \
            --frame-range a-b --concurrency N
  reads   stdout, line by line
```

**stdout is NDJSON and nothing else:**

```
{"type":"progress","rendered":N,"total":M}
{"type":"done","frameCount":N,"width":W,"height":H}
{"type":"error","message":"..."}          + non-zero exit
```

Every human-readable log goes to stderr; `render-frames.mjs` re-points
`console.log` at stderr so a stray library write cannot corrupt the stream. That
contract is what lets `service/render_engine.py` stream real progress into the UI
instead of blocking until the whole render finishes.

The CLI renders into a `.raw/` scratch dir and then renames files to the canonical
`frame-%06d.png`, so the B2 key layout does not depend on Remotion's internal
output naming.

**One composition, four variants.** `packages/remotion/src/Root.tsx` uses
`calculateMetadata` to read `inputProps` and return this render's `width`,
`height`, `fps` and `durationInFrames`. `vertical-9x16` is therefore a genuine
re-render at 720x1280 — not a crop — which is precisely why intermediate frame
volume multiplies per variant.

## Data Stores

- **Backblaze B2** — object storage (S3-compatible API), the **only** store.
  - `storyboards/<job-id>.json` **is** the job record: listing the prefix
    enumerates jobs, reading one returns the job, editing bumps `revision`.
  - `manifests/<job-id>.json` accumulates one entry per completed pass.
  - `frames/<job-id>/pass-<NN>/<variant>/` holds every intermediate PNG, and is
    also the resume index.
  - **No application database.** In-flight render progress is in-process only and
    is lost on restart; the pass itself is recoverable because the resume scan
    re-reads B2 (see [docs/RELIABILITY.md](docs/RELIABILITY.md)).

## External Services

- **Backblaze B2 S3 API** — the only external service. `head_bucket`,
  `put_object`, paginated `list_objects_v2`, `head_object`, `get_object`,
  `delete_object`, `generate_presigned_url`. No b2-native API anywhere.
- Everything else is local: Remotion's headless Chrome, ffmpeg
  (`imageio-ffmpeg`), Playwright Chromium.

## Trust Boundaries

See [docs/SECURITY.md](docs/SECURITY.md) for the full picture.

- **Frontend -> API** — CORS-restricted to configured origins, scoped to
  `GET/POST/PATCH/DELETE/OPTIONS`. `CORSMiddleware` is registered LAST in
  `main.py` (outermost) so it wraps **every** response, including
  uncaught-exception 500s — otherwise the browser blocks error responses and the
  UI only sees an opaque "network error". A per-IP rate limiter sits inner to CORS.
- **API -> B2** — application key + signature v4; the endpoint is derived from
  `B2_REGION`.
- **Browser / headless Chrome -> B2** — presigned URLs only. The API never proxies
  media bytes and no bucket needs to be public. The renderer's headless Chrome
  gets presigned capture URLs in its input props for the same reason.

## Data Flows

- **Capture**: Browser -> `POST /captures` -> `service/capture` (Playwright at 2x,
  or a Pillow placeholder) -> `repo.upload_bytes` -> `assets/<product>/captures/…`
- **Create promo**: Browser -> `POST /promos` -> capture inline -> expand the
  preset -> `types/beatgrid.snap_storyboard` -> `repo.put_json` ->
  `storyboards/<id>.json` at revision 1
- **Render**: Browser -> `POST /promos/{id}/render` (202) -> `service/jobs` queues
  the single worker -> `service/render_pass`, per variant:
  resume scan (`list_frame_numbers`) -> `render-frames.mjs` for the missing tail ->
  threaded `put_frames` -> restore any missing local frames from B2 ->
  `encode_variant` (ffmpeg) -> `extract_poster` -> `upload_bytes` for the MP4 and
  poster -> append a `RenderPass` and `put_json` the manifest
- **Progress**: Browser polls `GET /promos/{id}/progress` (every 1.5s while
  rendering, stops otherwise) -> in-process registry, falling back to the manifest.
  `GET /promos` and `GET /promos/{id}` overlay the same registry
  (`service/jobs.rendering_job_ids()`) so a running pass reports `rendering`
  before the manifest gains its entry; `/promos` polls at 5s while any row is
  in flight. During the upload leg `rendered`/`total` count uploaded objects, so
  the bar and counter keep moving after rasterizing ends.
- **Playback**: Browser -> `GET /promos/{id}` -> presigned inline URLs per variant
  + poster + a sampled frame strip read straight out of `frames/…`
- **Edit**: Browser -> `PATCH /promos/{id}` -> re-snap to the beat grid -> bump
  `revision`; the next render becomes `pass-<NN+1>`
- **Delete**: Browser -> `DELETE /promos/{id}` -> walk exactly
  `types/keys.job_prefixes(id)`; shared `assets/` and other promos untouched

## Observability

- Structured JSON logging on every request with `request_id`
- Request timing middleware (also the catch-all converting uncaught exceptions to
  a typed JSON 500)
- `/metrics` (Prometheus format) and `/health` (B2 connectivity)
- Render passes log frame counts, byte totals and the amplification ratio

## Deployment

- **Local dev** — `pnpm dev` runs both services via `concurrently`
  (web `localhost:3000`, API `localhost:8000`)
- **Railway** — two services from the same repo; see `infra/railway/README.md`.
  The API host must have **Chrome and ffmpeg available** (Remotion downloads
  Chrome Headless Shell on first render; ffmpeg ships with `imageio-ffmpeg`) and
  enough scratch disk for one pass of frames.

## Canonical Files

- Layered API handler: `services/api/app/runtime/promos.py`
- Service orchestration: `services/api/app/service/render_pass.py`
- B2 bulk data access: `services/api/app/repo/b2_frames.py`
- Key layout + scoped delete: `services/api/app/types/keys.py`
- Pure-logic exemplar: `services/api/app/types/beatgrid.py`
- Remotion composition: `packages/remotion/src/Root.tsx`
- Shot-card exemplar: `packages/remotion/src/cards/spotlight-hero-card.tsx`
- Node CLI + NDJSON contract: `packages/remotion/render-frames.mjs`
- Frontend API client: `apps/web/src/lib/api-client.ts`
- Form UX exemplar: `apps/web/src/components/promos/promo-create-form.tsx`
- Shared types + data: `packages/shared/src/`

## Core Features

- [Storyboard Authoring](docs/features/storyboard-authoring.md)
- [Asset Ingest](docs/features/asset-ingest.md)
- [Frame Rendering](docs/features/frame-rendering.md)
- [Encode & Variants](docs/features/encode-and-variants.md)
- [Delivery Manifest](docs/features/delivery-manifest.md)
- [Asset Library](docs/features/asset-library.md)
- [Amplification Dashboard](docs/features/dashboard.md)
- [File Browser](docs/features/file-browser.md)

## References

- [docs/SECURITY.md](docs/SECURITY.md) — security principles and implementation
- [docs/RELIABILITY.md](docs/RELIABILITY.md) — reliability expectations
- [docs/LICENSING.md](docs/LICENSING.md) — Remotion's licence and attribution
- [AGENTS.md](AGENTS.md) — architectural invariants and agent instructions
