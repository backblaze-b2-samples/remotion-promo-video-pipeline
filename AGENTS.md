<!-- last_verified: 2026-07-28 -->
# AGENTS.md

This is the authoritative control surface for all coding agents. Read this first.

## 1. What This App Is

A promo-video render pipeline that keeps **every byte of its production trail** in
Backblaze B2 over the S3-compatible API: product captures, brand assets, the
synthesized audio bed, **every rendered PNG frame**, every finished MP4 variant,
and a delivery manifest.

The reason this belongs on B2 is **write amplification**, and the app measures it
rather than asserting it. One 36.2s 1920x1080 pass is 1,086 PNG frames — several
GB of intermediates for a ~40 MB MP4 — and every storyboard revision is a fresh
pass, multiplied again by each platform cutdown. The manifest records
`frame_bytes` vs `variant_bytes` per pass, and the dashboard leads with that ratio.

Everything heavy runs locally: Remotion renders in a local headless Chrome,
ffmpeg encodes locally, captures use a local Playwright Chromium. **There is no
inference API and no second API key — B2 credentials only.**

## 2. Repository Map

```
apps/web/            Next.js 16 frontend (App Router, Tailwind v4, shadcn/ui)
services/api/        FastAPI backend (layered: types/config/repo/service/runtime)
packages/shared/     Shared TS types + the shot-card / preset / variant JSON
packages/remotion/   Remotion composition, 10 shot cards, render-frames.mjs CLI
docs/                System of record (features, workflows, security, reliability)
docs/exec-plans/     Execution plans and tech debt tracker
infra/railway/       Deployment config
```

## 3. Non-Negotiables

**Keep as-is (do not strip, rename, or replace)**
- **UI kit / design system.** `apps/web/src/components/ui/` (shadcn primitives),
  the tokens in `apps/web/src/app/globals.css`, and the `/design` page. Build new
  screens from these primitives; never edit generated `components/ui/` files.
  Restyling happens through tokens in `globals.css`.
- **Full-bucket File Explorer.** `/files`, `apps/web/src/app/files/` and
  `apps/web/src/components/files/`, wired to the **whole bucket, unscoped**. It
  deliberately overlaps `/library` (scoped to `assets/<product>/`): whole-bucket
  forensics vs. one product's material. The Files sidebar entry stays.
- **S3-compatible API only.** No `b2sdk`, no `b2` CLI, no `api.backblazeb2.com`.
  Nothing in this pipeline needs a b2-native capability.
- **`user_agent_extra="b2ai-remotion-promo-video-pipeline"`** on the S3 client.
- **No region literal in source.** The endpoint is derived from `B2_REGION` via
  `settings.s3_endpoint`.
- **Prefix-scoped deletes only.** `types/keys.job_prefixes()` is the single
  definition of what a promo owns. No bucket-wide delete path exists — never add one.

## 4. Architectural Invariants

**Backend layering**: `types` -> `config` -> `repo` -> `service` -> `runtime`

- No backward imports across layers
- No `boto3` outside `repo/`
- No business logic in route handlers (`runtime/`)
- All external processes (ffmpeg, node) wrapped in a `service/` adapter
- All request/response data validated at the boundary (Pydantic models)
- No shared mutable state across layers

**The Python -> Node boundary** is exactly one subprocess:
`packages/remotion/render-frames.mjs`. Its stdout is **NDJSON and nothing else**
(`{"type":"progress",...}` then `{"type":"done",...}`); all human logging goes to
stderr. `service/render_engine.py` parses it line by line. Breaking that contract
breaks live render progress — see [ARCHITECTURE.md](ARCHITECTURE.md).

**One source of truth per fact.** Shot-card metadata, storyboard presets and
variant geometry live in `packages/shared/src/*.json`, read by *both*
`packages/remotion` and the API. Adding a card = one JSON entry + one TSX
component; there is no second registry.

**Frontend**: shadcn/ui components in `src/components/ui/` are generated — never
modify them. Every API call flows through TanStack Query hooks in
`apps/web/src/lib/queries.ts`; no bare `useEffect + fetch`. A new endpoint touches
three files: `runtime/<router>.py`, `lib/api-client.ts`, `lib/queries.ts`.

