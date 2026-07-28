"""`/promos` routes against an in-memory stand-in for B2.

Same stance as the starter's file tests: the repo layer is monkeypatched, so the
whole suite runs with no credentials, no network, no ffmpeg and no render.
"""

import pytest

from app.service import jobs
from app.types.keys import manifest_key, storyboard_key

# `FakeBucket` and the `bucket` fixture live in conftest.py: `test_promo_status.py`
# needs exactly the same in-memory B2 stand-in, and re-importing a fixture across
# test modules is an F811 violation.
from .conftest import CREATE_BODY


async def _create(client) -> dict:
    response = await client.post("/promos", json=CREATE_BODY)
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
async def test_create_writes_a_storyboard_at_revision_one(client, bucket):
    storyboard = await _create(client)
    assert storyboard["revision"] == 1
    assert storyboard["duration_frames"] == 180
    assert len(storyboard["shots"]) == 6
    assert storyboard_key(storyboard["job_id"]) in bucket.documents
    # Captures found for the product are wired into the shots.
    assert storyboard["shots"][0]["capture"].endswith("product@2x.png")


@pytest.mark.asyncio
async def test_create_forces_the_master_variant(client, bucket):
    body = {**CREATE_BODY, "variants": ["vertical-9x16"]}
    response = await client.post("/promos", json=body)
    assert response.status_code == 201
    assert response.json()["variants"][0] == "master-16x9"


@pytest.mark.asyncio
async def test_create_rejects_an_unknown_variant(client, bucket):
    response = await client.post("/promos", json={**CREATE_BODY, "variants": ["imax"]})
    assert response.status_code == 400
    assert "variant" in response.json()["detail"]


@pytest.mark.asyncio
async def test_create_rejects_an_unknown_preset(client, bucket):
    response = await client.post("/promos", json={**CREATE_BODY, "preset": "nope"})
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_shots_are_beat_snapped_and_preserve_the_total(client, bucket):
    storyboard = await _create(client)
    frames_per_beat = (storyboard["fps"] * 60) / storyboard["bpm"]
    assert sum(shot["duration_frames"] for shot in storyboard["shots"]) == 180
    for shot in storyboard["shots"][1:]:
        assert shot["from"] % frames_per_beat == 0, shot


@pytest.mark.asyncio
async def test_list_returns_a_draft_summary(client, bucket):
    storyboard = await _create(client)
    response = await client.get("/promos")
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 1
    assert rows[0]["job_id"] == storyboard["job_id"]
    assert rows[0]["status"] == "draft"
    assert rows[0]["passes"] == 0
    assert rows[0]["poster_url"] is None


@pytest.mark.asyncio
async def test_detail_has_no_playback_before_a_render(client, bucket):
    storyboard = await _create(client)
    response = await client.get(f"/promos/{storyboard['job_id']}")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "draft"
    assert body["playback"] == []
    assert body["manifest"] is None
    assert body["frame_samples"] == []


@pytest.mark.asyncio
async def test_detail_404s_for_an_unknown_promo(client, bucket):
    response = await client.get("/promos/does-not-exist")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_patch_bumps_the_revision(client, bucket):
    storyboard = await _create(client)
    response = await client.patch(
        f"/promos/{storyboard['job_id']}",
        json={"title": "New title"},
    )
    assert response.status_code == 200
    updated = response.json()
    assert updated["revision"] == 2
    assert updated["title"] == "New title"


@pytest.mark.asyncio
async def test_patching_shots_re_snaps_and_keeps_the_new_total(client, bucket):
    storyboard = await _create(client)
    shots = [
        {
            "card": "paper-title-card",
            "duration_frames": 22,
            "headline": "A",
            "sub": "",
            "sfx": "none",
            "capture": None,
        },
        {
            "card": "row-embed",
            "duration_frames": 38,
            "headline": "B",
            "sub": "",
            "sfx": "riser",
            "capture": None,
        },
    ]
    response = await client.patch(
        f"/promos/{storyboard['job_id']}", json={"shots": shots}
    )
    assert response.status_code == 200
    updated = response.json()
    assert updated["duration_frames"] == 60
    assert [shot["duration_frames"] for shot in updated["shots"]] == [15, 45]
    assert updated["shots"][1]["sfx"] == "riser"


@pytest.mark.asyncio
async def test_patch_rejects_an_unknown_card(client, bucket):
    storyboard = await _create(client)
    response = await client.patch(
        f"/promos/{storyboard['job_id']}",
        json={
            "shots": [
                {
                    "card": "not-a-card",
                    "duration_frames": 30,
                    "headline": "",
                    "sub": "",
                    "sfx": "none",
                    "capture": None,
                }
            ]
        },
    )
    assert response.status_code == 400
    assert "shot card" in response.json()["detail"]


@pytest.mark.asyncio
async def test_delete_is_scoped_to_the_promos_own_prefixes(client, bucket):
    storyboard = await _create(client)
    job_id = storyboard["job_id"]
    # Another promo and a shared asset must survive the delete.
    other = await _create(client)
    bucket.documents["assets/demo-product/brand/logo.json"] = {"keep": True}

    response = await client.delete(f"/promos/{job_id}")
    assert response.status_code == 200
    assert response.json()["deleted"] is True

    assert storyboard_key(job_id) not in bucket.documents
    assert storyboard_key(other["job_id"]) in bucket.documents
    assert "assets/demo-product/brand/logo.json" in bucket.documents
    assert all(job_id in key for key in bucket.deleted)


@pytest.mark.asyncio
async def test_delete_404s_for_an_unknown_promo(client, bucket):
    response = await client.delete("/promos/nope")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_progress_reports_idle_before_any_render(client, bucket):
    storyboard = await _create(client)
    response = await client.get(f"/promos/{storyboard['job_id']}/progress")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "draft"
    assert body["message"] == "No render yet"


