"""JSON documents in B2: storyboards (the job records) and delivery manifests.

B2 is the only store in this app — there is no database. `storyboards/<id>.json`
*is* the promo job, and `manifests/<id>.json` accumulates one entry per
completed render pass. Both go through here so the encoding, content type and
not-found semantics are identical for every document.
"""

import json
import logging

from botocore.exceptions import BotoCoreError, ClientError

from app.config import settings
from app.repo.b2_client import _invalidate_list_cache, get_s3_client

logger = logging.getLogger(__name__)

CONTENT_TYPE = "application/json"


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
