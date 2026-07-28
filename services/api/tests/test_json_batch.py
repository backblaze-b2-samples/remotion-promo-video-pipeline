"""`repo.get_json_many` — the batched document read the promo list depends on.

`GET /promos` used to issue two blocking B2 GETs per promo, which is what made a
17-promo list take ~7s. These tests pin the two properties that fix relies on:
the mapping is correct (including missing keys), and the reads really do overlap.
"""

import time

import pytest

from app.repo import b2_json


def test_get_json_many_maps_keys_to_documents(monkeypatch):
    store = {"storyboards/a.json": {"job_id": "a"}, "manifests/a.json": {"passes": []}}
    monkeypatch.setattr(b2_json, "get_json", store.get)

    result = b2_json.get_json_many(["storyboards/a.json", "manifests/a.json"])

    assert result == store


def test_get_json_many_reports_missing_documents_as_none(monkeypatch):
    monkeypatch.setattr(b2_json, "get_json", lambda key: None)

    assert b2_json.get_json_many(["manifests/never-rendered.json"]) == {
        "manifests/never-rendered.json": None
    }


def test_get_json_many_deduplicates_and_handles_empty(monkeypatch):
    seen: list[str] = []

    def fake_get_json(key: str) -> dict:
        seen.append(key)
        return {"key": key}

    monkeypatch.setattr(b2_json, "get_json", fake_get_json)

    assert b2_json.get_json_many([]) == {}
    assert b2_json.get_json_many(["k", "k", "k"]) == {"k": {"key": "k"}}
    assert seen == ["k"]


def test_get_json_many_propagates_read_failures(monkeypatch):
    def boom(key: str) -> dict:
        raise RuntimeError(f"B2 JSON read failed for '{key}'")

    monkeypatch.setattr(b2_json, "get_json", boom)

    with pytest.raises(RuntimeError):
        b2_json.get_json_many(["storyboards/a.json", "storyboards/b.json"])


def test_get_json_many_overlaps_reads(monkeypatch):
    """The whole point: N slow reads cost ~1 round trip, not N.

    Sequentially the 8 keys below would take >= 0.4s; concurrently they take one
    ~0.05s hop, so a generous 0.25s ceiling still fails loudly on a regression to
    a serial loop.
    """
    monkeypatch.setattr(b2_json, "get_json", lambda key: (time.sleep(0.05), {})[1])

    keys = [f"storyboards/{index}.json" for index in range(8)]
    started = time.monotonic()
    result = b2_json.get_json_many(keys)
    elapsed = time.monotonic() - started

    assert len(result) == len(keys)
    assert elapsed < 0.25, f"reads did not overlap ({elapsed:.2f}s)"
