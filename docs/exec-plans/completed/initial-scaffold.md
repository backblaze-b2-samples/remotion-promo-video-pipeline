<!-- last_verified: 2026-07-28 -->
# Completed — initial scaffold

The execution plan this repository was built from, kept verbatim as the record of
what was intended. Where the implementation deviated, it is noted at the bottom.

Scaffold plan for a new B2 sample built from the `vibe-coding-starter-kit` template.

---

## 1. Purpose

`remotion-promo-video-pipeline` is a promo-video render pipeline that stores every
byte of its production trail in Backblaze B2 over the S3-compatible API. A
product-marketing or DevRel team (or a coding agent driving
[video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft) on their
behalf) captures the live product UI, composes a storyboard from a shot-card
library, renders the composition frame-by-frame with Remotion, muxes the PNG
sequence with a beat-synced audio bed into an MP4, and re-renders per-platform
cutdowns from the same storyboard. Captures, brand assets, audio, **every
rendered PNG frame**, every finished variant, and a delivery manifest all land in
B2 under stable prefixes, so the bucket becomes a reusable brand-asset and render
archive rather than a dumping ground for finished files.

The reason this is a B2 story is **write amplification**, and the sample is built
to make it measurable rather than asserted. One 36.2-second 1920×1080 pass is
1,086 PNG frames — several GB of intermediates for a ~40 MB MP4. Agent-driven
authoring multiplies that: every storyboard revision is a fresh pass, and four
platform cutdowns multiply it again. The app therefore records, per pass and
cumulatively, `frame_bytes` vs `variant_bytes` and surfaces the resulting ratio
as the dashboard's headline stat. Secondary story is **agent-surface reach**:
video-shotcraft is itself a Claude Code / Codex skill, so wiring B2 in at the
frame/output layer puts B2 inside an agent's production workflow by default.

Everything heavy runs locally — Remotion renders in a local headless Chrome,
ffmpeg encodes locally, captures use a local Playwright Chromium. There is **no
inference API and no second API key**: B2 credentials only.

---

## 2. Architecture delta from `vibe-coding-starter-kit`

Three columns. The starter kit is the ceiling — strip what this app doesn't
need, don't rebuild what it already has.

### KEEP (as-is or near-as-is)

| Area | Path | Note |
|---|---|---|
| Monorepo shape | `package.json`, `pnpm-workspace.yaml`, `scripts/*` | pnpm workspace + Next 16 web + FastAPI service |
| **Bucket explorer (non-negotiable)** | `apps/web/src/app/files/page.tsx`, `components/files/**`, `lib/file-tree.ts` | Full-bucket browse. **Never removable.** Stays wired to the whole bucket, unscoped. |
| Layered API + its guards | `services/api/app/{types,config,repo,service,runtime}/`, `tests/test_structure.py` | Layer order `types < config < repo < service < runtime`; boto3 only in `repo/`; **300-line cap per Python file** |
| S3 client | `app/repo/b2_client.py` | Keep shape: `lru_cache`d boto3 client, `user_agent_extra`, list cache + `_invalidate_list_cache`, presign, health TTL cache |
| Runtime middleware | `main.py` CORS/timing/ratelimit ordering, JSON logging, startup validation | Do not reorder the middleware — read the comment block |
| Design system + primitives | `components/ui/**`, `app/design/page.tsx`, `globals.css` | Full shadcn set incl. `select`, `radio-group`, `form`, `alert-dialog`, `data-table`, `progress`, `sonner` |
| Layout chrome | `components/layout/**` | Sidebar, header, command palette, health banner, theme provider |
| Data layer | `lib/api-client.ts`, `lib/queries.ts`, `lib/query-client.tsx`, `lib/refresh-context.tsx` | TanStack Query wiring |
| Upload machinery | `components/upload/**`, `app/service/upload.py`, `app/runtime/upload.py` | Retargeted (see ADD → `/ingest`), not rewritten |
| Image metadata | `app/service/metadata.py` (image branch), Pillow | Reused for capture/frame probing |
| Doc + agent surface | `AGENTS.md`, `CLAUDE.md`/`GEMINI.md`/`.github/copilot-instructions.md` shims, `ARCHITECTURE.md`, `PRODUCT.md`, `docs/**`, `scripts/check-agent-docs.mjs` | Content rewritten, **contract preserved** — see §2.1 |
| CI | `.github/workflows/ci.yml` | Job keys `verify-agent-docs`, `verify-api`, `verify-web` must survive |
| Deploy notes | `infra/railway/README.md` | Kept; add one line that rendering needs a host with Chrome + ffmpeg |
| Pre-commit, eslint, vitest, playwright configs | root + `apps/web/*` | As-is |

### TRIM (remove from the starter)

