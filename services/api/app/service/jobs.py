"""In-process render-pass runner.

A render pass saturates the machine (headless Chrome rasterizing N frames, then
an x264 encode), so passes run **one at a time** in a single background worker
and progress lives in a lock-guarded in-memory registry.

This is a single-replica design and deliberately so — same stance the starter
takes for its in-process rate limiter. Two consequences, both documented in
`docs/RELIABILITY.md`:

* In-flight progress is lost on restart. The *pass* is not: the next render's
  resume scan re-reads what already landed in `frames/<job>/pass-NN/<variant>/`
  on B2 and renders only the missing tail.
* Multiple API replicas would each run their own worker. Production wants a real
  queue (Celery/RQ/Cloud Tasks) with the same resume semantics.
"""

import logging
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import UTC, datetime
from threading import Lock

from app.service import promos
from app.service.render_pass import run_pass
from app.types.promo import RenderProgress

logger = logging.getLogger(__name__)

# One worker: a second concurrent pass would halve the throughput of both and
# invite ffmpeg/Chrome OOM on a laptop.
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="render-pass")

_lock = Lock()
_progress: dict[str, dict] = {}
_running: dict[str, Future] = {}


class RenderBusyError(Exception):
    def __init__(self, job_id: str):
        self.detail = f"Promo '{job_id}' already has a render in flight"
        super().__init__(self.detail)


def _touch(job_id: str, **fields) -> None:
    with _lock:
        state = _progress.setdefault(job_id, {"job_id": job_id})
        state.update(fields)
        state["updated_at"] = datetime.now(UTC)


def _reporter(job_id: str):
    def report(**fields) -> None:
        _touch(job_id, **fields)

    return report


def _reset_state() -> None:
    """Clear the registry. Used by tests to stay hermetic."""
    with _lock:
        _progress.clear()
        _running.clear()


def start_render(job_id: str) -> RenderProgress:
    """Queue a pass for `job_id`. Raises PromoNotFoundError / RenderBusyError."""
    storyboard = promos.get_storyboard(job_id)  # 404s before queueing anything
    manifest = promos.get_manifest(job_id)
    pass_number = (len(manifest.passes) if manifest else 0) + 1

    with _lock:
        future = _running.get(job_id)
        if future is not None and not future.done():
            raise RenderBusyError(job_id)

    _touch(
        job_id,
        status="rendering",
        phase="queued",
        pass_number=pass_number,
        variant=None,
        variant_index=0,
        variant_total=len(storyboard.variants),
        rendered=0,
        total=storyboard.duration_frames,
        frames_uploaded=0,
        message=f"Queued pass {pass_number} (revision {storyboard.revision})",
        error=None,
    )

    future = _executor.submit(_run, job_id)
    with _lock:
        _running[job_id] = future
    return get_progress(job_id)


def _run(job_id: str) -> None:
    try:
        run_pass(job_id, _reporter(job_id))
        _touch(job_id, status="rendered", phase="done", error=None)
    except Exception as e:  # the failure must reach the UI, not the void
        logger.error("Render pass failed: job_id=%s", job_id, exc_info=True)
        _touch(
            job_id,
            status="failed",
            phase="error",
            error=str(e),
            message="Render failed — see the API logs for the full traceback",
        )


def get_progress(job_id: str) -> RenderProgress:
    """Current progress for `job_id`.

    Falls back to the stored manifest when nothing is in flight, so a page
    reloaded after a completed (or restarted) pass still reports the truth.
    """
    with _lock:
        state = dict(_progress.get(job_id, {}))
    if state:
        state.setdefault("updated_at", datetime.now(UTC))
        return RenderProgress.model_validate({**state, "job_id": job_id})

    manifest = promos.get_manifest(job_id)
    passes = manifest.passes if manifest else []
    return RenderProgress(
        job_id=job_id,
        status="rendered" if passes else "draft",
        # A never-rendered promo is "idle", not "queued": nothing is waiting on
        # the worker, and saying "Queued" next to "No render yet" left first-time
        # users waiting for a pass that was never scheduled.
        phase="done" if passes else "idle",
        pass_number=len(passes),
        total=passes[-1].duration_frames if passes else 0,
        rendered=passes[-1].duration_frames if passes else 0,
        message="Idle" if passes else "No render yet",
        updated_at=passes[-1].finished_at if passes else datetime.now(UTC),
    )


def rendering_job_ids() -> set[str]:
    """Job ids with a pass actually in flight in this process.

    The read-side projections (`service/promo_views.py`) derive status from the
    manifest, which only gains an entry when a pass *finishes* — so without this
    a running pass was indistinguishable from a finished or never-started one and
    the UI's existing `rendering` badge and "Render in flight" disabled state
    could never engage.

    In-process only, like the progress registry: see this module's docstring for
    what that costs and `docs/RELIABILITY.md` for the production stance.
    """
    with _lock:
        return {
            job_id
            for job_id, future in _running.items()
            if future is not None and not future.done()
        }


def forget(job_id: str) -> None:
    """Drop registry state for a deleted promo."""
    with _lock:
        _progress.pop(job_id, None)
        _running.pop(job_id, None)
