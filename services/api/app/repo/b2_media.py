"""Presigned URLs and raw-byte writes.

Split out of `b2_client.py` to stay under the 300-line ceiling enforced by
`tests/test_structure.py` (same reason as `b2_object.py` and `b2_stats.py`).
Presigned URLs are the ONLY read path this app hands to a browser: no object is
ever proxied through the API, and no bucket needs to be public.
"""

from urllib.parse import quote

from botocore.exceptions import ClientError

from app.config import settings
from app.repo.b2_client import get_s3_client, upload_file


def get_presigned_url(
    key: str,
    filename: str | None = None,
    expires_in: int = 600,
    inline: bool = False,
) -> str:
    """Generate a presigned GET URL. Raises RuntimeError on failure.

    Downloads force `Content-Disposition: attachment` so user-supplied content
    can never render in the browser origin. `inline=True` is the deliberate
    exception for media this app produced itself — variant MP4s, posters,
    captures and audio beds have to paint inside `<video>`/`<audio>`/`<img>`,
    and an attachment disposition would make them download instead.
    """
    client = get_s3_client()
    params: dict = {"Bucket": settings.b2_bucket_name, "Key": key}
    disposition = "inline" if inline else "attachment"
    if filename:
        # RFC 5987 encoding for non-ASCII filenames
        encoded = quote(filename, safe="")
        params["ResponseContentDisposition"] = (
            f"{disposition}; filename=\"{encoded}\"; filename*=UTF-8''{encoded}"
        )
    else:
        params["ResponseContentDisposition"] = disposition
    try:
        return client.generate_presigned_url(
            "get_object",
            Params=params,
            ExpiresIn=expires_in,
        )
    except ClientError as e:
        raise RuntimeError(f"B2 presign failed for '{key}': {e}") from e


def get_presigned_inline_url(key: str, expires_in: int = 3600) -> str:
    """Presigned URL that renders inline — for this app's own rendered media."""
    return get_presigned_url(key, expires_in=expires_in, inline=True)


def upload_bytes(data: bytes, key: str, content_type: str) -> int:
    """Write raw bytes to B2 and return the byte count.

    Thin wrapper over `upload_file` for callers (renders, posters, captures,
    audio beds) that only need the size back, not full `FileMetadata`.
    """
    return upload_file(data, key, content_type).size_bytes