@pytest.mark.asyncio
async def test_render_returns_202_and_a_progress_location(client, bucket, monkeypatch):
    storyboard = await _create(client)
    job_id = storyboard["job_id"]
    # Don't actually render: assert the route contract, not Remotion.
    monkeypatch.setattr(jobs, "_executor", _InlineExecutor(lambda: None))

    response = await client.post(f"/promos/{job_id}/render")
    assert response.status_code == 202
    assert response.headers["Location"] == f"/promos/{job_id}/progress"
    body = response.json()
    assert body["pass_number"] == 1
    assert body["variant_total"] == 2
    assert body["total"] == 180


@pytest.mark.asyncio
async def test_render_404s_for_an_unknown_promo(client, bucket):
    response = await client.post("/promos/nope/render")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_a_failed_pass_surfaces_its_error_in_progress(client, bucket, monkeypatch):
    storyboard = await _create(client)
    job_id = storyboard["job_id"]

    def boom(_job_id, _report):
        raise RuntimeError("ffmpeg exploded")

    monkeypatch.setattr(jobs, "run_pass", boom)
    monkeypatch.setattr(jobs, "_executor", _InlineExecutor(None))

    await client.post(f"/promos/{job_id}/render")
    response = await client.get(f"/promos/{job_id}/progress")
    body = response.json()
    assert body["status"] == "failed"
    assert body["phase"] == "error"
    assert "ffmpeg exploded" in body["error"]


@pytest.mark.asyncio
async def test_stats_are_zero_with_no_manifests(client, bucket):
    await _create(client)
    response = await client.get("/promos/stats")
    assert response.status_code == 200
    body = response.json()
    assert body["passes"] == 0
    assert body["amplification_ratio"] == 0.0
    assert body["frame_bytes_human"] == "0.0 B"


@pytest.mark.asyncio
async def test_stats_read_the_manifests(client, bucket):
    storyboard = await _create(client)
    bucket.documents[manifest_key(storyboard["job_id"])] = {
        "job_id": storyboard["job_id"],
        "product": "demo-product",
        "title": "t",
        "passes": [
            {
                "pass_number": 1,
                "revision": 1,
                "started_at": "2026-07-01T00:00:00Z",
                "finished_at": "2026-07-01T00:05:00Z",
                "storyboard_key": storyboard_key(storyboard["job_id"]),
                "fps": 30,
                "bpm": 120,
                "duration_frames": 180,
                "shot_cards": ["paper-title-card"],
                "variants": [
                    {
                        "variant": "master-16x9",
                        "width": 1280,
                        "height": 720,
                        "frame_count": 180,
                        "frame_bytes": 4000,
                        "variant_key": "renders/x/master-16x9.mp4",
                        "variant_bytes": 400,
                        "poster_key": "renders/x/master-16x9.poster.jpg",
                        "duration_seconds": 6.0,
                    }
                ],
                "frames_written": 180,
                "frame_bytes": 4000,
                "variant_bytes": 400,
                "amplification_ratio": 10.0,
            }
        ],
        "totals": {
            "passes": 1,
            "frames_written": 180,
            "frame_bytes": 4000,
            "variant_bytes": 400,
            "amplification_ratio": 10.0,
        },
    }

    response = await client.get("/promos/stats")
    body = response.json()
    assert body["passes"] == 1
    assert body["amplification_ratio"] == 10.0
    assert body["variants_delivered"] == 1

    volume = await client.get("/promos/volume?limit=4")
    assert volume.status_code == 200
    assert volume.json()[0]["frame_bytes"] == 4000

    # The list summary now carries a poster URL and the ratio.
    rows = (await client.get("/promos")).json()
    assert rows[0]["status"] == "rendered"
    assert rows[0]["poster_url"].startswith("https://signed/")
    assert rows[0]["amplification_ratio"] == 10.0


@pytest.mark.asyncio
async def test_volume_limit_is_validated(client, bucket):
    assert (await client.get("/promos/volume?limit=0")).status_code == 400
    assert (await client.get("/promos/volume?limit=500")).status_code == 400


@pytest.mark.asyncio
async def test_promo_defaults_expose_selector_options_only(client):
    response = await client.get("/promo-defaults")
    assert response.status_code == 200
    body = response.json()
    assert len(body["bpm_options"]) == 4
    assert len(body["resolution_options"]) == 2
    assert len(body["variant_options"]) == 4
    assert len(body["viewport_options"]) == 3
    assert len(body["preset_options"]) == 3
    assert body["render_concurrency"] >= 1  # never 0
    assert body["capture_url"].startswith("http")


@pytest.mark.asyncio
async def test_shot_cards_endpoint_serves_the_shared_library(client):
    response = await client.get("/shot-cards")
    assert response.status_code == 200
    body = response.json()
    assert len(body["cards"]) == 10
    assert body["upstream_card_count"] == 104
    assert "video-shotcraft" in body["upstream"]


@pytest.mark.asyncio
async def test_storyboard_presets_endpoint(client):
    response = await client.get("/storyboard-presets")
    assert response.status_code == 200
    ids = {preset["id"] for preset in response.json()}
    assert ids == {"release-teaser", "feature-tour", "ink-press-full"}


class _InlineExecutor:
    """Runs the submitted callable immediately, so tests stay deterministic."""

    def __init__(self, _unused):
        self._unused = _unused

    def submit(self, fn, *args, **kwargs):
        fn(*args, **kwargs)
        return _DoneFuture()


class _DoneFuture:
    def done(self) -> bool:
        return True
