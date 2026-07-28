<!-- last_verified: 2026-07-28 -->
# Security

Security principles and implementation for the Remotion Promo Video Pipeline.

## Trust Boundaries

- **Frontend -> API**: CORS-restricted to configured origins, scoped to `GET/POST/DELETE/OPTIONS`. `allow_credentials` is `False` (no cookie/session auth today); enable it only alongside real auth and a tightened origin allowlist.
- **Frontend -> API**: also allows `PATCH` (the storyboard editor bumps a revision through it).
- **API -> B2**: Authenticated via `B2_APPLICATION_KEY_ID` + `B2_APPLICATION_KEY`, signature v4. The endpoint is derived from `B2_REGION` (`settings.s3_endpoint`), so no region literal is baked into source and no `B2_ENDPOINT` is required.
- **Client -> B2**: **Presigned URLs are the only read path for renders, posters, captures and audio.** No object is ever proxied through the API and no bucket needs to be public. Downloads force `Content-Disposition: attachment` (10-min expiry); media this app produced itself is presigned `inline` with a 1-hour expiry so `<video>`, `<audio>` and `<img>` can paint it. Treat a presigned URL as a short-lived credential: never log one or commit one into a fixture.
- **Headless Chrome -> B2**: the renderer has no B2 credentials. `service/render_payload.py` swaps each shot's capture *key* for a presigned inline URL in the render input props — the same private-bucket path the browser uses.

## Authentication & Multi-Tenancy

- **No auth by design.** The file API (`/files`, `/files-by-key`, `/upload`) is unauthenticated and bucket-wide — any client can list, download, and delete every object. Acceptable for a single-tenant demo; the rate limiter guards the open endpoints.
- **Adding auth to a clone does not close this automatically.** A login screen alone leaves an open, cross-user file API. You must both (1) require auth on every file route and (2) scope listings and reads to the caller's own prefixes — skipping either lets one signed-in user read and delete another's files. See the co-located notes in `runtime/files.py` and `service/files.py`.

## Prefix-Scoped Deletes

- `types/keys.job_prefixes(job_id)` is the single definition of what a promo owns:
  `storyboards/<id>.json`, `frames/<id>/`, `renders/<id>/`, `manifests/<id>.json`.
  `DELETE /promos/{id}` walks exactly those four and nothing else.
- **There is no bucket-wide delete path anywhere in this codebase.** `repo/b2_frames.delete_prefix()` refuses an empty, `/` or `*` prefix, and every caller passes a `job_prefixes()` entry. Shared material under `assets/` is never touched by a promo delete.
- Prefixes always carry a trailing slash, so deleting promo `abc` cannot sweep promo `abc123`. Regression-guarded by `tests/test_keys.py` and `tests/test_promo_routes.py`.
- `ALLOWED_KEY_PREFIX` remains available to confine key-addressed reads/deletes when the bucket is shared with other workloads.

## Local Subprocesses

- Two external processes are spawned: `node packages/remotion/render-frames.mjs` and ffmpeg. Both are invoked with an **argv list, never a shell string**, so a storyboard value can never become a shell injection.
- ffmpeg and node paths are resolved from `FFMPEG_BINARY` / `NODE_BINARY`, then a bundled wheel, then `PATH` — never from request data.
- Storyboard-driven values (card ids, SFX ids, accents, variants) are validated against the shared JSON allow-lists before they reach a subprocess or a key builder; product slugs go through `types/keys.slugify()`, which strips `/` and `..`.

## Upload Validation

- Filename sanitization: path traversal, null bytes, unsafe chars stripped
- MIME/extension consistency check against allowlist
- Chunked streaming with size enforcement (100MB default)
- Content-type allowlist (images, PDFs, text, archives, audio/video). **SVG is excluded** — it can embed `<script>` that executes when served from a public bucket URL (stored XSS). Re-add only with server-side sanitization.
- **Magic-byte signature check**: for binary types, the leading bytes must match the declared content type, so a script payload can't masquerade as `image/png`. Text-like types (plain/CSV/JSON) have no signature and skip this check.
- Empty file rejection

## Rate Limiting

- Per-IP fixed-window limiter (`app/runtime/ratelimit.py`), configurable via `RATE_LIMIT_PER_MINUTE` (reads) and `RATE_LIMIT_WRITE_PER_MINUTE` (uploads/deletes/downloads). Guards against DoS and Backblaze transaction/egress cost amplification on the unauthenticated endpoints.
- In-process, per replica. Horizontal scaling needs a shared store (e.g. Redis) — see [RELIABILITY.md](RELIABILITY.md).

## File Key Validation

- Empty keys rejected
- Path traversal patterns rejected (`../`, `%2e%2e`, backslashes, null bytes)
- Optional prefix confinement: set `ALLOWED_KEY_PREFIX` (e.g. `uploads/`) to restrict key-addressed reads/deletes when the bucket is shared with other workloads. Empty by default — the by-key routes otherwise accept arbitrary folder and reserved-word keys by design.

## Download Safety

- Presigned URLs for *user-uploaded* content force `Content-Disposition: attachment`, which prevents inline rendering of an upload in the app's origin (XSS mitigation)
- The `inline` disposition is used **only** for media this pipeline generated itself: variant MP4s, posters, rendered frames, captures and the synthesized audio bed. SVG stays off the upload allow-list either way

## Response Hardening

- Baseline headers on every API response: `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`
- Interactive API docs (`/docs`, `/redoc`, `/openapi.json`) are on by default but can be disabled with `ENABLE_DOCS=false` to hide the API surface in production

## CI Permissions

- `.github/workflows/ci.yml` sets `permissions: contents: read` at the workflow level, so `GITHUB_TOKEN` is read-only in every job. Without an explicit block the token inherits the repository default, which can be read/write — a compromised dependency or action could then push commits or edit issues.
- Widen per job, never at the top level: a job that must write (annotations, PR comments, releases) gets its own `permissions` block scoped to just that need.

## Secrets Management

- All secrets loaded via environment variables (pydantic-settings)
- Never committed to source control
- `.env.example` documents required variables without values

## Agent Security Rules

- Never commit `.env`, credentials, or API keys
- Never print them either — the canonical rule lives in
  [AGENTS.md §12 — Secret Handling](../AGENTS.md#12-secret-handling) (agents
  read AGENTS.md first); don't restate it here, it only drifts. The link is
  anchored and `pnpm check:agent-docs` verifies that it still resolves, so
  renumbering that section fails the build instead of silently dropping the
  reader at the top of the file
- Never weaken validation without explicit instruction
- Never bypass CORS, auth, or input sanitization
- Always validate at system boundaries
