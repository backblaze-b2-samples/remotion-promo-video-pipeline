<!-- last_verified: 2026-07-28 -->
# Reliability

Reliability expectations and practices for this project.

## Health Checks

- `GET /health` verifies B2 connectivity and returns `healthy` or `degraded`
- Health endpoint is always available, even when B2 is down

## Error Handling

- HTTP handlers return structured error responses with appropriate status codes
- External service failures (B2) are caught and surfaced as 500/503 responses
- No unhandled exceptions leak stack traces to clients
- Uncaught exceptions are converted to a typed JSON 500 (`{"detail": "Internal server error"}`, modeled by `app.types.ErrorResponse`) by the catch-all in `timing_middleware`
- **Error responses carry CORS headers.** `CORSMiddleware` is registered LAST in `main.py` so it is the outermost middleware and wraps every response — including uncaught-exception 500s produced by the inner catch-all. This is intentional and load-bearing: if a 500 shipped without `Access-Control-Allow-Origin`, the browser would block it and the frontend would surface only an opaque "network error", hiding the real server bug. Regression-guarded by `tests/test_error_handling.py::test_unhandled_exception_500_carries_cors_headers`.

## Logging

- Structured JSON logging via Python stdlib
- Every request gets a `request_id` for tracing
- Log levels: ERROR for failures, WARNING for degraded state, INFO for requests

## Observability

- Request timing middleware logs duration for every request
- `/metrics` endpoint exposes basic Prometheus-format counters
- Upload success/failure counts tracked

## Render Passes — single worker, resume from B2

A render pass saturates the machine (headless Chrome rasterizing N frames per
variant, then an x264 encode), so passes run **one at a time** in an in-process
`ThreadPoolExecutor(max_workers=1)` (`app/service/jobs.py`), with progress in a
lock-guarded in-memory registry. This is the same stance the starter takes for its
in-process rate limiter, and it is correct for a sample and wrong for production.

Consequences to plan for:

- **In-flight progress is lost on restart.** `GET /promos/{id}/progress` falls back
  to the stored manifest, so a reloaded page reports the truth (idle / last pass)
  rather than a stale "rendering".
- **The pass itself is recoverable.** A pass is only appended to the manifest when
  it completes, so a killed pass keeps the same `pass-<NN>` number on the next
  attempt, which lands on the same `frames/<job>/pass-NN/<variant>/` prefix. The
  attempt lists that prefix, renders **only the missing tail** via Remotion's
  `frameRange`, and downloads the frames that already landed so the encode still
  sees a complete sequence. That is the reason B2 — and not `/tmp` — is the
  intermediate store.
- **Partial-pass artifacts are visible, not hidden.** Orphaned frames from an
  abandoned attempt stay under their pass prefix (they are what makes the resume
  work) and are removed with the promo by the prefix-scoped delete.
- **Multiple API replicas would each run their own worker.** Production wants a real
  queue (Celery / RQ / Cloud Tasks) that keeps the same resume semantics: pass
  number derived from the manifest, missing-frame scan against B2.
- **A second concurrent pass is refused, not queued per-promo.** `POST
  /promos/{id}/render` returns `409` while that promo has a render in flight.
- **Long-running pass ceilings.** The render subprocess is bounded at 1 hour and an
  ffmpeg encode at 30 minutes, so a wedged child can never hold the single worker
  forever.

## Frame Upload Volume

`FRAME_UPLOAD_ENABLED=true` is the point of this sample, not an accident, and the
frame path is built for the volume: `repo/b2_frames.put_frames()` runs
`FRAME_UPLOAD_CONCURRENCY` (default 8, hard-capped at 32) uploads at a time and
invalidates the bucket-listing cache **once** per batch rather than 1,086 times.
Setting `FRAME_UPLOAD_ENABLED=false` keeps the pipeline working — frame accounting
then falls back to local file sizes — but removes the resume capability, because
there is nothing in B2 to resume from.

## Stateful Counters — durability caveats

The download counter and the `/metrics` counters are **in-process, per replica**. Consequences to plan for before scaling:

- **Download counter** (`app/repo/counter.py`) persists to a JSON file at `DOWNLOAD_COUNT_FILE` (default `data/download_count.json`). On an ephemeral filesystem (Railway without a mounted volume) it **resets to 0 on every redeploy**. With multiple replicas each keeps its own file/count. For durable, shared counts: mount a persistent volume, or swap the adapter for Redis/DB.
- **`/metrics` counters** live in process memory and reset on restart. Behind a load balancer, each replica reports only its own slice — scrape with an instance label and aggregate, or push to a shared collector.

## Rate Limiting

- Per-IP fixed-window limiter (`app/runtime/ratelimit.py`); `RATE_LIMIT_PER_MINUTE` / `RATE_LIMIT_WRITE_PER_MINUTE` are the budgets. Rejected requests get `429` with a `Retry-After` header.
- Counters are in-process per replica; horizontal scaling needs a shared store (e.g. Redis) for a global limit.

## Graceful Degradation

- File listing returns an empty list (not an error) when B2 has no objects
- Metadata extraction failures don't block upload (return partial metadata)
- **A missing capture browser never fails a render.** With no Playwright Chromium
  installed, capture ingest falls back to a Pillow-drawn placeholder card and says
  so in the response (`engine: "placeholder"`), so a cold clone is demoable end to
  end without a 150 MB download.
- **An expired capture URL degrades to a drawn mock.** `CaptureImage` in the
  Remotion cards handles `onError` by rendering the mock UI, so one stale presigned
  URL cannot fail a 1,086-frame pass.
- **A malformed JSON document is treated as missing**, so a half-written manifest
  cannot make the whole promo list unreadable.
- **A missing binary returns 503, not 500**, with a message naming every place the
  app looked and how to install it — ffmpeg (`FFMPEG_BINARY` → bundled
  `imageio-ffmpeg` → `PATH`) and node (`NODE_BINARY` → `PATH`).
- Frontend shows skeleton states while loading, error states on failure, and a
  phase-labelled progress panel while a pass is in flight

## Deployment

- The API host needs Chrome (Remotion downloads Chrome Headless Shell on first
  render), ffmpeg (bundled with `imageio-ffmpeg`) and scratch disk for one pass of
  frames — roughly 2 GB for the `full` preset.
- Railway health checks on `/health`
- Zero-downtime deploys via rolling updates
- Environment-specific configuration via env vars (no config files in prod)
