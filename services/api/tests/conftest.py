import pytest
from httpx import ASGITransport, AsyncClient

from app.service import assets as assets_service
from app.service import capture as capture_service
from app.service import jobs, promo_views, promos
from main import app

# The canonical create payload for the promo route suites. Shared so a change to
# the create contract updates one place.
CREATE_BODY = {
    "product": "demo-product",
    "title": "Ship faster with demo-product",
    "preset": "release-teaser",
    "bpm": 120,
    "width": 1280,
    "height": 720,
    "accent": "ink-amber",
    "variants": ["master-16x9", "vertical-9x16"],
    "capture_url": "http://localhost:3000",
    "viewports": ["desktop"],
}


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture(autouse=True)
def clear_list_cache():
    """Clear the repo's bucket-listing cache before each test so cached
    listings never leak across tests (keeps the pagination tests hermetic)."""
    from app.repo import b2_client

    b2_client._invalidate_list_cache()
    yield


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Reset the per-IP rate-limit counters before each test — otherwise the
    whole suite shares one client IP and accumulates hits across tests."""
    from app.runtime import ratelimit

    ratelimit._reset_state()
    yield


@pytest.fixture(autouse=True)
def reset_shared_module_state():
    """Reset the remaining shared module state (B2 connectivity cache and the
    in-process metrics counters) so absolute-value assertions can't become
    order-dependent across the suite."""
    from app.repo import b2_client
    from app.runtime import metrics

    b2_client._health_cache = None
    with metrics._lock:
        metrics._request_count.clear()
        metrics._request_duration_sum.clear()
        metrics._upload_count = 0
        metrics._upload_errors = 0
    yield


@pytest.fixture(autouse=True)
def isolate_download_counter(tmp_path, monkeypatch):
    """Redirect the persisted download counter to a temp file per test and
    reset the in-memory counter to 0. Keeps tests hermetic and prevents
    stray writes to services/api/data/."""
    from app.config import settings
    from app.repo import counter

    counter_path = tmp_path / "download_count.json"
    monkeypatch.setattr(settings, "download_count_file", str(counter_path))
    monkeypatch.setattr(counter, "_count", 0)
    yield


class FakeBucket:
    """Minimal key -> JSON document store standing in for B2."""

    def __init__(self):
        self.documents: dict[str, dict] = {}
        self.deleted: list[str] = []

    def put_json(self, key: str, document: dict) -> int:
        self.documents[key] = document
        return len(str(document))

    def get_json(self, key: str) -> dict | None:
        return self.documents.get(key)

    def get_json_many(self, keys: list[str]) -> dict[str, dict | None]:
        return {key: self.documents.get(key) for key in dict.fromkeys(keys)}

    def list_keys(self, prefix: str) -> list[dict]:
        return [
            {"Key": key, "Size": 1, "LastModified": None}
            for key in sorted(self.documents)
            if key.startswith(prefix)
        ]

    def delete_prefix(self, prefix: str) -> int:
        matched = [key for key in self.documents if key.startswith(prefix)]
        for key in matched:
            del self.documents[key]
        self.deleted.extend(matched)
        return len(matched)

    def delete_file(self, key: str) -> None:
        self.documents.pop(key, None)
        self.deleted.append(key)


@pytest.fixture
def bucket(monkeypatch):
    """Promo CRUD against an in-memory stand-in for B2.

    Same stance as the starter's file tests: the repo layer is monkeypatched, so
    the promo suites run with no credentials, no network, no ffmpeg and no render.
    """
    store = FakeBucket()
    monkeypatch.setattr(promos, "put_json", store.put_json)
    monkeypatch.setattr(promos, "get_json", store.get_json)
    monkeypatch.setattr(promos, "delete_prefix", store.delete_prefix)
    monkeypatch.setattr(promos, "delete_file", store.delete_file)
    monkeypatch.setattr(promo_views, "get_json_many", store.get_json_many)
    monkeypatch.setattr(promo_views, "list_keys", store.list_keys)
    monkeypatch.setattr(promo_views, "list_frame_numbers", lambda prefix: {})
    monkeypatch.setattr(
        promo_views,
        "get_presigned_inline_url",
        lambda key, *a, **k: f"https://signed/{key}",
    )
    # Capture is exercised in its own suites; here it must not launch a browser.
    monkeypatch.setattr(
        capture_service,
        "capture_product",
        lambda product, **kwargs: {
            "product": product,
            "url": kwargs.get("url", ""),
            "engine": "placeholder",
            "note": "test",
            "captures": [],
        },
    )
    monkeypatch.setattr(
        assets_service,
        "capture_keys_by_viewport",
        lambda product: {"desktop": f"assets/{product}/captures/desktop/product@2x.png"},
    )
    jobs._reset_state()
    yield store
    jobs._reset_state()