| Remove | Why |
|---|---|
| `apps/web/src/app/upload/page.tsx` | Superseded by `/ingest`, which does capture **and** asset upload. Two upload surfaces would be redundant — move the route, keep the components. |
| `PyPDF2` from `requirements.txt` + the PDF branch of `app/service/metadata.py` | No PDFs anywhere in this pipeline |
| `docs/features/metadata-extraction.md`, `docs/features/file-upload.md`, `docs/features/dashboard.md` | Rewritten under new names (§5) |
| `docs/exec-plans/active/2026-07-27-agent-usability-remediation.md`, `docs/exec-plans/completed/2026-02-*.md`, `docs/exec-plans/tech-debt-tracker.md` entries | Starter-kit history, not this sample's. Keep the directories + `.gitkeep`; this plan lands in `completed/initial-scaffold.md`. |
| `apps/web/public/{next,vercel,file,globe,window}.svg` | Next.js boilerplate art |
| Starter-kit `.git` history | Builder starts a fresh repo (`Initial scaffold` style commit) |

### ADD (new for this sample)

**New workspace package — `packages/remotion/`** (`@remotion-promo-video-pipeline/remotion`)

| File | Purpose |
|---|---|
| `package.json` | deps: `remotion`, `@remotion/bundler`, `@remotion/renderer`, `react`, `react-dom` — pin `remotion@4.0.500` family (`^4.0.500`) |
| `src/index.ts` | `registerRoot(Root)` |
| `src/Root.tsx` | One `<Composition id="Promo">` whose `width`/`height`/`durationInFrames`/`fps` come from `calculateMetadata` reading `inputProps` — this is how one composition serves all four variants |
| `src/Promo.tsx` | Maps the storyboard's beat-snapped shots to `<Sequence from=… durationInFrames=…>` and dispatches each to its shot card |
| `src/cards/*.tsx` | **10 implemented shot cards** (§4) — each takes `{copy, capture, accent, variant, durationInFrames}` |
| `src/cards/index.ts` | `CARD_COMPONENTS: Record<string, ComponentType<ShotProps>>`, keyed by the card ids in the shared JSON |
| `src/lib/variant.ts` | Variant id → `{width, height, fit, muted}`; safe-area insets so 16:9 captures survive a 9:16 reframe |
| `render-frames.mjs` | **The CLI the Python backend spawns.** Args: `--storyboard <path> --variant <id> --out-dir <path> --frame-range a-b --concurrency N`. Uses `bundle()` → `selectComposition()` → `renderFrames({imageFormat:'png', ...})`. Emits **NDJSON on stdout** (`{"type":"progress","rendered":N,"total":M}`, then `{"type":"done","frameCount":N}`), errors as `{"type":"error","message":…}` + non-zero exit. Never prints anything non-JSON to stdout (logs go to stderr) so the Python side can parse line-by-line. |

**Shared, read by both TS and Python — `packages/shared/`**

| File | Purpose |
|---|---|
| `src/shot-cards.json` | Single source of truth for card metadata: `id`, `title`, `category`, `energy`, `default_duration_frames`, `purpose`, `pitfalls[]`, `implemented: true`. Consumed by `packages/remotion` (TSX), the API (`runtime/shotcards.py` reads the file), and the `/shot-cards` page. **No duplicated registry.** |
| `src/storyboard-presets.json` | The 3 presets (§4.2) |
| `src/types.ts` (extend) | `ShotCard`, `Shot`, `Storyboard`, `PromoJob`, `RenderPass`, `Variant`, `DeliveryManifest`, `AmplificationStats` |

**Backend — `services/api/app/`** (every file under the 300-line cap)

