"""Bulk frame I/O against B2.

A single 36.2s 1080p pass is 1,086 PNG objects per variant. That volume is the
whole point of this sample, so the frame path gets its own repo module with
three properties the single-object helpers in `b2_client` cannot give it:

1. **Threaded.** `put_frames` / `fetch_frames` run `FRAME_UPLOAD_CONCURRENCY`
   requests at a time instead of 1,086 serial round trips.
2. **One cache invalidation, not 1,086.** `_invalidate_list_cache()` is called
   once at the end of a batch; per-object invalidation would make the bucket
   explorer re-scan after every frame.
3. **Resume support.** `list_frame_numbers` reads back which frames already
   landed, so a killed render resumes from B2 instead of restarting.

boto3 stays confined to this layer; the cached client is reused from
`b2_client` for connection pooling.
"""

import logging
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from botocore.exceptions import BotoCoreError, ClientError

from app.config import settings
from app.repo.b2_client import (
    _fetch_all_objects,
    _invalidate_list_cache,
    get_s3_client,
)
from app.types.keys import frame_number_from_key

logger = logging.getLogger(__name__)

# Hard ceiling on threads regardless of configuration: B2 rate-limits per
# account, and hundreds of parallel PUTs earn 503s rather than throughput.
_MAX_CONCURRENCY = 32


def _bounded(concurrency: int | None) -> int:
    requested = concurrency or settings.frame_upload_concurrency
    return max(1, min(int(requested), _MAX_CONCURRENCY))


def _put_one(key: str, path: Path, content_type: str) -> int:
    client = get_s3_client()
    body = path.read_bytes()
    try:
        client.put_object(
            Bucket=settings.b2_bucket_name,
            Key=key,
            Body=body,
            ContentType=content_type,
        )
    except (ClientError, BotoCoreError) as e:
        raise RuntimeError(f"B2 frame upload failed for '{key}': {e}") from e
    return len(body)


def put_frames(
    items: list[tuple[str, Path]],
    concurrency: int | None = None,
    content_type: str = "image/png",
) -> int:
    """Upload every (key, local path) pair. Returns total bytes written.

    Invalidates the listing cache exactly once, after the whole batch.
    """
    if not items:
        return 0
    total = 0
    with ThreadPoolExecutor(max_workers=_bounded(concurrency)) as pool:
        futures = [pool.submit(_put_one, key, path, content_type) for key, path in items]
        for future in futures:
            total += future.result()
    _invalidate_list_cache()
    logger.info("Frames uploaded: count=%d bytes=%d", len(items), total)
    return total


def _fetch_one(key: str, path: Path) -> int:
    client = get_s3_client()
    try:
        response = client.get_object(Bucket=settings.b2_bucket_name, Key=key)
        body = response["Body"].read()
    except (ClientError, BotoCoreError) as e:
        raise RuntimeError(f"B2 frame download failed for '{key}': {e}") from e
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)
    return len(body)


def fetch_frames(items: list[tuple[str, Path]], concurrency: int | None = None) -> int:
    """Download frames already in B2 into a local pass directory.

    Used by the resume path: frames that survived a killed run are pulled back
    from B2 so the encode sees a complete sequence without re-rendering them.
    """
    if not items:
        return 0
    total = 0
    with ThreadPoolExecutor(max_workers=_bounded(concurrency)) as pool:
        futures = [pool.submit(_fetch_one, key, path) for key, path in items]
        for future in futures:
            total += future.result()
    return total


def list_frame_numbers(prefix: str) -> dict[int, int]:
    """Frame number -> size in bytes for every frame already under `prefix`.

    The resume scan. Uses the paginated listing helper directly (not the cached
    empty-prefix path) because a pass prefix is scanned at most twice per run.
    """
    found: dict[int, int] = {}
    for obj in _fetch_all_objects(prefix):
        number = frame_number_from_key(obj["Key"])
        if number is not None:
            found[number] = int(obj["Size"])
    return found


def delete_prefix(prefix: str, concurrency: int | None = None) -> int:
    """Delete every object under `prefix`. Returns the number deleted.

    Callers pass only prefixes from `types.keys.job_prefixes()`, so this can
    never walk the whole bucket. Guarded here too: an empty prefix is refused.
    """
    if not prefix or prefix in ("/", "*"):
        raise ValueError("delete_prefix requires a non-empty, scoped prefix")
    keys = [obj["Key"] for obj in _fetch_all_objects(prefix)]
    if not keys:
        return 0

    client = get_s3_client()

    def _delete(key: str) -> None:
        try:
            client.delete_object(Bucket=settings.b2_bucket_name, Key=key)
        except (ClientError, BotoCoreError) as e:
            raise RuntimeError(f"B2 delete failed for '{key}': {e}") from e

    with ThreadPoolExecutor(max_workers=_bounded(concurrency)) as pool:
        for future in [pool.submit(_delete, key) for key in keys]:
            future.result()
    _invalidate_list_cache()
    logger.info("Prefix purged: prefix=%s count=%d", prefix, len(keys))
    return len(keys)


def list_keys(prefix: str) -> list[dict]:
    """Raw listing rows (Key/Size/LastModified) under `prefix`."""
    return _fetch_all_objects(prefix)
