<!-- last_verified: 2026-07-28 -->
# Feature: Asset Ingest

## Purpose
Get real product UI and brand material into B2 under a stable per-product prefix,
without requiring a 150 MB browser download to try the app.

## Used By
- UI: `/ingest` (capture form + asset upload), and inline during `POST /promos`
- API: `POST /captures`, `POST /upload?product=&kind=`, `POST /assets/demo-audio`
- Job: none — ingest is synchronous

## Core Functions
- `app.service.capture.capture_product` — Playwright captures with a Pillow fallback
- `app.service.capture._placeholder_png` — the drawn stand-in card
- `app.runtime.upload.resolve_folder` — `kind` -> `assets/<product>/<subfolder>/`
- `app.service.audio.ensure_sfx_pack` — synthesized SFX one-shots

## Canonical Files
- Pattern exemplar: `services/api/app/service/capture.py`
- Key builders: `services/api/app/types/keys.py` (`capture_key`, `brand_key`, `bgm_key`)
- UI: `apps/web/src/components/upload/capture-form.tsx`,
  `apps/web/src/components/upload/asset-upload-form.tsx`

## Inputs
- product: str (slugified)
- url: str (free text; safe default `http://localhost:3000` — this app's own UI)
- viewports: multi-select (`desktop` 1440x900, `tablet` 834x1112, `mobile` 390x844)
- accent: str (only used to tint a placeholder card)
- Upload path: a file plus `kind` (`brand` | `audio` | `capture`)

## Outputs
- `assets/<product>/captures/<viewport>/<name>@2x.png` — one PNG per viewport
- `assets/<product>/brand/<name>` / `audio/bgm/<name>.wav` /
  `captures/manual/<name>` for uploads
- Response reports `engine: "playwright" | "placeholder"` plus a `note` when
  degraded

## Flow
- Resolve the requested viewports (default: all three)
- Launch Playwright Chromium, `device_scale_factor=2`, `wait_until="load"` plus a
  1.2s settle (never `networkidle` — a polling dashboard never reaches it)
- Screenshot each viewport, `upload_bytes` each PNG to its capture key
- On **any** Playwright failure: log a warning, draw a placeholder card per
  viewport with Pillow, upload those instead, and set `engine: "placeholder"`

## Edge Cases
- Chromium not installed -> placeholder cards + a note naming
  `pnpm run setup:capture`; the render still succeeds
- Unreachable / slow URL -> capture times out at 20s and degrades to placeholders
- Product slug with `/` or `..` -> `slugify()` strips them; a capture can never
  escape its prefix
- Upload with no `product` -> falls back to the generic `uploads/` prefix, exactly
  like the starter kit's plain dropzone
- Re-capturing the same product+viewport overwrites the key (B2 keeps a version)

## UX States (if applicable)
- Empty: `/library` empty state points back at Ingest
- Loading: "Capturing..." on the button; per-file progress bars for uploads
- Error: toast per failure; a placeholder run renders an inline `Alert`, not an error

## Verification
- Test files: `services/api/tests/test_promo_routes.py` (capture is monkeypatched
  so the suite never launches a browser), `services/api/tests/test_keys.py`
- Required cases: capture keys match the documented layout; slugify strips traversal;
  an upload with `product` + `kind` lands under `assets/`; a missing browser
  degrades rather than raising
- Focused verify command: `cd services/api && .venv/bin/python -m pytest tests/test_keys.py -q`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` when E2E/live prerequisites apply
- Pass criteria: keys land exactly where documented, and a browser-less host still
  produces usable captures

## Related Docs
- [README.md](../../README.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [docs/app-workflows.md](../app-workflows.md)
- [asset-library.md](asset-library.md)