| File | Layer | Purpose |
|---|---|---|
| `types/promo.py` | types | Pydantic models mirroring the shared TS types |
| `types/beatgrid.py` | types | **Pure** beat-snapping: `beat_frames(fps, bpm)`, `snap_storyboard(shots, fps, bpm)` → shot boundaries pulled to the nearest beat, total duration preserved. Pure ⇒ lives at the lowest layer and is trivially unit-testable. |
| `types/keys.py` | types | **Every** B2 key builder in one place (§3.1) + `job_prefixes(job_id)` used by scoped delete |
| `repo/b2_frames.py` | repo | Bulk frame I/O: `put_frames(keys_and_paths, concurrency)` via `ThreadPoolExecutor`, invalidating the list cache **once** at the end (not 1,086 times); `list_frame_numbers(prefix)` for resume; `delete_prefix(prefix)` for scoped cleanup |
| `repo/b2_json.py` | repo | `put_json` / `get_json` for storyboards + manifests |
| `service/promos.py` | service | Job CRUD over B2: create/list/get/update(revision bump)/delete |
| `service/render_pass.py` | service | Orchestrates one pass: resume-scan → render frames → upload frames → encode → poster → upload variant → manifest |
| `service/render_engine.py` | service | Spawns `render-frames.mjs`, parses the NDJSON progress stream, resolves `node` |
| `service/encode.py` | service | ffmpeg: frames+audio → MP4, poster extraction, ffmpeg binary resolution |
| `service/capture.py` | service | Playwright captures at 2× per viewport; Pillow placeholder fallback |
| `service/assets.py` | service | Scoped `assets/<product>/` listing for the Library view |
| `service/jobs.py` | service | In-process pass runner: `ThreadPoolExecutor(max_workers=1)` + lock-guarded status registry. Single-replica limitation documented in `docs/RELIABILITY.md` (same stance the starter takes for its in-process rate limiter). |
| `runtime/promos.py` | runtime | `/promos` CRUD + `/promos/{id}/render` + progress |
| `runtime/assets.py` | runtime | `/assets`, `/captures` |
| `runtime/shotcards.py` | runtime | `/shot-cards`, `/storyboard-presets` |

**Frontend — `apps/web/src/`**

| Route | Purpose |
|---|---|
| `/` | Dashboard, rebuilt: amplification-first stat cards, write-volume chart, recent renders table |
| `/promos` | **Primary entity list** — table with poster thumbnail, status badge, row actions (view / edit / render / delete) |
| `/promos/new` | Create form (§4.3) |
| `/promos/[id]` | Detail: `<video>` per variant (presigned), storyboard timeline, pass history, frame-strip sample, manifest viewer, Render / Edit / Delete |
| `/promos/[id]/edit` | Storyboard editor: per-shot card `Select`, copy inputs, duration, SFX `Select`, add/remove/reorder |
| `/library` | **Sample-specific scoped asset explorer** (required by the skill) — `assets/<product>/` only: capture thumbnails, inline `<audio>` for BGM/SFX, brand files |
| `/shot-cards` | Shot-card library browser, filterable by category; links upstream for the full 104 |
| `/ingest` | Capture-from-URL form + manual asset upload (replaces `/upload`) |
| `/files` | **Untouched full-bucket explorer** |
| `/settings`, `/design` | Kept, retargeted copy |

Sidebar nav becomes: Dashboard, Promos, Library, Shot Cards, Ingest, Files, Settings; Reference group keeps Design System.

**Scripts**

| File | Purpose |
|---|---|
| `scripts/make-demo-assets.mjs` | **Synthesizes** the demo audio bed with ffmpeg — a 120 BPM WAV click/pad track plus 3 WAV SFX. WAV means no encoder dependency and no third-party audio licence. **No binary asset is committed**; it is generated on demand. |
| `scripts/setup-capture.mjs` | Opt-in `python -m playwright install chromium` (~150 MB), kept out of `pnpm run setup` so cold start stays fast |

### 2.1 Contracts the builder must not break

These are the silent build-failure traps in this starter kit. Verified by reading
`scripts/check-agent-docs.mjs` and `scripts/agent-docs/workflow.mjs`:

1. **`package.json` gate chains must still compose their gates** — `verify` ⊇
   {`pnpm check:agent-docs`, `pnpm verify:api`, `pnpm verify:web`}; `verify:api` ⊇
   {`pnpm lint:api`, `pnpm test:api`, `pnpm check:structure`}; `verify:web` ⊇
   {`pnpm lint`, `pnpm test:web`, `pnpm build`}; `verify:full` ⊇ {`pnpm run doctor`,
   `pnpm verify`, `pnpm test:e2e`}. Adding gates is fine; dropping one fails.
2. **`.github/workflows/ci.yml`** must keep job keys `verify-agent-docs`,
   `verify-api`, `verify-web` and `run:` steps invoking the three `pnpm` gates.
3. **Every one of** `pnpm run setup`, `pnpm check:agent-docs`, `pnpm verify`,
   `pnpm verify:api`, `pnpm verify:web`, `pnpm verify:full` must appear
   *literally* in **AGENTS.md, README.md and docs/dev-workflows.md**.
4. **`AGENTS.md`**: ≥1 KB, ≤20 KB, ≤250 lines, and its **"Secret Handling"**
   section must contain statements that *forbid* — each in the same sentence as a
   prohibition — `.env`/env files, credentials, API keys, printing/exposing, and
   a leak surface (logs/screenshots/chat/commits).
5. **`docs/SECURITY.md`** must link `AGENTS.md` by a **working anchor** whose
   target heading matches `/secret handling/i`.
6. **`CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`**: non-empty,
   ≤1 KB, ≤20 lines, each mentioning `AGENTS.md`. Thin pointers only.
