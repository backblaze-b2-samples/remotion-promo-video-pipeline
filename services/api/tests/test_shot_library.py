"""The shared JSON is the single source of truth — assert it stays coherent.

`packages/shared/src/*.json` is read by BOTH `packages/remotion` and this API, so
a preset that names a card nobody implemented would fail at frame 1 of a render
rather than here. These tests move that failure to CI.
"""

from app.types.library import (
    accent_ids,
    preset_by_id,
    presets,
    sfx_ids,
    shot_card_ids,
    shot_card_library,
    shot_cards,
    variant_defs,
)
from app.types.variants import (
    MASTER_VARIANT,
    tier_from_master,
    variant_geometry,
    variant_ids,
    variant_spec,
)


def test_ten_cards_are_implemented_one_per_category():
    cards = shot_cards()
    assert len(cards) == 10
    assert all(card["implemented"] for card in cards)
    categories = {card["category"] for card in cards}
    assert len(categories) == 10, "one card per upstream category"


def test_every_card_carries_the_metadata_the_ui_shows():
    for card in shot_cards():
        assert card["purpose"], card["id"]
        assert card["pitfalls"], card["id"]
        assert card["default_duration_frames"] >= 6, card["id"]
        assert card["energy"] in {"calm", "medium", "high"}, card["id"]


def test_every_preset_only_uses_implemented_cards():
    known = shot_card_ids()
    for preset in presets():
        for shot in preset["shots"]:
            assert shot["card"] in known, f"{preset['id']} -> {shot['card']}"


def test_preset_durations_match_their_declared_totals():
    expected = {"release-teaser": 180, "feature-tour": 540, "ink-press-full": 1086}
    for preset in presets():
        total = sum(shot["duration_frames"] for shot in preset["shots"])
        assert total == preset["duration_frames"], preset["id"]
        if preset["id"] in expected:
            assert total == expected[preset["id"]], preset["id"]


def test_the_three_documented_presets_exist():
    for preset_id in ("release-teaser", "feature-tour", "ink-press-full"):
        assert preset_by_id(preset_id) is not None
    assert preset_by_id("does-not-exist") is None


def test_sfx_and_accent_options_include_the_documented_ids():
    assert {"none", "riser", "impact", "tick"} <= sfx_ids()
    assert {"ink-amber", "neon-cyan", "mono-slate"} <= accent_ids()


def test_four_variants_and_the_master_is_one_of_them():
    ids = variant_ids()
    assert len(ids) == 4
    assert MASTER_VARIANT in ids
    assert ids[0] == MASTER_VARIANT, "master renders first (poster + frame strip)"


def test_variant_geometry_is_derived_from_the_tier():
    assert variant_geometry("master-16x9", 720) == (1280, 720)
    assert variant_geometry("vertical-9x16", 720) == (720, 1280)
    assert variant_geometry("square-1x1", 720) == (720, 720)
    assert variant_geometry("master-16x9", 1080) == (1920, 1080)
    assert variant_geometry("vertical-9x16", 1080) == (1080, 1920)


def test_every_variant_dimension_is_even_for_x264():
    for tier in (720, 1080):
        for variant in variant_ids():
            width, height = variant_geometry(variant, tier)
            assert width % 2 == 0 and height % 2 == 0, (variant, tier)


def test_only_the_loop_variant_is_muted():
    muted = [v["id"] for v in variant_defs() if v["muted"]]
    assert muted == ["loop-muted-16x9"]
    assert variant_spec("loop-muted-16x9", 720)["muted"] is True
    assert variant_spec(MASTER_VARIANT, 720)["muted"] is False


def test_tier_is_the_short_edge_of_the_master():
    assert tier_from_master(1280, 720) == 720
    assert tier_from_master(1920, 1080) == 1080


def test_library_documents_its_upstream_attribution():
    library = shot_card_library()
    assert "video-shotcraft" in library["upstream"]
    assert library["upstream_card_count"] == 104
    assert "Apache-2.0" in library["attribution"]
