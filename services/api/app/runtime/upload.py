import logging

from fastapi import APIRouter, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.config import settings
from app.runtime.metrics import record_upload
from app.service.upload import DEFAULT_FOLDER, UploadError, process_upload
from app.types import FileUploadResponse
from app.types.keys import asset_prefix

logger = logging.getLogger(__name__)

router = APIRouter()

# `kind` -> subfolder inside assets/<product>/. Anything else (or no product)
# falls back to the generic uploads/ root, so the plain dropzone still works.
ASSET_FOLDERS = {
    "brand": "brand/",
    "audio": "audio/bgm/",
    "capture": "captures/manual/",
}


def resolve_folder(product: str, kind: str) -> str:
    """Where an ingested file lands. `/ingest` files assets by product."""
    subfolder = ASSET_FOLDERS.get(kind)
    if product and subfolder:
        return f"{asset_prefix(product)}{subfolder}"
    return DEFAULT_FOLDER


@router.post("/upload", response_model=FileUploadResponse)
async def upload(
    request: Request,
    file: UploadFile,
    product: str = "",
    kind: str = "",
):
    """Upload one file.

    With `?product=<slug>&kind=brand|audio|capture` the object is filed into
    `assets/<product>/...` so it shows up in the scoped `/library` view; without
    them it lands in `uploads/` like the starter kit's plain dropzone.
    """
    content_type = file.content_type or "application/octet-stream"
    # A malformed Content-Length shouldn't 500 the request; the streaming loop
    # below enforces the real size limit regardless of the header.
    content_length_header = request.headers.get("content-length")
    try:
        content_length = int(content_length_header) if content_length_header else None
    except ValueError:
        content_length = None

    # Read file with chunked streaming and early size rejection
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(1024 * 1024)  # 1MB chunks
        if not chunk:
            break
        total += len(chunk)
        if total > settings.max_file_size:
            raise HTTPException(status_code=413, detail="File too large")
        chunks.append(chunk)
    file_data = b"".join(chunks)

    try:
        # process_upload does blocking work (hashing, metadata, B2 put_object).
        # Offload it so the streaming event loop isn't blocked while it runs.
        result = await run_in_threadpool(
            process_upload,
            file_data=file_data,
            filename=file.filename or "",
            content_type=content_type,
            content_length=content_length,
            folder=resolve_folder(product, kind),
        )
    except UploadError as e:
        logger.warning("Upload rejected: %s", e.detail)
        record_upload(success=False)
        raise HTTPException(status_code=e.status_code, detail=e.detail) from None

    record_upload(success=True)
    logger.info(
        "File uploaded: key=%s size=%d type=%s",
        result.key,
        result.size_bytes,
        result.content_type,
    )
    return result
