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
- Shared product state + the page's intro copy and its onward links:
  `apps/web/src/components/upload/ingest-panels.tsx` (`/ingest`'s page component is
  a thin shell — the header lives with the state its links depend on)
- `?product=` link building: `apps/web/src/lib/product-slug.ts` (`productQuery`)

## Inputs
- product: str (slugified)
- url: str (free text; safe default `http://localhost:3000` — this app's own UI)
- viewports: multi-select (`desktop` 1440x900, `tablet` 834x1112, `mobile` 390x844)
- accent: str (only used to tint a placeholder card)
- Upload path: a file plus `kind` (`brand` | `audio` | `capture`)

## Outputs
- `assets/<product>/captures/<viewport>/<name>@2x.png` — one PNG per viewport
- `assets/<product>/brand/<name>` / `audio/bgm/<name>` (WAV or MP3, under its own
  filename) / `captures/manual/<name>` for uploads
- Response reports `engine: "playwright" | "placeholder"` plus a `note` when
  degraded

## Flow
- Resolve the requested viewports (default: all three)
- Launch Playwright Chromium, `device_scale_factor=2`, `wait_until="load"`, then a
  **bounded settle** so the shot is not of a half-loaded app: "no
  `[data-slot="skeleton"]` attached" (8s cap — the precise content-ready signal for
  a shadcn/ui app, so it goes first), then `networkidle` (3s cap — a mop-up for
  late images, deliberately shorter because a polling page never reaches idle),
  then 600ms for fonts and entrance animations. Every step swallows its own
  timeout — a page that
  polls forever is still captured. `load` + a flat 1.2s was shorter than the
  target page's own TanStack queries, so the marquee capture the hero/zoom/outro
  shots composite showed grey skeleton blocks where the stat values, chart and
  table rows belong
- Screenshot each viewport, `upload_bytes` each PNG to its capture key
- On **any** capture failure: log a warning, draw a placeholder card per viewport
  with Pillow, upload those instead, and set `engine: "placeholder"`. The two
  causes are distinguished structurally, not by string-sniffing:
  `BrowserUnavailableError` (import or `chromium.launch()` failed) keeps the
  `setup:capture` note; `CaptureFailedError` (the page did not load) gets a note
  naming the URL and the reason instead. Blaming a missing Chromium for an
  unreachable URL sent people to run an install that could never fix it
- `POST /promos` records `engine` and `note` on the storyboard
  (`capture_engine` / `capture_note`), so a promo built from placeholder cards
  says so on its detail page and in the create toast — not only in the response to
  the one request that made it
- **A finished capture chains onward.** `/ingest` is the nav entry that most
  literally matches "capture the product UI", so completing one there used to end
  the journey: the only new thing on screen was a grey monospace key. The result
  panel now shows a real thumbnail of the frame that landed (via
  `/files-by-key/preview`), names the product, and carries **New promo** and
  **Open in Library** actions; the page copy links the Library rather than only
  naming it
- **Every onward link carries the product.** The intro copy's *Library* /
  *create a promo* links and the result panel's *New promo* / *Open in Library*
  buttons all append `?product=<slug>` (`productQuery`). They used to be bare
  `/library` and `/promos/new` hrefs, so the create form re-seeded
  `PROMO_PRODUCT_DEFAULT` and the promo was built against a different prefix than
  the assets just ingested — the user's material silently did not appear in their
  video. Because those links need the product currently in the capture panel, the
  page header is rendered by `IngestPanels` (the client component holding that
  state) rather than by the server page
- **Only the desktop capture reaches a promo.** `service/promos.build_shots`
  assigns `capture_keys["desktop"]` (falling back to the first available viewport)
  to **every** shot, and the render payload is written once per pass, so tablet and
  mobile PNGs are reusable Library material — no shot and no variant references
  them. Both forms say so instead of charging a silent ~20s per extra viewport

## Edge Cases
- Chromium not installed -> placeholder cards + a note naming
  `pnpm run setup:capture`; the render still succeeds
- Unreachable / slow URL -> capture times out at 20s and degrades to placeholders
- Product slug with `/` or `..` -> `slugify()` strips them; a capture can never
  escape its prefix
- Upload with no `product` -> falls back to the generic `uploads/` prefix, exactly
  like the starter kit's plain dropzone
- Re-capturing the same product+viewport overwrites the key (B2 keeps a version)
- An uploaded **audio bed** keeps its own filename and is picked up from the prefix
  by the renderer in preference to the synthesized `pulse-<bpm>bpm.wav` — see
  [encode-and-variants.md](encode-and-variants.md) for the length rule that applies

## UX States (if applicable)
- Empty: `/library` empty state points back at Ingest
- In flight on capture: the shared `InFlightState` primitive
  (`components/ui/in-flight-state.tsx`) — spinner, stage breakdown, a determinate
  bar against the known 20s-per-viewport budget, and a live elapsed clock. Shared
  with `/promos/new` on purpose: the *same* blocking capture used to get a full
  breakdown there and a bare button spinner here, so an identical 10.9s operation
  looked hung on one surface and healthy on the other
- Retrying after a failure: the previous attempt's result is cleared **before** the
  next request starts. A failed capture returns `200` with a note naming the URL
  that failed, so leaving it up meant a retry showed "Capturing..." *and* "could
  not capture &lt;old URL&gt;" together, accusing a URL already corrected in the field
- Loaded: thumbnail + capture keys + **New promo** / **Open in Library**, both
  scoped to the product that was just captured
- Error: toast per failure; a placeholder run renders an inline `Alert`, not an error

## Verification
- Test files: `services/api/tests/test_promo_routes.py` (capture is monkeypatched
  so the suite never launches a browser), `services/api/tests/test_keys.py`,
  `apps/web/src/lib/product-slug.test.ts` (what the onward links carry)
- Required cases: capture keys match the documented layout; slugify strips traversal;
  an upload with `product` + `kind` lands under `assets/`; a missing browser
  degrades rather than raising; an onward link carries a well-formed product and
  carries nothing for a malformed one
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