**Form UX**: finite-option fields use a `Select` / checkbox group / `RadioGroup`,
never free text. Create forms show safe defaults as placeholder + `FormDescription`
only — **never an autofill button**. Edit forms open pre-filled and carry no hints.

## 5. Quality Expectations

- **DRY** — do not duplicate logic, types, or constants. Extract when used 2+ times.
- Structured JSON logging only — no `print()` statements
- No raw SDK calls outside `repo/`
- Files stay under 300 lines
- Tests added or updated for every behavior change
- Docs updated in the same PR as code changes
- Lint clean before merge
- Prefer boring, composable libraries over clever abstractions
- No implicit type assumptions — use typed models
- **Never require a GPU.** Rendering is CPU rasterization plus an x264 encode.
  `RENDER_CONCURRENCY=auto` resolves to `max(1, min(cpu_count // 2, 8))` and can
  never resolve to 0; `REMOTION_GL` is opt-in and unset by default.

## 6. Mechanical Enforcement

| Rule | Enforced by |
|------|-------------|
| No backward imports | `tests/test_structure.py::test_no_backward_imports` |
| No boto3 outside repo/ | `tests/test_structure.py::test_boto3_only_in_repo` |
| File size < 300 lines | `tests/test_structure.py::test_file_size_limits` |
| All layers exist | `tests/test_structure.py::test_all_layers_exist` |
| Presets only name implemented cards | `tests/test_shot_library.py` |
| Beat snapping preserves total duration | `tests/test_beatgrid.py` |
| Promo delete is prefix-scoped | `tests/test_keys.py`, `tests/test_promo_routes.py` |
| Amplification maths + manifest round-trip | `tests/test_amplification.py` |
| ffmpeg/node resolution errors are actionable | `tests/test_binary_resolution.py` |
| Card registry matches the shared JSON | throws at load in `packages/remotion/src/cards/index.ts` |
| No bare print() | `ruff` rule T20 |
| Import ordering | `ruff` rule I001 |
| Frontend strict equality / no unused vars | `eslint` |
| This file stays agent-sized (>= 1 KB, <= 20 KB, <= 250 lines) | `pnpm check:agent-docs` |
| Agent shims stay thin pointers to AGENTS.md (non-empty, <= 1 KB, <= 20 lines) | `pnpm check:agent-docs` |
| Secret-handling rule stays in the "Secret Handling" section, phrased as a prohibition, and `docs/SECURITY.md` links to that heading by anchor | `pnpm check:agent-docs` |
| Every setup/verify command is named in AGENTS.md, README, and dev-workflows; `setup`, `doctor`, `check:agent-docs` still point at their scripts; `package.json` still composes the expected gates | `pnpm check:agent-docs` |
| CI runs the three verify gates it claims to | `pnpm check:agent-docs` |
| `.env.example` exists (`pnpm run setup` copies it to `.env`) | `pnpm check:agent-docs` |
| Env files ignored; example/template env files trackable | `pnpm check:agent-docs` |

`pnpm check:agent-docs` is CI-blocking (job `verify-agent-docs`) and the first
gate inside `pnpm verify`. It asserts the *set* of verify gates, not a literal
command chain — that literal lives only in `package.json`.

## 7. Commands

```bash
# Run
pnpm run setup          # idempotent cold-start setup (env copy, deps, venv)
pnpm run setup:capture  # opt-in Playwright Chromium (~150 MB) for real captures
pnpm run doctor         # preflight environment check (also runs before pnpm dev)
pnpm dev                # start both frontend and backend
pnpm dev:web            # frontend only
pnpm dev:api            # backend only
pnpm run make-demo-assets  # synthesize + upload the WAV audio bed and SFX
pnpm run studio         # Remotion Studio for the composition

# Test & Lint
pnpm check:agent-docs   # agent instruction/documentation drift check
pnpm verify             # canonical non-live pre-PR suite
pnpm verify:api         # backend half of verify (lint, tests, structure)
pnpm verify:web         # frontend half of verify (lint, unit tests, typecheck + build)
pnpm verify:full        # doctor + verify + Playwright E2E (needs a browser + a live local app)
pnpm lint               # frontend lint (eslint)
pnpm build              # frontend type check + build
pnpm test:web           # frontend unit tests (vitest)
pnpm lint:api           # backend lint (ruff)
pnpm test:api           # backend tests (pytest)
pnpm check:structure    # structural boundary tests
pnpm test:e2e           # Playwright e2e route tests
```

