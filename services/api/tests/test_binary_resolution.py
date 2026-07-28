"""ffmpeg / node resolution must fail with an ACTIONABLE message, not a stack trace.

"ffmpeg not found" with no remedy is the single most common way a render pipeline
wastes an evening, so the error text is part of the contract and is asserted.
"""

import pytest

from app.service import encode, render_engine
from app.service.encode import BinaryMissingError


@pytest.fixture(autouse=True)
def clear_resolution_caches():
    encode.resolve_ffmpeg.cache_clear()
    render_engine.resolve_node.cache_clear()
    yield
    encode.resolve_ffmpeg.cache_clear()
    render_engine.resolve_node.cache_clear()


def test_bundled_ffmpeg_is_found_by_default():
    """imageio-ffmpeg is a declared requirement, so a fresh clone can encode."""
    resolved = encode.resolve_ffmpeg()
    assert resolved
    assert "ffmpeg" in resolved.lower()


def test_explicit_ffmpeg_override_that_does_not_exist_is_actionable(monkeypatch):
    monkeypatch.setattr(encode.settings, "ffmpeg_binary", "/nope/ffmpeg")
    with pytest.raises(BinaryMissingError) as excinfo:
        encode.resolve_ffmpeg()
    message = str(excinfo.value)
    assert "FFMPEG_BINARY" in message
    assert "imageio-ffmpeg" in message


def test_missing_ffmpeg_everywhere_names_all_three_options(monkeypatch):
    monkeypatch.setattr(encode.settings, "ffmpeg_binary", "")
    monkeypatch.setattr(
        encode, "shutil", type("S", (), {"which": staticmethod(lambda _: None)})
    )
    # Simulate the bundled wheel being unavailable too.
    import builtins

    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "imageio_ffmpeg":
            raise ImportError("not installed")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)

    with pytest.raises(BinaryMissingError) as excinfo:
        encode.resolve_ffmpeg()
    message = str(excinfo.value)
    assert "FFMPEG_BINARY" in message
    assert "imageio-ffmpeg" in message
    assert "PATH" in message


def test_node_is_resolved_from_path():
    assert render_engine.resolve_node()


def test_explicit_node_override_that_does_not_exist_is_actionable(monkeypatch):
    monkeypatch.setattr(render_engine.settings, "node_binary", "/nope/node")
    with pytest.raises(BinaryMissingError) as excinfo:
        render_engine.resolve_node()
    assert "NODE_BINARY" in str(excinfo.value)


def test_missing_node_explains_why_remotion_needs_it(monkeypatch):
    monkeypatch.setattr(render_engine.settings, "node_binary", "")
    monkeypatch.setattr(
        render_engine, "shutil", type("S", (), {"which": staticmethod(lambda _: None)})
    )
    with pytest.raises(BinaryMissingError) as excinfo:
        render_engine.resolve_node()
    message = str(excinfo.value)
    assert "Node.js" in message
    assert "Remotion" in message


def test_render_cli_is_present_in_the_repo():
    """The Node entrypoint ships with the repo — a clone can render immediately."""
    assert render_engine.ensure_render_cli().exists()


def test_missing_render_cli_points_at_the_package(monkeypatch, tmp_path):
    monkeypatch.setattr(render_engine, "RENDER_CLI", tmp_path / "render-frames.mjs")
    with pytest.raises(BinaryMissingError) as excinfo:
        render_engine.ensure_render_cli()
    assert "packages/remotion" in str(excinfo.value)


def test_poster_frame_is_never_the_black_first_frame():
    assert encode.poster_frame_number(180) == 36
    assert encode.poster_frame_number(1) == 0
    assert encode.poster_frame_number(2) == 1
