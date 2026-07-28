<!-- last_verified: 2026-07-28 -->
# Tech Debt Tracker

Known tech debt items. Agents update this when they discover or create tech debt.
Entries below are this app's own — the starter kit's history is not carried over.

## Open

| Description | Impact | Proposed Resolution | Priority |
|---|---|---|---|
| Render passes run in an in-process single worker (`service/jobs.py`) | In-flight progress is lost on restart; multiple API replicas would each run their own worker | Move to a real queue (Celery/RQ/Cloud Tasks) keeping the same resume semantics: pass number from the manifest, missing-frame scan against B2. Documented in `docs/RELIABILITY.md` | Medium |
| A resumed pass re-renders already-present frames inside the missing range | The range spans `min(missing)..max(missing)`, so a non-contiguous gap re-renders frames that already exist. Correct, mildly wasteful, and rare (a kill produces a contiguous tail) | Split the missing set into contiguous runs and invoke `renderFrames` once per run | Low |
| `list_promos` issues one `get_object` per storyboard | O(n) round trips for the promo list; fine at demo scale, slow at hundreds of promos | Fetch storyboards concurrently, or keep a small index object under `storyboards/_index.json` invalidated on write | Low |
| Orphaned frames from an abandoned pass are never garbage-collected on their own | Frames from a killed attempt stay under their pass prefix (that is what makes resume work) and only disappear when the promo is deleted | Add an explicit "purge pass N" action, or a lifecycle rule on `frames/` | Low |
| Storyboard writes are last-write-wins | Two concurrent edits to one storyboard silently drop one revision; there is no ETag / conditional-put guard | Use `If-Match` on the storyboard `put_object`, or a revision check before writing | Low |
| No render smoke test in CI | Nothing in `pnpm verify` renders a frame, so a Remotion/ffmpeg regression is only caught by a manual pass | Add an opt-in job that renders a 3-frame range with `FRAME_UPLOAD_ENABLED=false` and asserts the NDJSON contract | Medium |
| `packages/remotion` is not typechecked by any gate | `pnpm build` only typechecks `apps/web`; a TSX error in a shot card surfaces at render time | Add `tsc --noEmit` for `packages/remotion` to `verify:web` (needs its own tsconfig include of the shared JSON) | Medium |
| Frontend has no component/render tests; e2e only checks routes | UI states (in-flight progress, empty, error) and the create→render→review journey are unverified | Add jsdom + @testing-library/react render tests; a fixture-driven e2e that stubs the API | Medium |
| Audio/Video metadata fields declared but never extracted | `duration_seconds`/`codec`/`bitrate` on `FileMetadataDetail` are always null | Extract with ffprobe (ffmpeg is already resolved), or drop the fields | Low |
| Upload buffers the whole file in memory | ~3x file size RAM per upload of a brand asset or replacement audio bed | Stream to a temp file, or S3 multipart above a size threshold | Medium |
| `GET /files-by-key/detail` re-downloads the object to recompute metadata | A full download + in-memory hash per detail view | Persist `FileMetadataDetail` at upload (S3 user metadata or a sidecar) | Medium |
| `get_upload_activity` re-materializes `FileMetadata` per object just to bucket dates | Wasted O(n) CPU per `/files/stats/activity` | Aggregate from raw listing dicts like `get_upload_stats` does | Low |
| No auth layer or placeholder | Every route is unauthenticated and bucket-wide (single-tenant demo stance) | Add example middleware (API key or JWT) + docs for the seam, and scope listings per caller — see `docs/SECURITY.md` | Low |
| No `docker-compose.yaml` | Manual venv + dual-process startup slows first run, and a container would pin Chrome/ffmpeg versions | Add compose with `web` + `api` services and Dockerfiles that pre-install Chrome | Low |
| `api-client.ts` hand-synced to FastAPI | Endpoint drift between client and server | Generate from the OpenAPI schema, or add a contract test | Low |
| `e2e/**` and `playwright.config.ts` are excluded from `apps/web/tsconfig.json` | Neither `pnpm typecheck` nor `next build` typechecks the E2E specs | Add a `tsconfig.e2e.json` and typecheck it in `verify:web` | Low |

## Resolved

| Description | Resolution |
|---|---|
| Starter kit deviated from the B2 env-var standard (`B2_KEY_ID`, required `B2_ENDPOINT`, no `B2_REGION`) | Renamed to `B2_APPLICATION_KEY_ID` / `B2_REGION` / `B2_PUBLIC_URL_BASE`; the S3 endpoint is derived from the region so no literal is baked into source, and `B2_ENDPOINT` became an optional override |
| Remotion's own frame file naming leaked into the B2 key layout | `render-frames.mjs` renders into `.raw/` and renames to a canonical `frame-%06d.png` before the Python side uploads |
| Frame uploads would have invalidated the bucket-listing cache once per frame | `repo/b2_frames.put_frames` invalidates once per batch and uploads with a bounded thread pool |
| `b2_client.py` exceeded the 300-line ceiling after the env rename | Split into `b2_media.py` (presigning + raw writes) and `b2_stats.py` (bucket aggregates), matching the existing `b2_object.py` precedent |
| Server data was synced into React state via `useEffect` | Load-then-render split: forms mount only once defaults/storyboard have resolved, so initial values are real `useState`/`useForm` defaults (also what `react-hooks/set-state-in-effect` requires) |
| A shot's first frame could render blank (typewriter at 0 characters) | The typewriter card starts at one character and keeps the sub line visible from frame 0 — a blank frame reads as a dropped frame and can be picked as the poster |
| PDF metadata extraction and `PyPDF2` were dead weight | Dropped the dependency, the extraction branch and the `pdf_*` fields; nothing in this pipeline produces or consumes PDFs |
