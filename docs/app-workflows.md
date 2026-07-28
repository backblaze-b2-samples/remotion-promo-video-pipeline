<!-- last_verified: 2026-07-28 -->
# App Workflows

User journeys inside the application. The pipeline in one line:

**ingest -> storyboard -> render -> encode -> variants -> manifest**

## Ingest assets

- User navigates to `/ingest`
- **Capture from a URL**: enters a product slug and a page URL (safe default
  `http://localhost:3000`, this app's own UI), ticks viewports (desktop / tablet /
  mobile), presses **Capture now**
- Playwright Chromium screenshots each viewport at `device_scale_factor=2`; each
  PNG is written to `assets/<product>/captures/<viewport>/product@2x.png`
- With no Chromium installed the response reports `engine: "placeholder"` and an
  inline alert explains `pnpm run setup:capture` — the pipeline still works
- While that request is open the panel shows the same in-flight treatment as the
  create form: spinner, stage breakdown, determinate bar, live elapsed clock. A new
  attempt clears the previous one's failure notice first, so a corrected URL is
  never accused mid-retry
- On success the panel shows a **thumbnail of the frame that landed**, its keys, and
  the two ways onward — **New promo** and **Open in Library**. Only the `desktop`
  capture is wired into a promo's shots; tablet and mobile are reusable Library
  material, and the form says so rather than charging ~20s a viewport in silence
- **Every way onward carries the product**: those buttons and the page's own
  "Library" / "create a promo" links all append `?product=<slug>`, so the create
  form opens pre-filled with the product just ingested instead of re-seeding
  `demo-product` and rendering a promo without the user's assets
- **Upload an asset**: picks a kind (brand file / audio bed / manual capture) and
  drops files; each is filed under `assets/<product>/<kind>/` rather than a generic
  `uploads/` folder, so it appears in the scoped Library
- See: [Asset Ingest](features/asset-ingest.md)

## Author a storyboard

- User navigates to `/promos` → **New promo**, or follows an onward link from
  `/ingest`, which pre-fills the product field via `?product=<slug>`
- Free text only where it genuinely is: product slug, video title, capture URL.
  Everything finite is a selector: preset, BPM, resolution, variants (checkboxes),
  viewports (checkboxes), accent (radio group)
- Every field opens **pre-filled with the server's safe default**, explained in its
  field description — there is still **no autofill button**. The first submit is a
  working render, not a validation failure
- `Master 16:9` is checked and disabled with an "always included" label: the
  backend renders it whether or not it is ticked, and the PNG estimate counts it
- The variants field states how many PNGs the next pass will write, before anything
  is rendered — and that number now matches what the pass actually writes
- Each variant's pixel size follows the **selected** master resolution: pick
  1920x1080 and the four labels read 1920x1080 / 1080x1920 / 1080x1080 /
  1920x1080 · muted, matching the badges `/promos/[id]` will show afterwards
- On submit: captures run inline, the preset expands into shots, boundaries snap to
  the BPM beat grid, and `storyboards/<job-id>.json` is written at revision 1. While
  that request is open the form shows a spinner, the stage breakdown and an elapsed
  counter — the wait is ~9s, or up to 20s per viewport for an unreachable URL
- If the capture degraded to placeholder cards, the toast is a **warning** naming
  the actual cause, and `/promos/[id]` carries a banner until a real capture
  replaces them. A capture never fails the create, so this is the only thing that
  distinguishes a promo of the product UI from a promo of a synthetic card
- User lands on `/promos/[id]`
- See: [Storyboard Authoring](features/storyboard-authoring.md)

## Render a pass

- From the promo list row action (icon + tooltip), the labelled **Render** button in
  the detail header, or either empty panel's own **Render** action, user starts a pass
- The API returns 202 immediately with the pass number; the pass runs in a single
  background worker
- The detail page polls progress every 1.5s and shows the phase in plain language:
  scanning B2 for frames already rendered → rendering frames in headless Chrome →
  uploading frames to B2 → muxing frames + audio with ffmpeg → uploading the
  variant + poster
- The bar is weighted across every leg of every variant, so it never sits full while
  work remains, and the counter tracks uploads during the upload leg
- While a pass is in flight the status badge reads **Rendering** on the detail page
  AND in the `/promos` row, the render control is disabled with a "Render in flight"
  tooltip, and the list refetches every 5s
- A promo that has never been rendered reads **Not started**, not "Queued"
- Frames upload as they are produced, so `frames/<job-id>/pass-NN/<variant>/` fills
  during the render
- Pressing Render while a pass is in flight returns 409 and a toast says so
- On completion the message reports the pass's frame count and amplification ratio,
  and the page re-fetches: variants, poster, manifest, frame strip
