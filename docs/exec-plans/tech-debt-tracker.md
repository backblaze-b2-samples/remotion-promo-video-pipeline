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
| A bed uploaded as MP3 cannot be length-checked | `service/audio.py` probes duration with the standard library's `wave`, so only WAV is measurable; a short MP3 is accepted and padded with silence by `ffmpeg -af apad` rather than rejected | Probe with the already-resolved ffmpeg binary (parse `Duration:` from `ffmpeg -i`), or add a lightweight MP3 frame-header reader | Low |
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
| `packages/remotion` was typechecked by no gate — a TSX error in a shot card surfaced only at render time | `packages/remotion` gained a `typecheck` script (`tsc -p tsconfig.json`, the tsconfig already existed) wired into `verify:web` as `pnpm typecheck:remotion`. It found nine real errors in `Root.tsx`: `PromoProps` was an `interface`, which has no implicit index signature, so Remotion's `Composition` generic widened to `Record<string, unknown>` and `calculateMetadata` lost every field type. Fixed by making `PromoProps` a `type` alias |
| A bed was reused whenever one existed for the product+BPM, ignoring its length | `ensure_audio_bed` lists `assets/<product>/audio/bgm/` and picks a bed that covers the pass, re-synthesizing when none does; `encode.py` adds `-af apad` so a short bed pads with silence instead of truncating the MP4 via `-shortest`. Regression suite: `services/api/tests/test_audio_bed.py` |
| An uploaded audio bed was silently ignored | Same prefix scan: an upload keeps its own filename under `audio/bgm/` and is now preferred over the synthesized `pulse-<bpm>bpm.wav`, which is what `docs/LICENSING.md` and the Ingest hint always claimed |
| Starter kit deviated from the B2 env-var standard (`B2_KEY_ID`, required `B2_ENDPOINT`, no `B2_REGION`) | Renamed to `B2_APPLICATION_KEY_ID` / `B2_REGION` / `B2_PUBLIC_URL_BASE`; the S3 endpoint is derived from the region so no literal is baked into source, and `B2_ENDPOINT` became an optional override |
| Remotion's own frame file naming leaked into the B2 key layout | `render-frames.mjs` renders into `.raw/` and renames to a canonical `frame-%06d.png` before the Python side uploads |
| Frame uploads would have invalidated the bucket-listing cache once per frame | `repo/b2_frames.put_frames` invalidates once per batch and uploads with a bounded thread pool |
| `b2_client.py` exceeded the 300-line ceiling after the env rename | Split into `b2_media.py` (presigning + raw writes) and `b2_stats.py` (bucket aggregates), matching the existing `b2_object.py` precedent |
| Server data was synced into React state via `useEffect` | Load-then-render split: forms mount only once defaults/storyboard have resolved, so initial values are real `useState`/`useForm` defaults (also what `react-hooks/set-state-in-effect` requires) |
| A shot's first frame could render blank (typewriter at 0 characters) | The typewriter card starts at one character and keeps the sub line visible from frame 0 — a blank frame reads as a dropped frame and can be picked as the poster |
| PDF metadata extraction and `PyPDF2` were dead weight | Dropped the dependency, the extraction branch and the `pdf_*` fields; nothing in this pipeline produces or consumes PDFs |

## 2026-07-28 — verify

Nitpicks surfaced by the `/sample-3-verify` UX funnel. Each was screenshot-gated by an
adversarial reviewer; the two marked *(demoted)* were raised as friction and demoted to
nitpick because the gate judged them over-claimed. None blocks the first-time-user goal.

- Promo detail, delivery variants grid — the 16:9 master card is height-matched to the taller 9:16 card, leaving a large empty region inside it → wasted vertical space pushes the delivery manifest far below the fold (`.local/verify/A3/10-variant-grid-deadspace.png`)
- Promo detail, after a completed pass *(demoted)* — nothing on the settled page mentions audio/bed/mux/BPM; the `Muxing frames + audio with ffmpeg` label is transient → no durable indicator that the beat-synced bed landed, though the finished MP4s' durations and byte sizes do evidence it (`.local/verify/D/13-detail-full-terminal.png`)
- `/promos/new` vs `/library` — the same malformed `?product=../../etc` falls back to `demo-product` on the create form but to the alphabetically-first product on the Library picker → two different (both safe) fallbacks for one bad link (`.local/verify/D/23-newpromo-after-malformed.png`, `.local/verify/D/24-library-after-malformed.png`)
- `/library` *(demoted)* — an uploaded brand PNG renders as a filename + object-key row with no preview, while the Captures kind gets a thumbnail grid → inconsistent recognition affordance across asset kinds (`.local/verify/D/18-library-acme-all-kinds.png`)
- `/promos` — a poster `<img>` has no placeholder while its presigned B2 GET is in flight, so a row shows the browser's broken-image glyph and `Poster fra…` alt text for ~1s (proven transient: 0/12 posters painted at +3.1s, 12/12 by +4.34s) → a healthy row reads as a broken poster on first paint (`.local/verify/E/promos-posters-repainted.png`)
- `docs/features/encode-and-variants.md` + the matching comment in `service/encode.py` — both say `-shortest` "is kept only as the fallback when the frame count is unknown", but the bounded branch emits `-shortest` **and** `-t D` → doc and code comment share the same imprecision; reword to match what the branch actually does
- `packages/shared/src/variants.json` — the `note` field still says the file is "read by both packages/remotion (src/lib/variant.ts) and the API", but geometry now flows through `variant-geometry.ts` → transitively true, mildly stale
- `apps/web/src/lib/amplification.ts:38` — `renderPercent` is dead in app code since `render-progress-panel.tsx` moved to `passPercent`; only its own test and `docs/features/dashboard.md:16` still reference it → remove with its test + doc mention
