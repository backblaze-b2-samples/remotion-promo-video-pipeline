<!-- last_verified: 2026-07-28 -->
# Licensing

This sample has **three licence layers**, and one of them is not open source.
Stating that up front is deliberate: it is a real constraint, not a footnote to
discover after you have built on it.

## 1. Our code — the repository licence

Everything written for this sample — the FastAPI service, the Next.js app, the
shot-card components, the shared JSON, the scripts — is covered by
[LICENSE](../LICENSE) at the repo root.

## 2. Remotion — source-available, **not** open source

**Remotion is not OSS.** It is source-available under the
**[Remotion License](https://remotion.dev/license)**:

- **Free** for individuals and for companies with **up to three employees**.
- **A paid company licence is required for organisations with four or more
  employees.**

This applies to `remotion`, `@remotion/bundler` and `@remotion/renderer`, all three
of which are direct dependencies of `packages/remotion` — Remotion *is* the thing
this sample demonstrates, so there is no way to avoid the term. Check the current
terms and pricing at [remotion.dev/license](https://remotion.dev/license) before
using this pipeline inside a company of four or more people.

Practical consequences:

- Cloning, reading and running this repo for evaluation is fine.
- Shipping it (or a derivative) as part of a product at a company of >= 4 employees
  needs a Remotion company licence, independent of this repo's own licence.
- Swapping Remotion out is a rewrite of `packages/remotion/`, not a config change:
  the composition, the 10 shot cards and `render-frames.mjs` are all Remotion APIs.
  The rest of the pipeline (B2 layout, resume, encode, manifest, amplification
  accounting) is renderer-agnostic and would survive such a swap.

## 3. Shot-card recipes and ids — video-shotcraft (Apache-2.0)

The card **ids, categories, energy levels, default durations and recipe intent**
are derived from [video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft),
which is Apache-2.0 licensed. This sample implements **10 of its 104 cards** — one
from each category — and the attribution is carried in the data itself, in
`packages/shared/src/shot-cards.json`:

```json
"attribution": "Card ids, categories and recipe intent are derived from the
video-shotcraft shot-card taxonomy (Apache-2.0). See docs/LICENSING.md.",
"upstream": "https://github.com/Vincentwei1021/video-shotcraft"
```

The **implementations** (the TSX in `packages/remotion/src/cards/`) are ours; only
the taxonomy and the intent behind each card are upstream's.

## Audio: synthesized, never vendored

Upstream video-shotcraft bundles Mixkit BGM and SFX. This sample **references those
but vendors nothing**. Instead, `services/api/app/service/audio.py` synthesizes:

- a click-and-pad **audio bed** at the job's BPM, so the transients land exactly on
  the beat grid the storyboard was snapped to, and
- three **SFX one-shots** (`riser`, `impact`, `tick`),

as 16-bit PCM WAV using only the Python standard library (`wave` + `math`). Three
consequences:

1. **No third-party audio licence applies** — nothing was downloaded or copied.
2. **No binary asset is committed.** The bed is generated on demand and uploaded to
   `assets/<product>/audio/`; run `pnpm run make-demo-assets` to create it
   explicitly, or just render a promo (the render creates it if absent).
3. **No encoder dependency** for audio. PCM WAV needs no codec, so this path works
   even before ffmpeg has been resolved.

If you replace the bed with licensed music, upload it to
`assets/<product>/audio/bgm/` (Ingest → Audio bed) — the renderer prefers whatever
is already in that prefix — and record its licence here.

## Everything else

| Component | Licence |
|---|---|
| Next.js, React, Tailwind, shadcn/ui, TanStack Query, Recharts | MIT (per package) |
| FastAPI, Pydantic, boto3, Pillow, Playwright | MIT / BSD / Apache-2.0 (per package) |
| ffmpeg via `imageio-ffmpeg` | ffmpeg is LGPL/GPL depending on build; the bundled build ships with `imageio-ffmpeg` (BSD-2-Clause wrapper). Check the ffmpeg build's own terms before redistributing binaries. |
| Chrome Headless Shell (downloaded by Remotion at render time) | Google's Chrome terms; downloaded at runtime, never vendored here |
| Backblaze B2 | a service, not a dependency — usage is governed by your B2 account terms |