7. **`.env.example` must exist** (`scripts/setup.mjs` copies it to `.env`), and
   `.env` must stay git-ignored.
8. **`pnpm-workspace.yaml` `allowBuilds:` must list `esbuild: true`** explicitly.
   Remotion's bundler pulls esbuild; pnpm 11 otherwise rewrites the file with the
   literal placeholder `esbuild: set this to true or false`, which breaks
   `pnpm install --frozen-lockfile`. (A sibling sample in `.local/` is currently
   sitting in exactly that broken state — do not repeat it.) Add
   `@remotion/compositor-*` entries the same way if pnpm asks.
9. **`tests/test_structure.py`**: no backward layer imports, boto3/botocore only
   under `app/repo/`, **no Python file over 300 lines**, all five layer dirs with
   `__init__.py`.

---

## 3. B2 surface

**S3-compatible API only. No b2-native API anywhere** — no `b2sdk`, no
`b2` CLI, no `api.backblazeb2.com` calls. Nothing in this pipeline needs a
b2-native capability, so there is nothing to justify.

| S3 operation | Where | Used for |
|---|---|---|
| `head_bucket` | `repo/b2_client.check_connectivity` | `/health` (kept) |
| `put_object` | `repo/b2_frames.put_frames`, `repo/b2_json.put_json`, `service/upload` | Frame PNGs (bulk, threaded), captures, synthesized audio, brand files, storyboard JSON, manifest JSON, variant MP4s, poster JPEGs |
| `list_objects_v2` (paginated) | `repo/b2_client._fetch_all_objects`, `repo/b2_frames.list_frame_numbers` | Bucket explorer, scoped Library listing, dashboard stats, **resume scan** |
| `head_object` | `repo/b2_client.get_file_metadata` | Detail views, existence checks |
| `get_object` | `repo/b2_json.get_json` | Reading storyboards + manifests back |
| `delete_object` | `repo/b2_client.delete_file`, `repo/b2_frames.delete_prefix` | **Prefix-scoped** job deletion |
| `generate_presigned_url` | `repo/b2_client.get_presigned_url` | Serving variant MP4s to `<video>`, posters, capture thumbnails, audio players |

Multipart upload is **not** used: variant MP4s at demo scale are tens of MB and a
single `put_object` is the honest, readable path. Noted here so its absence reads
as a decision rather than an omission.

### 3.1 Key layout

```
assets/<product>/captures/<viewport>/<name>@2x.png
assets/<product>/audio/bgm/<name>.wav
assets/<product>/audio/sfx/<category>/<name>.wav
assets/<product>/brand/<name>.(png|svg|json)
storyboards/<job-id>.json                       # also the job record (§3.2)
frames/<job-id>/pass-<NN>/<variant>/frame-%06d.png
renders/<job-id>/<variant>.mp4
renders/<job-id>/<variant>.poster.jpg
manifests/<job-id>.json
```

Two documented extensions to the brief's layout, both load-bearing:
`frames/<job-id>/<pass>/` gains a `<variant>/` level (four variants render
different pixel dimensions into the same pass and would otherwise collide), and
`renders/` gains a `.poster.jpg` per variant (needed so the `/promos` list can
paint real media, not a placeholder box).

**Scoped deletes.** `types/keys.job_prefixes(job_id)` returns exactly
`storyboards/<id>.json`, `frames/<id>/`, `renders/<id>/`, `manifests/<id>.json`.
Delete walks only those. No bucket-wide delete path exists in the codebase, and
`allowed_key_prefix` stays available for a shared bucket.

### 3.2 Where job state lives

B2 is the only store — no database. `storyboards/<job-id>.json` **is** the job
record: it carries `job_id`, `product`, `title`, `revision`, `created_at`,
`updated_at`, `bpm`, `fps`, `variants[]` and `shots[]`. Listing `storyboards/`
enumerates jobs. `manifests/<job-id>.json` accumulates one entry per completed
pass (which revision it rendered, frame counts, byte totals, variant keys,
durations). Editing a storyboard bumps `revision`; the next render becomes
`pass-<NN>` — **that is the write-amplification loop, made explicit in the data
model.** In-flight progress is in-process only and is lost on restart; a
half-finished pass is recoverable because the resume scan re-reads what already
landed in B2.

---

## 4. Key features

No feature uses an external API. There are **no external providers and no
Genblaze usage** — the description names neither, and Remotion/ffmpeg/Playwright
all run on-device. Every feature below is therefore `deployment: local`,
`provider: none`, `api_key_env: none`, `estimated_cost_per_demo_run: $0.00`
(B2 storage/egress only).

