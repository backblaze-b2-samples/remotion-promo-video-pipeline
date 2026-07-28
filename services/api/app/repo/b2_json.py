"""JSON documents in B2: storyboards (the job records) and delivery manifests.

B2 is the only store in this app — there is no database. `storyboards/<id>.json`
*is* the promo job, and `manifests/<id>.json` accumulates one entry per
completed render pass. Both go through here so the encoding, content type and
not-found semantics are identical for every document.
"""

import json
import logging
from concurrent.futures import ThreadPoolExecutor

from botocore.exceptions import BotoCoreError, ClientError

from app.config import settings
from app.repo.b2_client import _invalidate_list_cache, get_s3_client

logger = logging.getLogger(__name__)

CONTENT_TYPE = "application/json"

# How many document GETs run at once in `get_json_many`. Same reasoning as
# `b2_frames._MAX_CONCURRENCY`: B2 rate-limits per account, so a bounded pool
# beats "one thread per key". A promo list is 2 documents per promo, so 8 keeps
# a few dozen promos inside a couple of round-trip times.
JSON_FETCH_CONCURRENCY = 8


def put_json(key: str, document: dict) -> int:
    """Write a JSON document. Returns bytes written. Raises RuntimeError."""
    body = json.dumps(document, indent=2, sort_keys=False, default=str).encode()
    client = get_s3_client()
    try:
        client.put_object(
            Bucket=settings.b2_bucket_name,
            Key=key,
            Body=body,
            ContentType=CONTENT_TYPE,
        )
    except (ClientError, BotoCoreError) as e:
        raise RuntimeError(f"B2 JSON write failed for '{key}': {e}") from e
    _invalidate_list_cache()
    return len(body)


def get_json(key: str) -> dict | None:
    """Read a JSON document, or None when it does not exist.

    A malformed document is treated as missing rather than raising: a
    half-written manifest must not make the whole promo list unreadable.
    """
    client = get_s3_client()
    try:
        response = client.get_object(Bucket=settings.b2_bucket_name, Key=key)
        raw = response["Body"].read()
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("404", "NoSuchKey"):
            return None
        raise RuntimeError(f"B2 JSON read failed for '{key}': {e}") from e
    except BotoCoreError as e:
        raise RuntimeError(f"B2 JSON read failed for '{key}': {e}") from e

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Ignoring malformed JSON document at key=%s", key)
        return None
    return parsed if isinstance(parsed, dict) else None


def get_json_many(keys: list[str]) -> dict[str, dict | None]:
    """Read many JSON documents CONCURRENTLY. Returns key -> document (or None).

    Every read-side projection over `storyboards/` + `manifests/` needs one
    document per promo (often two), and B2 round trips are ~200 ms each. Issued
    serially that is the whole response time of `GET /promos`: 17 promos meant 34
    blocking GETs and a ~7 s reply, so the list was skeletons for most of a visit.

    Duplicate keys are fetched once. Raises RuntimeError if any read fails, with
    the same semantics as `get_json` — a missing key is None, not an error.
    """
    unique = list(dict.fromkeys(keys))
    if not unique:
        return {}
    if len(unique) == 1:
        return {unique[0]: get_json(unique[0])}
    workers = min(JSON_FETCH_CONCURRENCY, len(unique))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        return dict(zip(unique, pool.map(get_json, unique), strict=True))
