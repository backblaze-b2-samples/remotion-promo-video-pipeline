import os

from pydantic_settings import BaseSettings

# Frame sizes and variant sets per RENDER_PRESET. `demo` keeps a first run to
# ~180 frames x 2 variants so a shared dev bucket is not flooded; `full` is the
# write-amplification headliner quoted in the README.
RENDER_PRESETS: dict[str, dict] = {
    "demo": {
        "width": 1280,
        "height": 720,
        "storyboard": "release-teaser",
        "variants": ["master-16x9", "vertical-9x16"],
    },
    "full": {
        "width": 1920,
        "height": 1080,
        "storyboard": "ink-press-full",
        "variants": [
            "master-16x9",
            "vertical-9x16",
            "square-1x1",
            "loop-muted-16x9",
        ],
    },
}

_CONCURRENCY_CEILING = 8


class Settings(BaseSettings):
    # --- Backblaze B2 (S3-compatible API) ---
    b2_application_key_id: str = ""
    b2_application_key: str = ""
    b2_bucket_name: str = ""
    # Region, not an endpoint: the endpoint is derived below so no region
    # literal is hardcoded anywhere in source.
    b2_region: str = ""
    # Optional escape hatch for a non-standard endpoint. Empty means "derive it
    # from b2_region".
    b2_endpoint: str = ""
    # Optional. Only used to build direct object URLs for a public bucket; the
    # app itself always reads through presigned URLs.
    b2_public_url_base: str = ""

    api_port: int = 8000
    # Interactive API docs (/docs, /redoc, /openapi.json). On by default for
    # local dev and exploration; set false to hide the full API surface in
    # production.
    enable_docs: bool = True
    # Explicit allowlist by default — covers Next on :3000 and the
    # fallback :3001 it picks if 3000 is busy. Production deploys should
    # override with the exact frontend origin.
    api_cors_origins: str = "http://localhost:3000,http://localhost:3001"
    # Optional dev-only escape hatch: a regex that matches additional
    # allowed origins. Empty by default — set this to e.g.
    # `^http://localhost:\d+$` to accept any localhost port without
    # listing each one. NEVER ship this to production.
    api_cors_origin_regex: str = ""

    # Upload limits (brand assets, audio beds, manual captures)
    max_file_size: int = 100 * 1024 * 1024  # 100MB

    # Optional confinement for key-addressed reads/deletes. Empty by default so
    # the by-key routes accept any key shape (they deliberately support nested
    # folders and reserved-word segments). Point a fork at a bucket shared with
    # other data? Set to e.g. "renders/" to restrict all key ops.
    allowed_key_prefix: str = ""

    # Rate limiting (per client IP, per 60s window). In-process per replica —
    # documented in docs/RELIABILITY.md; horizontal scaling needs a shared
    # store (e.g. Redis). Writes/downloads get the tighter cap.
    rate_limit_per_minute: int = 600
    # Covers uploads, deletes, presigns and render kicks. Generous because one
    # promo detail page presigns a URL per variant plus its poster.
    rate_limit_write_per_minute: int = 300

    # Small durable counters (downloads, etc). Point at a persistent
    # volume in production if you care about surviving restarts.
    download_count_file: str = "data/download_count.json"

    # --- Render pipeline ---
    render_preset: str = "demo"
    # 0 means "use the preset's dimension".
    render_width: int = 0
    render_height: int = 0
    render_fps: int = 30
    # "auto" (default) or an integer. Never resolves below 1.
    render_concurrency: str = "auto"
    render_variants: str = "master-16x9,vertical-9x16"
    # Remotion's `--gl` renderer. Empty = Chrome's default CPU rasterization,
    # the only path guaranteed to exist everywhere.
    remotion_gl: str = ""

    frame_upload_enabled: bool = True
    frame_upload_concurrency: int = 8

    capture_url_default: str = "http://localhost:3000"
    promo_product_default: str = "demo-product"

    ffmpeg_binary: str = ""
    node_binary: str = ""

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }

    @property
    def cors_origins(self) -> list[str]:
        # Drop empties so a trailing comma or API_CORS_ORIGINS="" doesn't yield
        # a stray "" origin.
        return [o.strip() for o in self.api_cors_origins.split(",") if o.strip()]

    @property
    def s3_endpoint(self) -> str:
        """B2's S3-compatible endpoint for the configured region.

        Derived rather than configured so no region string is ever hardcoded in
        source. `B2_ENDPOINT` overrides it for non-standard deployments.
        """
        if self.b2_endpoint:
            return self.b2_endpoint
        return f"https://s3.{self.b2_region}.backblazeb2.com"

    @property
    def preset(self) -> dict:
        return RENDER_PRESETS.get(self.render_preset, RENDER_PRESETS["demo"])

    @property
    def frame_width(self) -> int:
        return self.render_width or int(self.preset["width"])

    @property
    def frame_height(self) -> int:
        return self.render_height or int(self.preset["height"])

    @property
    def default_storyboard_preset(self) -> str:
        return str(self.preset["storyboard"])

    @property
    def default_variants(self) -> list[str]:
        """Variant ids a new promo job gets by default.

        `RENDER_VARIANTS` wins when set to a non-empty list; otherwise the
        preset decides. Order is preserved so the master renders first.
        """
        configured = [v.strip() for v in self.render_variants.split(",") if v.strip()]
        return configured or list(self.preset["variants"])

    @property
    def resolved_render_concurrency(self) -> int:
        """Remotion frame-render parallelism.

        There is no CUDA/MPS code path to pick here — the heavy work is browser
        rasterization inside headless Chrome plus an x264 encode, both CPU by
        default. The only tunable is parallelism, so it is auto-detected from
        the host rather than hardcoded, and clamped to >= 1 so it can never
        resolve to 0 (which Remotion rejects).
        """
        raw = (self.render_concurrency or "auto").strip().lower()
        if raw and raw != "auto":
            try:
                return max(1, int(raw))
            except ValueError:
                pass
        cpus = os.cpu_count() or 1
        return max(1, min(cpus // 2, _CONCURRENCY_CEILING))


settings = Settings()