Per `api-provider-selection.md`, local features inherit the CPU-default /
accelerator-autodetect rule. Its shape here: the heavy work is browser
rasterization inside Remotion's headless Chrome plus an x264 encode, so there is
**no CUDA/MPS code path to select** — the tunable is parallelism, and it is
auto-detected, never hard-coded. `RENDER_CONCURRENCY=auto` resolves to
`max(1, min(os.cpu_count() // 2, 8))` and is clamped to ≥1 so it can never
resolve to 0. Optional GPU rasterization stays opt-in via
`REMOTION_GL` (`angle` on macOS) and defaults to unset. Stated explicitly so the
reviewer can gate on it.

1. **Storyboard authoring & shot-card library** — `deployment: local`. 10 real
   Remotion shot cards drawn from video-shotcraft's 104-card taxonomy, with the
   upstream ids preserved: `spotlight-hero-card`, `paper-title-card`,
   `typewriter-moves`, `deck-deal-flyin`, `row-embed`, `crash-zoom-punch`,
   `odometer-digit-roll`, `beat-cut-moves`, `wipe-transitions`,
   `ui-to-brand-morph` — one from each of the 10 upstream categories. Metadata
   (category, energy, default duration, pitfalls) lives once in
   `packages/shared/src/shot-cards.json`.
2. **Product-page capture ingest** — `deployment: local`. Playwright Chromium,
   `device_scale_factor=2`, three viewports (desktop 1440×900, tablet 834×1112,
   mobile 390×844) → `assets/<product>/captures/…@2x.png`. If the Chromium
   download is absent, capture falls back to a Pillow-generated placeholder card
   and says so in the response, so the pipeline is demoable end-to-end on a cold
   clone without a 150 MB download.
3. **Beat-synced frame rendering with resumable B2 intermediates** —
   `deployment: local`. Shot boundaries snap to the `bpm` beat grid
   (`types/beatgrid.py`, pure). Before rendering, the pass lists
   `frames/<id>/pass-NN/<variant>/` on B2 and renders only the missing tail via
   Remotion's `frameRange` — a killed render resumes instead of restarting.
   Every frame is uploaded, threaded, `FRAME_UPLOAD_CONCURRENCY=8`.
4. **Encode + per-platform variants** — `deployment: local`. ffmpeg muxes the PNG
   sequence with the audio bed into H.264/AAC 30 fps. Four variants
   (`master-16x9`, `vertical-9x16`, `square-1x1`, `loop-muted-16x9`) are **real
   re-renders** from the same storyboard at each variant's dimensions, not crops
   of the master. ffmpeg is resolved `FFMPEG_BINARY` env → bundled
   `imageio-ffmpeg` → `shutil.which("ffmpeg")`, so a fresh clone needs no
   system ffmpeg.
5. **Delivery manifest + write-amplification accounting** — `deployment: local`.
   `manifests/<job-id>.json` records storyboard revision → shot cards used →
   frame ranges → variant keys → durations, plus `frames_written`,
   `frame_bytes`, `variant_bytes` and `amplification_ratio`. The dashboard leads
   with that ratio; it is the whole reason this workload belongs on B2.
6. **Scoped asset library + full bucket explorer** — `deployment: local`.
   `/library` is scoped to `assets/<product>/` with audio players and capture
   thumbnails; `/files` remains the untouched full-bucket explorer.

### 4.1 Primary entity lifecycle — **Promo job**

The single primary entity is the **promo job** (storyboard + its render passes).
All five verbs ship in the UI, so `omitted_ui_verbs` is expected to be **empty**:

| Verb | UI surface | Backend |
|---|---|---|
| create | `/promos/new` form | `POST /promos` → writes `storyboards/<id>.json` at `revision: 1` |
| read | `/promos` list + `/promos/[id]` detail | `GET /promos`, `GET /promos/{id}` |
| edit | `/promos/[id]/edit` storyboard editor | `PATCH /promos/{id}` → bumps `revision` |
| delete | Row action + detail `AlertDialog` | `DELETE /promos/{id}` → prefix-scoped purge |
| run | "Render" button on list row + detail | `POST /promos/{id}/render` → 202 + pass id; `GET /promos/{id}/progress` polls |

### 4.2 Storyboard presets

| id | Shots | Duration | Frames @30fps | Role |
|---|---|---|---|---|
| `release-teaser` | 6 | 6.0 s | 180 | **Demo default** — fast enough to render in a verify run |
| `feature-tour` | 10 | 18.0 s | 540 | Mid-size |
| `ink-press-full` | 10 | 36.2 s | 1086 | Mirrors upstream's Ink Press template — the write-amplification headliner |

`RENDER_PRESET=demo` (default) → 1280×720, preset `release-teaser`, variants
`master-16x9,vertical-9x16`. `RENDER_PRESET=full` → 1920×1080, all four
variants. The README states the full-scale numbers explicitly while the default
demo stays runnable on a laptop and modest in the shared dev bucket.

