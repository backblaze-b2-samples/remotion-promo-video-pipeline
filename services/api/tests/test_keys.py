"""Key builders and — most importantly — the scoping of a promo delete."""

from app.types.keys import (
    FRAMES_ROOT,
    MANIFESTS_ROOT,
    RENDERS_ROOT,
    STORYBOARDS_ROOT,
    bgm_key,
    brand_key,
    capture_key,
    frame_key,
    frame_name,
    frame_number_from_key,
    frame_prefix,
    job_id_from_storyboard_key,
    job_prefixes,
    manifest_key,
    pass_label,
    poster_key,
    sfx_key,
    slugify,
    storyboard_key,
    variant_key,
)


def test_asset_keys_match_the_documented_layout():
    assert (
        capture_key("Demo Product", "desktop", "home")
        == "assets/demo-product/captures/desktop/home@2x.png"
    )
    assert bgm_key("demo-product", "pulse-120bpm") == (
        "assets/demo-product/audio/bgm/pulse-120bpm.wav"
    )
    assert sfx_key("demo-product", "emphasis", "impact") == (
        "assets/demo-product/audio/sfx/emphasis/impact.wav"
    )
    assert brand_key("demo-product", "logo.png") == "assets/demo-product/brand/logo.png"


def test_frame_keys_are_zero_padded_and_variant_scoped():
    key = frame_key("abc123", 2, "vertical-9x16", 7)
    assert key == "frames/abc123/pass-02/vertical-9x16/frame-000007.png"
    assert frame_prefix("abc123", 2, "vertical-9x16") in key
    assert frame_number_from_key(key) == 7
    assert frame_name(1086) == "frame-001086.png"


def test_frame_number_ignores_non_frame_keys():
    assert frame_number_from_key("renders/abc123/master-16x9.mp4") is None


def test_pass_label_is_two_digits():
    assert pass_label(1) == "pass-01"
    assert pass_label(12) == "pass-12"


def test_render_keys():
    assert variant_key("abc", "master-16x9") == "renders/abc/master-16x9.mp4"
    assert poster_key("abc", "master-16x9") == "renders/abc/master-16x9.poster.jpg"
    assert storyboard_key("abc") == "storyboards/abc.json"
    assert manifest_key("abc") == "manifests/abc.json"


def test_job_id_round_trips_through_the_storyboard_key():
    assert job_id_from_storyboard_key(storyboard_key("abc123")) == "abc123"
    assert job_id_from_storyboard_key("assets/x/brand/logo.png") is None
    assert job_id_from_storyboard_key("storyboards/.json") is None


def test_job_prefixes_are_scoped_to_one_promo():
    """The delete path walks ONLY these. Nothing bucket-wide, ever."""
    prefixes = job_prefixes("abc123")
    assert prefixes == (
        "storyboards/abc123.json",
        "frames/abc123/",
        "renders/abc123/",
        "manifests/abc123.json",
    )
    # No prefix is a bare root, so a delete can never sweep another promo or the
    # shared assets/ tree.
    for prefix in prefixes:
        assert prefix not in (STORYBOARDS_ROOT, FRAMES_ROOT, RENDERS_ROOT, MANIFESTS_ROOT)
        assert "abc123" in prefix
    assert not any(prefix.startswith("assets/") for prefix in prefixes)


def test_job_prefixes_do_not_collide_with_a_similarly_named_promo():
    mine = job_prefixes("abc")
    other = job_prefixes("abc123")
    assert mine[1] == "frames/abc/"
    # "frames/abc123/..." does not start with "frames/abc/" — the trailing slash
    # is what keeps a prefix delete from eating a sibling job.
    assert not other[1].startswith(mine[1])


def test_slugify_is_safe_and_never_empty():
    assert slugify("My Product!!") == "my-product"
    assert slugify("../../etc/passwd") == "etc-passwd"
    assert slugify("") == "item"
    assert slugify("", fallback="product") == "product"
    assert "/" not in slugify("a/b/c")
    assert len(slugify("x" * 200)) <= 64
