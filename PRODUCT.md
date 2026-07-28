# Product

## Register

A **developer tool that produces video** — a render pipeline with a control-panel
UI, not a consumer video editor and not a marketing site. The register is that of
an engineering console: concrete nouns (frames, passes, variants, prefixes, keys),
numbers with units and provenance, and no claim that isn't computed from a
manifest. Every screen is answerable to the question "what exactly produced this
file?". If a sentence would fit in a launch tweet, it does not belong in this
product's copy.

## Users

Product-marketing and DevRel teams who ship a promo clip for every release, and
the **coding agents** that increasingly do that work for them (video-shotcraft is
itself a Claude Code / Codex skill). Their context: a storyboard is never right the
first time, so they re-render constantly, and each release needs the same video in
four aspect ratios. They care about being able to go back — to a previous
revision, to the exact frames a shipped cut was made from, to the capture that was
current when the claim was true.

## Product Purpose

A promo-video render pipeline whose entire production trail lives in Backblaze B2:
captures, brand assets, the audio bed, every rendered PNG frame, every finished
variant, and a delivery manifest. Success = a team (or their agent) can render a
promo, revise it, re-render it, and still answer "what exactly produced this file?"
months later — while seeing, in real numbers, how much intermediate data a finished
40 MB MP4 actually costs.

The unusual claim this app makes is measured, not asserted: the dashboard's
headline stat is **write amplification**, computed from the manifests
(`frame_bytes` vs `variant_bytes`), because that ratio is the whole reason this
workload belongs on object storage rather than a laptop's `/tmp`.

## Brand Personality

Confident, precise, quietly technical. Voice is direct and specific — it quotes
1,086 frames rather than "lots of data". The interface should feel like a render
farm's control panel: calm, legible, honest about cost. It is a developer tool that
happens to produce video, not a video app that happens to have an API.

## Anti-references

- **Generic AI/SaaS slop.** No gradient text, hero-metric templates, identical
  icon-card grids, tracked uppercase eyebrows, or decorative glassmorphism.
- **Consumer video-editor chrome.** No skeuomorphic timelines, no faux-hardware
  scrubbers, no purple-to-pink "creative" gradients. The timeline here is a
  proportional strip because that is what communicates beat snapping.
- **Marketing-deck optimism about cost.** Do not hide or round away the
  intermediate byte totals; the numbers are the point.
- **Toy / prototype feel.** No missing states, no placeholder posters where real
  media exists, no "coming soon" panels.

## Design Principles

- **Show the artifact, not a placeholder.** Every list row has a real poster frame,
  every variant plays inline, and the frame strip reads actual PNGs back out of
  B2. If media exists, it is on screen.
- **Numbers with units and provenance.** Bytes are humanized, ratios carry an `x`,
  and every stat names the prefix it was computed from (`frames/`, `renders/`).
- **Cost is a first-class UI concern.** The create form tells you how many PNGs the
  next pass will write *before* you press Render.
- **Every state is designed.** Default, hover, focus, active, disabled, loading
  (skeleton), empty (teaches the interface), error (says what's wrong + retry),
  and — specific to this app — *in flight*, with a phase label and a real
  frames-rendered count.
- **Consistency is the feature.** One button vocabulary, one form-control set, one
  icon style. Finite choices are always selectors, never free text.

## Accessibility & Inclusion

Target **WCAG 2.1 AA**. Body text >= 4.5:1, large/bold text >= 3:1, visible focus
indicators on every interactive element, full keyboard navigation, correct semantic
landmarks and heading order, labelled form controls, and a `prefers-reduced-motion`
alternative for every animation. Render progress is announced via `aria-live` so a
screen-reader user is not left guessing. Full light and dark theme parity.
