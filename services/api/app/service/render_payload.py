"""The render payload handed across the Python -> Node boundary.

Split from `render_pass.py` to keep both files under the 300-line ceiling. Two
things happen here that are easy to get wrong elsewhere:

* **Capture keys become presigned URLs.** Headless Chrome has no B2
  credentials, so the renderer is given short-lived presigned GET URLs. This is
  the only read path for renders and captures — no bucket needs to be public.
* **The payload is a flat, self-contained document.** The Node side never calls
  back into the API; everything it needs to draw the composition is in the file.
"""

from pathlib import Path

from app.repo import get_presigned_inline_url
from app.types.keys import frame_name
from app.types.promo import Storyboard

CAPTURE_URL_TTL_SECONDS = 3600


def render_payload(storyboard: Storyboard) -> dict:
    """The storyboard as the Node renderer needs it.

    Capture keys become short-lived presigned URLs here: headless Chrome has no
    B2 credentials, and presigning is the only read path this app hands out — no
    bucket has to be public for a render to see its own captures.
    """
    shots = []
    for shot in storyboard.shots:
        capture_url = (
            get_presigned_inline_url(shot.capture, CAPTURE_URL_TTL_SECONDS)
            if shot.capture
            else None
        )
        shots.append(
            {
                "card": shot.card,
                "from": shot.from_frame,
                "duration_frames": shot.duration_frames,
                "headline": shot.headline,
                "sub": shot.sub,
                "sfx": shot.sfx,
                "capture_url": capture_url,
            }
        )
    return {
        "job_id": storyboard.job_id,
        "product": storyboard.product,
        "title": storyboard.title,
        "fps": storyboard.fps,
        "bpm": storyboard.bpm,
        "width": storyboard.width,
        "height": storyboard.height,
        "accent": storyboard.accent,
        "duration_frames": storyboard.duration_frames,
        "shots": shots,
    }


def local_frame_bytes(out_dir: Path, total_frames: int) -> tuple[int, int]:
    """(count, bytes) of frames present on local disk. Used when frame upload is off."""
    present = [
        out_dir / frame_name(number)
        for number in range(total_frames)
        if (out_dir / frame_name(number)).exists()
    ]
    return len(present), sum(path.stat().st_size for path in present)