### 4.3 Form UX conventions

Exemplar to copy: `apps/web/src/components/settings/settings-form.tsx` (already
does both rules).

**Finite-value fields → selector, never free text** (applies to create *and*
edit):

| Field | Control | Values |
|---|---|---|
| Storyboard preset | `Select` | `release-teaser`, `feature-tour`, `ink-press-full` |
| BPM | `Select` | 90, 110, 120, 128 |
| Resolution | `Select` | 1280×720, 1920×1080 |
| Variants | checkbox group | the 4 variant ids |
| Capture viewports | checkbox group | desktop, tablet, mobile |
| Shot card (edit rows) | `Select` | the 10 implemented card ids |
| SFX (edit rows) | `Select` | the synthesized SFX ids + "none" |
| Accent theme | `RadioGroup` | `ink-amber`, `neon-cyan`, `mono-slate` |

Free text stays free text only where it genuinely is: product slug, video title,
headline/sub copy, capture URL.

**Create-form defaults as guidance only** — placeholder / `FormDescription`, and
**no autofill button**: product `demo-product`, title
`"Ship faster with <product>"`, capture URL `http://localhost:3000` (the sample's
own UI, so a first run needs nothing external), preset `release-teaser`, BPM 120,
resolution 1280×720, variants `master-16x9` + `vertical-9x16`, accent
`ink-amber`. The edit form opens pre-filled from the stored storyboard and
carries no default hints.

---

## 5. Doc transforms

| Starter doc | Action |
|---|---|
| `README.md` | Rewrite: purpose, write-amplification numbers, B2 key layout, prerequisites (Node 20+, Python 3.11+, ~2 GB free for frames), quickstart, **Licensing** section (§5.1), video-shotcraft attribution. Must still name all six documented commands. |
| `AGENTS.md` | Rewrite body; **preserve** the Secret Handling section wording contract, the six commands, and the ≤250-line / ≤20 KB budget |
| `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md` | Keep as ≤20-line pointers to `AGENTS.md` |
| `ARCHITECTURE.md` | Rewrite: five-layer API + the Node render package + the frame/encode data flow; document the Python→Node NDJSON boundary |
| `PRODUCT.md` | Rewrite around the promo-render use case |
| `docs/app-workflows.md` | Rewrite: ingest → storyboard → render → encode → variants → manifest |
| `docs/dev-workflows.md` | Rewrite; must name all six commands, plus `pnpm run make-demo-assets` and `pnpm run setup:capture` |
| `docs/SECURITY.md` | Keep + fix the anchored `AGENTS.md#…-secret-handling` link; add a note that presigned URLs are the only read path for renders |
| `docs/RELIABILITY.md` | Add: single-worker in-process pass runner, resume-from-B2 semantics, partial-pass recovery |
| `docs/features/file-browser.md` | Keep (bucket explorer), light edit |
| `docs/features/file-upload.md` | → **delete**, replaced by `asset-ingest.md` |
| `docs/features/metadata-extraction.md` | → **delete** (PDF branch gone; image probing folded into the render docs) |
| `docs/features/dashboard.md` | → rewrite as the amplification dashboard |
| **New** `docs/features/storyboard-authoring.md` | Cards, presets, beat grid |
| **New** `docs/features/asset-ingest.md` | Captures + manual asset upload |
| **New** `docs/features/frame-rendering.md` | Remotion invocation, resume, frame upload |
| **New** `docs/features/encode-and-variants.md` | ffmpeg mux, the four variants, posters |
| **New** `docs/features/delivery-manifest.md` | Manifest schema + amplification math |
| **New** `docs/features/asset-library.md` | Scoped `assets/<product>/` explorer |
| **New** `docs/LICENSING.md` | §5.1 |
| `docs/features/_template.md` | Keep; every new feature doc follows it including the `<!-- last_verified: -->` stamp |
| `docs/exec-plans/completed/initial-scaffold.md` | This plan, moved here on PASS |

### 5.1 Licensing — a real constraint, flagged not hidden

**Remotion is not open-source software.** It is source-available under the
Remotion License: free for individuals and companies of up to three employees,
but a **paid company licence is required for organisations with four or more
employees**. This sample cannot avoid it — Remotion is the thing being
demonstrated — so it must be stated plainly instead of discovered later:

- `docs/LICENSING.md` spells out the three layers: **our code** under the
  starter kit's licence; **Remotion** under the Remotion License (link to
  `remotion.dev/license`) with the ≥4-employee trigger called out; **shot-card
  recipes/ids** derived from video-shotcraft (Apache-2.0, attributed).
- `README.md` carries a short **Licensing** callout above the quickstart, not
  buried at the bottom.
