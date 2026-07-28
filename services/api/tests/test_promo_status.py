"""What the UI is told about a promo: capture provenance and in-flight state.

Two regressions:

* A running pass was indistinguishable from a finished or never-started one.
  `promo_views` derived status purely from the manifest, which only gains an entry
  when a pass *finishes* — so mid-pass the detail header read "Rendered", the
  render button stayed enabled, and the existing `rendering` badge and "Render in
  flight" tooltip could never engage.
* A capture that degraded to a Pillow placeholder was reported as plain success
  and left no trace on the job record, so the promo detail page could not say
  that the promo was built from synthetic cards rather than the product UI.
"""

import pytest

from app.service import assets as assets_service
from app.service import capture as capture_service
from app.service import jobs, promo_views, promos
from app.types.variants import MASTER_VARIANT, required_variant_ids

from .conftest import CREATE_BODY


async def _create(client, **overrides) -> dict:
    response = await client.post("/promos", json={**CREATE_BODY, **overrides})
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
async def test_a_degraded_capture_is_recorded_on_the_storyboard(client, bucket):
    storyboard = await _create(client)
    # The shared fixture's fake capture reports a placeholder fallback.
    assert storyboard["capture_engine"] == "placeholder"
    assert storyboard["capture_note"] == "test"
    # ...and it survives on the job record, not just in the create response.
    detail = (await client.get(f"/promos/{storyboard['job_id']}")).json()
    assert detail["storyboard"]["capture_engine"] == "placeholder"


@pytest.mark.asyncio
async def test_a_real_capture_records_playwright_and_no_note(
    client, bucket, monkeypatch
):
    monkeypatch.setattr(
        capture_service,
        "capture_product",
        lambda product, **kwargs: {
            "product": product,
            "url": kwargs.get("url", ""),
            "engine": "playwright",
            "note": "",
            "captures": [],
        },
    )
    monkeypatch.setattr(
        assets_service, "capture_keys_by_viewport", lambda product: {"desktop": "k.png"}
    )
    storyboard = await _create(client)
    assert storyboard["capture_engine"] == "playwright"
    assert storyboard["capture_note"] == ""


@pytest.mark.asyncio
async def test_an_in_flight_pass_reports_rendering_in_the_list_and_detail(
    client, bucket, monkeypatch
):
    storyboard = await _create(client)
    job_id = storyboard["job_id"]
    assert (await client.get("/promos")).json()[0]["status"] == "draft"

    # Stand in for a future that has not finished, exactly as the worker would
    # leave it while a pass is running.
    monkeypatch.setattr(jobs, "_running", {job_id: _PendingFuture()})

    assert (await client.get(f"/promos/{job_id}")).json()["status"] == "rendering"
    rows = (await client.get("/promos")).json()
    assert [row["status"] for row in rows if row["job_id"] == job_id] == ["rendering"]


@pytest.mark.asyncio
async def test_a_finished_pass_stops_reporting_rendering(client, bucket, monkeypatch):
    storyboard = await _create(client)
    job_id = storyboard["job_id"]
    monkeypatch.setattr(jobs, "_running", {job_id: _DoneFuture()})
    assert (await client.get(f"/promos/{job_id}")).json()["status"] == "draft"


@pytest.mark.asyncio
async def test_a_never_rendered_promo_is_idle_not_queued(client, bucket):
    storyboard = await _create(client)
    body = (await client.get(f"/promos/{storyboard['job_id']}/progress")).json()
    # "queued" would claim a pass is waiting on the render worker. Nothing is.
    assert body["phase"] == "idle"
    assert body["status"] == "draft"
    assert body["message"] == "No render yet"


@pytest.mark.asyncio
async def test_variant_options_mark_the_force_added_variant_required(client):
    options = (await client.get("/promo-defaults")).json()["variant_options"]
    required = [option["id"] for option in options if option["required"]]
    # The backend force-adds the master in create AND update, so the forms have
    # to be able to show it as locked-on instead of an ignorable checkbox.
    assert required == [MASTER_VARIANT] == required_variant_ids()


@pytest.mark.asyncio
async def test_an_edit_that_drops_the_master_still_gets_it_back(client, bucket):
    storyboard = await _create(client)
    patched = await client.patch(
        f"/promos/{storyboard['job_id']}", json={"variants": ["square-1x1"]}
    )
    assert patched.status_code == 200
    assert patched.json()["variants"][0] == MASTER_VARIANT


def test_status_helper_puts_in_flight_ahead_of_the_manifest():
    assert promo_views._status("a", has_passes=True, in_flight={"a"}) == "rendering"
    assert promo_views._status("a", has_passes=False, in_flight={"a"}) == "rendering"
    assert promo_views._status("a", has_passes=True, in_flight=set()) == "rendered"
    assert promo_views._status("a", has_passes=False, in_flight=set()) == "draft"


def test_rendering_job_ids_ignores_finished_and_missing_futures(monkeypatch):
    monkeypatch.setattr(
        jobs, "_running", {"live": _PendingFuture(), "done": _DoneFuture()}
    )
    assert jobs.rendering_job_ids() == {"live"}
    monkeypatch.setattr(jobs, "_running", {})
    assert jobs.rendering_job_ids() == set()


def test_create_promo_records_no_engine_when_the_outcome_is_unknown(bucket):
    """A storyboard written without a capture outcome must not claim one.

    Storyboards already in a bucket predate the field, so the default is empty:
    defaulting to "playwright" would assert a real product capture that may never
    have happened, which is the same lie in the other direction.
    """
    from app.types.promo import StoryboardCreate

    storyboard = promos.create_promo(StoryboardCreate(**CREATE_BODY), capture=None)
    assert storyboard.capture_engine == ""
    assert storyboard.capture_note == ""


class _PendingFuture:
    def done(self) -> bool:
        return False


class _DoneFuture:
    def done(self) -> bool:
        return True
