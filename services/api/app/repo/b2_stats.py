"""Bucket-wide aggregate stats.

Split out of `b2_client.py` purely to stay under the 300-line ceiling enforced
by `tests/test_structure.py` (same reason as `b2_object.py`). boto3 stays inside
the repo layer; the cached listing is reused from `b2_client`.
"""

from datetime import UTC, datetime

from app.repo.b2_client import _list_all_objects
from app.types.formatting import humanize_bytes


def get_upload_stats() -> dict:
    """Aggregate stats across every object in the bucket.

    Raises RuntimeError on S3 failure.
    """
    contents = _list_all_objects()
    total_size = sum(obj["Size"] for obj in contents)
    today = datetime.now(UTC).date()
    uploads_today = sum(
        1 for obj in contents if obj["LastModified"].date() == today
    )
    return {
        "total_files": len(contents),
        "total_size_bytes": total_size,
        "total_size_human": humanize_bytes(total_size),
        "uploads_today": uploads_today,
    }