- The demo audio bed is **synthesized locally with ffmpeg into WAV**, so no
  third-party audio licence (and no committed binary) enters the repo at all.
  Upstream's bundled Mixkit BGM/SFX are referenced, never vendored.

---

## 6. Rename table

| Identifier | From | To |
|---|---|---|
| Repo / root package name | `vibe-coding-starter-kit` | `remotion-promo-video-pipeline` |
| Web workspace package | `@vibe-coding-starter-kit/web` | `@remotion-promo-video-pipeline/web` |
| Shared workspace package | `@vibe-coding-starter-kit/shared` | `@remotion-promo-video-pipeline/shared` |
| New render package | — | `@remotion-promo-video-pipeline/remotion` |
| `pnpm --filter` targets in root scripts | `@vibe-coding-starter-kit/web` | `@remotion-promo-video-pipeline/web` |
| `APP_NAME` (`lib/app-config.ts`) | `OSS Starter Kit` | `Promo Render Pipeline` |
| `APP_DESCRIPTION` | `File management dashboard powered by Backblaze B2` | `Agent-driven promo video rendering, archived on Backblaze B2` |
| Sidebar header fallback text | `oss-starter-kit` / `Page` | driven by `APP_NAME` + route title (fixes the starter's hardcoded branding leak) |
| FastAPI `title` | `OSS Starter Kit API` | `Promo Render Pipeline API` |
| FastAPI `description` | `File upload and management API backed by Backblaze B2` | `Promo video render pipeline backed by Backblaze B2` |
| **`user_agent_extra`** | `b2ai-oss-start` | **`b2ai-remotion-promo-video-pipeline`** |
| UTM `utm_content` (sidebar footer, README, `.env.example` links) | `b2ai-oss-start` | `b2ai-remotion-promo-video-pipeline` |
| Title Case / prose name | `Vibe Coding Starter Kit` | `Remotion Promo Video Pipeline` |
| snake_case (Python modules, fixtures) | `vibe_coding_starter_kit` | `remotion_promo_video_pipeline` |
| CI workflow `name:` | starter's | `verify` (job keys unchanged) |
| Container/image tag in `infra/railway/README.md` | `vibe-coding-starter-kit` | `remotion-promo-video-pipeline` |
| E2E spec | `apps/web/e2e/upload.spec.ts` → | `apps/web/e2e/ingest.spec.ts`, targeting `/ingest` |

### 6.1 Env var renames — B2 Standard #3 compliance

The starter kit deviates from the parent CLAUDE.md standard. Fix on the way in,
matching the sibling-sample pattern:

| Starter | This sample |
|---|---|
| `B2_KEY_ID` | **`B2_APPLICATION_KEY_ID`** |
| `B2_APPLICATION_KEY` | `B2_APPLICATION_KEY` (unchanged) |
| `B2_BUCKET_NAME` | `B2_BUCKET_NAME` (unchanged) |
| *(absent)* | **`B2_REGION`** — required; the S3 endpoint is derived as `https://s3.<region>.backblazeb2.com` via a `s3_endpoint` property. No region literal baked into source. |
| `B2_ENDPOINT` (required) | `B2_ENDPOINT` — **optional override** only |
| `B2_PUBLIC_URL` | **`B2_PUBLIC_URL_BASE`** — optional |

Startup validation in `main.py` updates to the new names, and
`PLACEHOLDER_VALUES` updates to the new `.env.example` placeholders.

New app env vars, all defaulted so a filled-in `.env` needs only the B2 block:
`RENDER_PRESET=demo`, `RENDER_WIDTH`, `RENDER_HEIGHT`, `RENDER_FPS=30`,
`RENDER_CONCURRENCY=auto`, `RENDER_VARIANTS=master-16x9,vertical-9x16`,
`REMOTION_GL=` (unset), `FRAME_UPLOAD_ENABLED=true`,
`FRAME_UPLOAD_CONCURRENCY=8`, `CAPTURE_URL_DEFAULT=http://localhost:3000`,
`PROMO_PRODUCT_DEFAULT=demo-product`, `FFMPEG_BINARY=`, `NODE_BINARY=`.

---

## 7. Verification the builder must leave green

- `pnpm run setup` from a clean clone; `pnpm-workspace.yaml` already has
  `esbuild: true` so `--frozen-lockfile` does not stall.
- `pnpm verify` green: `check:agent-docs` + `lint:api` + `test:api` +
  `check:structure` + `lint` + `test:web` + `build`.
- **`pnpm lint` and `pnpm build` explicitly confirmed** — the last phases are the
  ones a timed-out build silently skips, and a green backend is not evidence the
  frontend compiles.
- New Python unit tests, none needing B2 or a real render: beat-grid snapping;
  key builders + `job_prefixes` scoping; amplification math; storyboard revision
  bump; manifest round-trip; every preset references only ids present in
  `shot-cards.json`; ffmpeg/node resolution raises a clear actionable error when
  the binary is missing; `/promos` routes against the mocked-S3 pattern already
  in `services/api/tests/conftest.py`.
- Web unit tests for the amplification formatter and the storyboard-editor
  reducer.
- `render-frames.mjs` prints **only** NDJSON on stdout.

**Requirements additions:** `playwright>=1.49`, `imageio-ffmpeg>=0.5.1`, keep
`Pillow`. Pin upper bounds where the starter does. Drop `PyPDF2`.

---

## 8. Open tensions, recorded

1. **Remotion's licence is not OSS** (§5.1). Unavoidable for this sample —
   documented prominently rather than worked around.
2. **The bucket explorer overlaps `/library`.** Per the skill's non-negotiable
   rule, `/files` stays exactly as it is even though `/library` is the view a
   promo author actually wants. They are deliberately different scopes:
   whole-bucket forensics vs. this product's assets.
3. **Frame upload cost.** Uploading every PNG is the *point* of the sample, so
   `FRAME_UPLOAD_ENABLED` defaults to `true`. The `demo` preset keeps a first run
   to roughly 180 frames × 2 variants so the shared dev bucket is not flooded.
4. **In-process pass runner** is a single-replica design. Correct for a sample,
   wrong for production; called out in `docs/RELIABILITY.md`.
5. **Playwright's Chromium download** is opt-in, with a Pillow placeholder
   fallback, to keep `pnpm run setup` fast on a cold clone.


---

## Implementation notes (post-build)

Deviations from the plan above, each with its reason:

1. **The demo audio bed and SFX are synthesized with the Python standard library
   (`wave` + `math`), not with ffmpeg** (§2 ADD → `scripts/make-demo-assets.mjs`).
   The plan's own rationale for WAV was "no encoder dependency"; stdlib synthesis
   removes even the ffmpeg dependency for audio, is deterministic, and lets the bed
   be generated at the job's exact BPM. ffmpeg is still required — for the video
   mux only. `scripts/make-demo-assets.mjs` is a thin CLI that calls
   `POST /assets/demo-audio` so the script and a real render can never disagree
   about what the bed sounds like (one implementation, in `service/audio.py`).

2. **Three extra small files** beyond the plan's file table, all forced by the
   300-line-per-file cap or by DRY:
   - `types/variants.py` + `packages/shared/src/variants.json` — variant geometry
     as one source of truth read by *both* Python and `src/lib/variant.ts`, rather
     than duplicated in each language.
   - `types/library.py` — loaders for the shared JSON (used by the API, the
     `/shot-cards` route and the preset expansion).
   - `service/promo_views.py` and `service/render_payload.py` — read-side
     projections and the render payload, split out of `service/promos.py` (367
     lines) and `service/render_pass.py` (303 lines).
   - `repo/b2_media.py` and `repo/b2_stats.py` — split out of `repo/b2_client.py`
     once the env rename pushed it past 300 lines, following the existing
     `repo/b2_object.py` precedent.

3. **`.env.example` keeps every app-specific key commented out.** All of them have
   working defaults in `settings.py`, so an uncommented block would imply they are
   required. The five B2 standard names are present, four of them uncommented; the
   render keys are documented with their default value inline.

4. **`components/upload/upload-form.tsx` was deleted** rather than kept unused.
   `/ingest` uses `asset-upload-form.tsx` (product- and kind-aware); keeping the old
   generic form would have been dead code. `dropzone.tsx` and `upload-progress.tsx`
   are reused as-is, which is what the plan's "retargeted, not rewritten" intent was
   about.

5. **PDF trimming went one step further than the plan's line item.** With the
   extraction branch gone, `pdf_pages` / `pdf_author` / `pdf_title` would have been
   permanently null, so the fields were removed from `FileMetadataDetail`, the shared
   TS type and the metadata panel too.

### Verified at build time

- `pnpm lint`, `pnpm build`, `pnpm test:web` (108 tests), `pnpm test:api`
  (178 tests), `pnpm check:structure`, `pnpm check:agent-docs` — all green.
- A **real end-to-end pass against B2**: `release-teaser` at 1280x720 with real
  Playwright captures of this app's own `/promos` page, two variants, 360 PNG
  frames uploaded to `frames/<job>/pass-01/<variant>/`, two MP4s + two posters in
  `renders/<job>/`, a synthesized bed in `assets/demo-product/audio/bgm/`, and a
  manifest reporting **42.44x** write amplification (35.1 MB of frames for 846.5 KB
  of delivered video).
