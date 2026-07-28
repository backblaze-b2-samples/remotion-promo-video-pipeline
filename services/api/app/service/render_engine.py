"""The Python -> Node boundary.

Remotion is a React renderer, so the frames have to be produced by Node. This
module owns the only subprocess that crosses that boundary:
`packages/remotion/render-frames.mjs`.

The contract is deliberately narrow and machine-readable:

* Python passes a storyboard JSON file path, a variant id, an output directory,
  a frame range and a concurrency number as argv.
* Node writes **NDJSON on stdout, nothing else** — one JSON object per line:
  `{"type":"progress","rendered":N,"total":M}` then
  `{"type":"done","frameCount":N}`, or `{"type":"error","message":...}` with a
  non-zero exit. All human logging goes to stderr.

That is why this side can parse line-by-line and stream real progress into the
UI instead of blocking on a completed render.
"""

import functools
import json
import logging
import os
import shutil
import subprocess
from collections.abc import Callable
from pathlib import Path

from app.config import settings
from app.service.encode import BinaryMissingError

logger = logging.getLogger(__name__)

# services/api/app/service/render_engine.py -> repo root
REPO_ROOT = Path(__file__).resolve().parents[4]
RENDER_CLI = REPO_ROOT / "packages" / "remotion" / "render-frames.mjs"

RENDER_TIMEOUT_SECONDS = 3600
_STDERR_TAIL_LINES = 12

ProgressCallback = Callable[[int, int], None]


class RenderError(RuntimeError):
    """Raised when the Node render CLI fails."""


@functools.lru_cache(maxsize=1)
def resolve_node() -> str:
    """Absolute path to a usable node. Raises BinaryMissingError."""
    if settings.node_binary:
        configured = shutil.which(settings.node_binary) or settings.node_binary
        if Path(configured).exists():
            return configured
        raise BinaryMissingError(
            f"NODE_BINARY points at '{settings.node_binary}', which does not exist. "
            "Fix the path in .env or unset it to use `node` from PATH."
        )
    on_path = shutil.which("node")
    if on_path:
        return on_path
    raise BinaryMissingError(
        "No node found. Tried NODE_BINARY (unset) and `node` on PATH. Install "
        "Node.js >= 20 (nvm install 20) — Remotion renders in Node, so the "
        "frame renderer cannot start without it."
    )


def ensure_render_cli() -> Path:
    """Verify the Node render package is installed. Raises BinaryMissingError."""
    if not RENDER_CLI.exists():
        raise BinaryMissingError(
            f"Render CLI missing at {RENDER_CLI}. It ships with the repo under "
            "packages/remotion/ — restore it or re-clone."
        )
    node_modules = REPO_ROOT / "node_modules"
    if not node_modules.exists():
        raise BinaryMissingError(
            "Workspace dependencies are not installed, so Remotion is unavailable. "
            "Run `pnpm run setup` (or `pnpm install`) from the repo root."
        )
    return RENDER_CLI


def _child_env() -> dict[str, str]:
    env = dict(os.environ)
    # Optional GPU rasterization for Remotion's headless Chrome. Unset by
    # default: CPU rasterization is the only path guaranteed to exist on every
    # host, so a GPU is never required to render.
    if settings.remotion_gl:
        env["REMOTION_GL"] = settings.remotion_gl
    else:
        env.pop("REMOTION_GL", None)
    return env


def render_frames(
    storyboard_path: Path,
    variant: str,
    out_dir: Path,
    frame_range: tuple[int, int],
    concurrency: int | None = None,
    on_progress: ProgressCallback | None = None,
) -> int:
    """Render `frame_range` (inclusive) of one variant into `out_dir`.

    Returns the number of frames the renderer reported. Raises RenderError with
    the tail of stderr on failure — Remotion's own diagnostics are the useful
    part, so they are surfaced rather than swallowed.
    """
    cli = ensure_render_cli()
    node = resolve_node()
    out_dir.mkdir(parents=True, exist_ok=True)
    workers = concurrency or settings.resolved_render_concurrency

    args = [
        node,
        str(cli),
        "--storyboard",
        str(storyboard_path),
        "--variant",
        variant,
        "--out-dir",
        str(out_dir),
        "--frame-range",
        f"{frame_range[0]}-{frame_range[1]}",
        "--concurrency",
        str(max(1, workers)),
    ]
    logger.info(
        "Rendering frames: variant=%s range=%s-%s concurrency=%d",
        variant,
        frame_range[0],
        frame_range[1],
        max(1, workers),
    )

    process = subprocess.Popen(  # argv list, never a shell string
        args,
        cwd=str(REPO_ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=_child_env(),
    )

    frame_count = 0
    error_message: str | None = None
    assert process.stdout is not None
    for line in process.stdout:
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            # Non-JSON on stdout is a contract violation on the Node side. Log
            # it rather than crashing the pass, so a stray library write can be
            # diagnosed instead of just failing the render.
            logger.warning("Render CLI wrote non-JSON to stdout: %s", line[:200])
            continue
        kind = event.get("type")
        if kind == "progress" and on_progress:
            on_progress(int(event.get("rendered", 0)), int(event.get("total", 0)))
        elif kind == "done":
            frame_count = int(event.get("frameCount", 0))
        elif kind == "error":
            error_message = str(event.get("message", "unknown render error"))

    stderr = (process.stderr.read() if process.stderr else "") or ""
    returncode = process.wait(timeout=RENDER_TIMEOUT_SECONDS)

    if returncode != 0 or error_message:
        tail = " | ".join(stderr.strip().splitlines()[-_STDERR_TAIL_LINES:])
        raise RenderError(
            f"Remotion render failed for variant '{variant}' (exit {returncode}): "
            f"{error_message or tail or 'no diagnostics on stderr'}"
        )
    return frame_count