`setup` and `doctor` use the `pnpm run` form on purpose: both are built-in pnpm
commands before pnpm 11, and `pnpm setup` / `pnpm doctor` would run pnpm's own
commands instead of these scripts. Never shorten them in docs or scripts.

`pnpm verify` chains `pnpm check:agent-docs`, then `pnpm verify:api` (backend
lint, tests, structural boundaries), then `pnpm verify:web` (frontend lint, unit
tests, typecheck + build). CI (`.github/workflows/ci.yml`) runs those three as
parallel jobs. `pnpm verify` needs `services/api/.venv` (run `pnpm run setup`).
See [docs/dev-workflows.md](docs/dev-workflows.md#commands) for the `verify:full`
prerequisites.

**No test in `pnpm verify` renders anything or talks to B2.** The suite mocks the
repo layer; a real render needs credentials, Chrome and ffmpeg.

## 8. Agent Workflow

1. Read this file first.
2. Review [ARCHITECTURE.md](ARCHITECTURE.md) before structural changes.
3. For non-trivial changes, create a plan in `docs/exec-plans/active/`.
4. Implement the smallest coherent change.
5. Run: `pnpm verify`
6. Update docs in the same PR (see §10).
7. Move completed plans to `docs/exec-plans/completed/`.
8. Only change files relevant to the task. No drive-by improvements.

## 9. Cost & Volume Awareness

A render pass writes N frames **per variant**. Before changing a default, do the
multiplication: `RENDER_PRESET=demo` is 180 frames x 2 variants; `full` is 1,086 x
4 = 4,344 PNG objects in one pass. `FRAME_UPLOAD_ENABLED=true` is the point of
this sample, not an accident — but do not raise the default preset, add variants
to the default set, or loop renders inside a test.

## 10. Doc Update Mapping

| Change Type | Update Location |
|-------------|-----------------|
| Feature logic, inputs, outputs, tests | `docs/features/<feature>.md` |
| User journeys | `docs/app-workflows.md` |
| System layout, deployments, the Node boundary | `ARCHITECTURE.md` |
| Dev or testing process | `docs/dev-workflows.md` |
| Setup or scope changes | `README.md` |
| Security changes | `docs/SECURITY.md` |
| Licence-affecting dependency changes | `docs/LICENSING.md` |
| Agent instruction surface | `AGENTS.md` + the shims (`CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`) |
| Reliability changes | `docs/RELIABILITY.md` |
| Active work plans | `docs/exec-plans/active/` |
| Known tech debt | `docs/exec-plans/tech-debt-tracker.md` |

If documentation and implementation conflict, update docs in the same PR.
Documentation rot destroys agent reliability.

## 11. Doc Map

| Topic | Location |
|-------|----------|
| System layout, data flows, boundaries | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Feature docs | [docs/features/](docs/features/) |
| User journeys | [docs/app-workflows.md](docs/app-workflows.md) |
| Engineering workflows and testing | [docs/dev-workflows.md](docs/dev-workflows.md) |
| Licensing (Remotion is **not** OSS) | [docs/LICENSING.md](docs/LICENSING.md) |
| Security principles | [docs/SECURITY.md](docs/SECURITY.md) |
| Reliability expectations | [docs/RELIABILITY.md](docs/RELIABILITY.md) |
| Execution plans | [docs/exec-plans/](docs/exec-plans/) |
| Tech debt | [docs/exec-plans/tech-debt-tracker.md](docs/exec-plans/tech-debt-tracker.md) |

## 12. Secret Handling

- Never print `.env`, credentials, or API keys in chat, logs, reports, commits, or screenshots.
- Never commit an env file, and never paste one into a PR description or an issue.
- Presigned URLs are short-lived credentials: do not log them or bake them into
  committed fixtures.

## 13. When Unsure

- Prefer boring, stable libraries
- Prefer small PRs over large changes
- Add tests with every change
- Never bypass lint rules without explicit instruction
- Ask before making destructive or irreversible changes