- If a render fails, the phase becomes **Failed** with the error text inline (the
  full traceback is in the API log)
- See: [Frame Rendering](features/frame-rendering.md),
  [Encode & Variants](features/encode-and-variants.md)

## Review a promo

- `/promos` is usually the first click. `GET /promos` needs one storyboard **and**
  one manifest per row, which it now fetches in a single concurrent batch: walking
  them serially was two blocking B2 GETs per promo (~7s for 17 promos), so the
  list was nothing but skeletons on every visit. While it loads, the table says what
  it is reading; once loaded it states the promo count
- User navigates to `/promos/[id]`
- A stale or deleted id renders "No such promo" with **All promos** / **New promo**
  rather than a Retry that can only fail again; a transient fetch failure still gets
  Retry. The breadcrumb links every real ancestor, so `Promos` is one click away
- Each delivered variant plays inline in a `<video>` with its poster, served by a
  presigned B2 URL (the API never proxies video bytes)
- The storyboard panel shows a proportional timeline strip plus a per-shot list
  with card id, beat-snapped frame range, SFX and whether a capture is attached
- The manifest panel lists every pass newest-first: revision, timestamp, ratio and a
  per-variant table of dimensions, frame counts, frame bytes and MP4 bytes
- A frame strip shows six evenly spaced PNGs read back out of
  `frames/<job-id>/pass-NN/master-16x9/` — visible proof the intermediates really
  are on B2
- See: [Delivery Manifest](features/delivery-manifest.md)

## Revise and re-render

- User opens **Edit storyboard** (`/promos/[id]/edit`), pre-filled from the stored
  storyboard with no default hints
- Swaps a shot card via a `Select`, retimes a shot, rewrites copy, picks an SFX,
  reorders with the up/down actions, adds or removes a shot
- A chosen SFX is mixed into the next pass's audio track at that shot's
  beat-snapped offset — the control produces a real, audible change in the
  delivered MP4
- The header states the running total: shots, frames, duration, and how many PNGs
  the next pass will write across the selected variants
- Save re-snaps every boundary to the beat grid and bumps `revision`
- The next render becomes `pass-<NN+1>` under a fresh frame prefix — **that is the
  write-amplification loop, made explicit**

## Delete a promo

- Row action or the detail page, then a confirmation `AlertDialog`
- The dialog names the four prefixes that will be purged
  (`storyboards/<id>.json`, `frames/<id>/`, `renders/<id>/`,
  `manifests/<id>.json`) and states that shared `assets/` and other promos are
  untouched
- On confirm the API reports how many objects were removed

## Browse assets

- `/library` — scoped to `assets/<product>/`: capture thumbnails, inline `<audio>`
  players for the bed and SFX, brand files, and a button that synthesizes the demo
  audio if none exists yet. A product selector switches prefix, and
  `/library?product=<slug>` (how `/ingest` links here) opens already scoped to it.
- Every asset kind is listed even when it is empty — "0 objects" plus the one action
  that fills it. A product with only a brand file used to render a single card and
  blank space, so nothing on screen said captures or an audio bed were missing.
- Both loading states say which B2 keys are being listed, like `/promos` does: the
  product list is derived from `assets/` + `storyboards/` and the scoped
  `assets/<product>/` fetch cannot start until it lands, so the page sat in
  unlabelled skeletons for seconds.
- `/files` — the untouched **whole-bucket** explorer: tree view, preview, download,
  delete. Deliberately a different scope from Library. It lists the newest objects
  first, states "Showing N of M objects in the bucket", and takes a key prefix so
  the tree can reach `frames/<job-id>/pass-NN/<variant>/` — an unscoped page can
  never hold a busy bucket, and silently showing its newest slice contradicted the
  dashboard's own counts. During the ~9s scan the counts are a skeleton plus
  "Counting objects in the bucket...", never a settled-looking "0 of 0".
- See: [Asset Library](features/asset-library.md),
  [File Browser](features/file-browser.md)

## Read the dashboard

- User navigates to `/` (home)
- Four stat cards, amplification first: **write amplification** (intermediate bytes
  per delivered byte), frames archived, delivered video, render passes
- A bar chart compares frame bytes vs variant bytes for the last 8 passes
- A recent-renders table links into each promo with its revision, pass count and ratio
- The empty state points at **New promo** rather than showing zeros as if they were data
- See: [Amplification Dashboard](features/dashboard.md)

## Browse the shot-card library

- `/shot-cards` lists the 10 implemented cards, filterable by category
- Each card shows its id, category, energy, default duration, purpose and the
  specific pitfalls that make it read wrong (too-tight spotlight, off-beat cut,
  four-digit odometer mush)
- A note links upstream to video-shotcraft for the full 104-card taxonomy
