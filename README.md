<!-- last_verified: 2026-07-28 -->
# Remotion Promo Video Pipeline

Render promo videos with [Remotion](https://www.remotion.dev/) and keep **every
byte of the production trail** in **[Backblaze
B2](https://www.backblaze.com/sign-up/ai-cloud-storage?utm_source=github&utm_medium=referral&utm_campaign=ai_artifacts&utm_content=b2ai-remotion-promo-video-pipeline)** —
product captures, brand assets, the audio bed, **every rendered PNG frame**, every
finished MP4 cutdown, and a delivery manifest.

A product-marketing or DevRel team (or a coding agent driving
[video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft) on their
behalf) captures the live product UI, composes a storyboard from a shot-card
library, renders it frame by frame, muxes the PNG sequence with a beat-synced
audio bed into an MP4, and re-renders per-platform cutdowns from the same
storyboard. The bucket becomes a reusable brand-asset and render archive instead
of a dumping ground for finished files.

## Why this belongs on object storage

**Write amplification** — and this app measures it rather than asserting it.

| | Frames per pass | Intermediate bytes | Delivered |
|---|---|---|---|
| `demo` preset (default) | 180 x 2 variants = **360 PNGs** | ~35 MB | ~850 KB of MP4 |
| `full` preset, 36.2s @ 1080p | 1,086 x 4 variants = **4,344 PNGs** | several GB | ~40 MB of MP4 |

Every storyboard revision is a fresh pass, and each platform cutdown multiplies
it again. `manifests/<job-id>.json` records `frame_bytes` vs `variant_bytes` for
every pass, and the dashboard leads with the resulting ratio. A first `demo` run
measures roughly **40x**.

The second reason is **agent-surface reach**: video-shotcraft is itself a Claude
Code / Codex skill, so wiring B2 in at the frame and output layer puts B2 inside
an agent's production workflow by default.

## Licensing — read this before you adopt it

**Remotion is not open-source software.** It is source-available under the
[Remotion License](https://remotion.dev/license): free for individuals and
companies of up to three employees, but **organisations with four or more
employees need a paid company licence**. This sample cannot avoid that — Remotion
is the thing being demonstrated.

Our code is under the repo's own licence ([LICENSE](LICENSE)); the shot-card
recipes and ids are derived from video-shotcraft (Apache-2.0, attributed); the
demo audio is synthesized locally as WAV, so **no third-party audio licence and
no committed binary asset** enter this repo. Full detail:
[docs/LICENSING.md](docs/LICENSING.md).

## What you get

- **Storyboard authoring** — 10 real Remotion shot cards drawn from
  video-shotcraft's 104-card taxonomy (one per category), with upstream ids
  preserved. Shot boundaries snap to the job's BPM beat grid.
- **Capture ingest** — Playwright Chromium at `device_scale_factor=2` across
  desktop / tablet / mobile, straight into `assets/<product>/captures/`.
- **Resumable frame rendering** — every frame is uploaded to B2 as it is
  produced; a killed render lists what already landed and renders only the
  missing tail.
- **Encode + per-platform variants** — ffmpeg muxes frames + audio into
  H.264/AAC. `master-16x9`, `vertical-9x16`, `square-1x1` and `loop-muted-16x9`
  are **real re-renders** at each variant's dimensions, not crops of the master.
- **Delivery manifest** — revision, shot cards, frame counts, byte totals and the
  amplification ratio per pass.
- **Scoped asset library + full bucket explorer** — `/library` for one product's
  material, `/files` for whole-bucket forensics.

## What it looks like

- `/` — amplification-first dashboard: ratio, frames archived, delivered bytes,
  bytes-per-pass chart
- `/promos` — the promo list with poster thumbnails and row actions
  (view / edit / render / delete)
- `/promos/[id]` — per-variant `<video>` playback, storyboard timeline, pass
  history, a strip of real frames read back out of B2, and the manifest
- `/promos/[id]/edit` — storyboard editor (card selector, copy, duration, SFX,
  reorder)
- `/library`, `/shot-cards`, `/ingest`, `/files`, `/settings`, `/design`

## Quick Start

You need **Node.js >= 20**, **pnpm >= 9**, **Python >= 3.11**, a free
**[Backblaze B2
account](https://www.backblaze.com/sign-up/ai-cloud-storage?utm_source=github&utm_medium=referral&utm_campaign=ai_artifacts&utm_content=b2ai-remotion-promo-video-pipeline)**,
and **~2 GB of free disk** for frame scratch during a `full`-preset pass.

No GPU, no ffmpeg install and no second API key are required: ffmpeg ships with
the `imageio-ffmpeg` wheel, Remotion downloads its own Chrome Headless Shell
(~120 MB) on the first render, and B2 credentials are the only secret.

### Supported local environments

Local scripts are supported on macOS, Linux, and WSL2. Native Windows is not
supported yet because the dev scripts use POSIX shell syntax and
`services/api/.venv/bin/*` paths; use WSL2 on Windows.

Cloud or sandboxed agent environments also need permission for dependency
downloads during `pnpm run setup`, plus localhost binding for the web server on
port 3000 and the API on 8000-8009.

### 1. Install

```bash
pnpm run setup
```

Copies `.env.example` to `.env` only when `.env` does not exist, installs
workspace dependencies from the lockfile, creates `services/api/.venv`, and
installs the API requirements. Safe to rerun; never overwrites your `.env`.

> Use the `pnpm run` form: `setup` (like `doctor`) is a built-in pnpm command
> before pnpm 11, so bare `pnpm setup` would run pnpm's own command instead.

### 2. Add your B2 credentials

Open `.env`, then in the [Backblaze B2
dashboard](https://secure.backblaze.com/b2_buckets.htm?utm_source=github&utm_medium=referral&utm_campaign=ai_artifacts&utm_content=b2ai-remotion-promo-video-pipeline):

1. **Create a bucket** → paste its name into `B2_BUCKET_NAME`, and the middle
   segment of its Endpoint (`s3.<region>.backblazeb2.com`) into `B2_REGION`. The
   S3 endpoint is derived from the region, so no region string is hardcoded in
   source.
2. **Create an application key** with `Read and Write` →
   `B2_APPLICATION_KEY_ID` and `B2_APPLICATION_KEY` *(shown once)*.

Everything else in `.env.example` is commented out because it already has a
working default.

Walkthroughs: [creating a
bucket](https://www.backblaze.com/docs/cloud-storage-create-and-manage-buckets?utm_source=github&utm_medium=referral&utm_campaign=ai_artifacts&utm_content=b2ai-remotion-promo-video-pipeline),
[creating app
keys](https://www.backblaze.com/docs/cloud-storage-create-and-manage-app-keys?utm_source=github&utm_medium=referral&utm_campaign=ai_artifacts&utm_content=b2ai-remotion-promo-video-pipeline).

### 3. Run it

```bash
pnpm dev
```

Frontend at `localhost:3000`, API at `localhost:8000` (Swagger UI at
`localhost:8000/docs`). `pnpm dev` runs `pnpm run doctor` first, which catches the
common setup gotchas and tells you how to fix each one.

### 4. Render your first promo

1. **Optional but recommended:** `pnpm run setup:capture` installs Playwright's
   Chromium (~150 MB) so captures are real screenshots. Without it, captures fall
   back to Pillow-drawn placeholder cards and the pipeline still runs end to end.
2. Go to **Promos → New promo**. The safe defaults are shown as placeholders:
   product `demo-product`, capture URL `http://localhost:3000` (this app's own
   UI, so a first run needs nothing external), preset `release-teaser`, 120 BPM,
   1280x720, variants `master-16x9` + `vertical-9x16`.
3. Hit **Create promo** — the capture runs inline and
   `storyboards/<job-id>.json` is written at revision 1.
4. Hit **Render**. Frames stream to B2 as they render; progress is live. A `demo`
   pass takes a couple of minutes on a laptop.
5. Watch both variants on the detail page, then open **Edit storyboard**, change
   something, save (revision bumps) and render again — pass 2, and the
   amplification ratio climbs.

## B2 key layout

```
assets/<product>/captures/<viewport>/<name>@2x.png
assets/<product>/audio/bgm/<name>.wav
assets/<product>/audio/sfx/<category>/<name>.wav
assets/<product>/brand/<name>.(png|json)
storyboards/<job-id>.json                       # also the job record
frames/<job-id>/pass-<NN>/<variant>/frame-%06d.png
renders/<job-id>/<variant>.mp4
renders/<job-id>/<variant>.poster.jpg
manifests/<job-id>.json
```

B2 is the **only** store — there is no database. `storyboards/<job-id>.json` *is*
the job record; listing that prefix enumerates jobs. Deleting a promo walks
exactly four prefixes (`types/keys.job_prefixes()`); no bucket-wide delete path
exists anywhere in the codebase.

**S3-compatible API only** — `head_bucket`, `put_object`, paginated
`list_objects_v2`, `head_object`, `get_object`, `delete_object` and
`generate_presigned_url`. No b2-native API, no `b2sdk`, no `b2` CLI. Multipart
upload is deliberately unused: variant MP4s at demo scale are tens of MB and a
single `put_object` is the honest, readable path.

## Commands

| Command | What it does |
|---------|-------------|
| `pnpm run setup` | Idempotently copy `.env.example` to `.env` if missing, install deps, create the backend venv, install API requirements |
| `pnpm run setup:capture` | Opt-in Playwright Chromium install (~150 MB) for real captures |
| `pnpm run doctor` | Preflight environment check (also runs before `pnpm dev`) |
| `pnpm dev` | Start frontend + backend |
| `pnpm dev:web` / `pnpm dev:api` | One half only |
| `pnpm run make-demo-assets` | Synthesize + upload the WAV audio bed and SFX (needs the API running) |
| `pnpm run studio` | Remotion Studio for the composition |
| `pnpm check:agent-docs` | Validate agent shims, command docs, CI claims, env-ignore coverage |
| `pnpm verify` | Canonical non-live pre-PR suite — chains `check:agent-docs`, `verify:api`, `verify:web` |
| `pnpm verify:api` | Backend half: ruff, pytest, structure tests |
| `pnpm verify:web` | Frontend half: eslint, vitest, `packages/remotion` typecheck, typecheck + build |
| `pnpm verify:full` | `pnpm run doctor`, then `pnpm verify`, then Playwright E2E |
| `pnpm build` / `pnpm lint` | Build / lint the frontend |
| `pnpm test:web` / `pnpm test:api` | Unit tests |
| `pnpm check:structure` | Layering + file-size boundaries |
| `pnpm test:e2e` | Playwright route smoke tests |

Run `pnpm run setup` once before local development and again after pulling
dependency changes. Run `pnpm verify` before opening a PR — it needs
`services/api/.venv` from setup. **No test in `pnpm verify` renders anything or
talks to B2.** `pnpm verify:full` additionally needs a populated `.env`, local
server binding, Chromium installed and port 3000 free.

## Tech Stack

- TypeScript, Next.js 16, React 19, Tailwind v4, shadcn/ui, Recharts, TanStack Query
- Remotion 4 (`remotion`, `@remotion/bundler`, `@remotion/renderer`)
- Python 3.11+, FastAPI, boto3, Pydantic v2, Pillow, Playwright, imageio-ffmpeg
- Backblaze B2 (S3-compatible object storage) — the only external service
- pnpm workspaces (monorepo)

## Documentation Map

| Doc | Purpose |
|-----|---------|
| [AGENTS.md](AGENTS.md) | Agent table of contents — start here |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System layout, layering, the Python↔Node boundary, data flows |
| [docs/features/](docs/features/) | Storyboard authoring, ingest, rendering, encode, manifest, library, browser |
| [docs/LICENSING.md](docs/LICENSING.md) | Remotion's licence, attribution, why no audio is vendored |
| [docs/app-workflows.md](docs/app-workflows.md) | User journeys |
| [docs/dev-workflows.md](docs/dev-workflows.md) | Engineering workflows and testing |
| [docs/design-system.md](docs/design-system.md) | Design tokens, primitives, error/empty states |
| [docs/SECURITY.md](docs/SECURITY.md) | Security principles |
| [docs/RELIABILITY.md](docs/RELIABILITY.md) | Reliability expectations, resume semantics |
| [docs/exec-plans/](docs/exec-plans/) | Execution plans and tech debt tracker |

## Attribution

Shot-card ids, categories and recipe intent are derived from
[video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft) (Apache-2.0).
This sample implements 10 of its 104 cards — one per category — and links upstream
for the rest.

## License

See [LICENSE](LICENSE) for this repository's own code, and
[docs/LICENSING.md](docs/LICENSING.md) for the full three-layer picture (our code,
Remotion, upstream recipes).

## Claude Agent B2 Skill

Manage Backblaze B2 from your terminal using natural language (list/search,
audits, stale or large file detection, security checks, safe cleanup).

Repo: [https://github.com/backblaze-b2-samples/claude-skill-b2-cloud-storage](https://github.com/backblaze-b2-samples/claude-skill-b2-cloud-storage)
