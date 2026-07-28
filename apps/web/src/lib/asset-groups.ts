// How `/library` buckets one product's assets — pure, so it is unit-tested.
//
// Empty kinds are KEPT. They used to be filtered out, so a product with one brand
// file rendered exactly one card and nothing on screen said that captures, an
// audio bed or SFX existed at all, let alone how to add them: the only empty
// affordance fired when the product had no assets of ANY kind, which a
// partially-populated product never hits.

import type { AssetEntry } from "@remotion-promo-video-pipeline/shared";

export type AssetKind = AssetEntry["kind"];

export const KIND_ORDER: AssetKind[] = ["capture", "bgm", "sfx", "brand", "other"];

export const KIND_LABELS: Record<AssetKind, string> = {
  capture: "Captures",
  bgm: "Audio bed",
  sfx: "SFX one-shots",
  brand: "Brand files",
  other: "Other",
};

export const KIND_EMPTY_TITLES: Record<AssetKind, string> = {
  capture: "No captures yet",
  bgm: "No audio bed yet",
  sfx: "No SFX one-shots yet",
  brand: "No brand files yet",
  other: "Nothing else yet",
};

/** One short line per kind: how to populate THIS kind, not the product. */
export const KIND_EMPTY_HINTS: Record<AssetKind, string> = {
  capture: "Shoot the product UI from Ingest — Capture from a URL.",
  bgm: 'Press "Synthesize demo audio" above, or upload a WAV/MP3 from Ingest.',
  sfx: 'Press "Synthesize demo audio" above — it writes three beat-aligned one-shots.',
  brand: "Upload logos and brand images from Ingest — Upload an asset.",
  other: "Anything else uploaded under this product's prefix lands here.",
};

export interface AssetGroup {
  kind: AssetKind;
  label: string;
  entries: AssetEntry[];
  emptyTitle: string;
  emptyHint: string;
}

/** Every kind in `KIND_ORDER`, whether or not it has entries. */
export function groupAssetsByKind(entries: AssetEntry[] | undefined): AssetGroup[] {
  return KIND_ORDER.map((kind) => ({
    kind,
    label: KIND_LABELS[kind],
    entries: (entries ?? []).filter((entry) => entry.kind === kind),
    emptyTitle: KIND_EMPTY_TITLES[kind],
    emptyHint: KIND_EMPTY_HINTS[kind],
  }));
}

/**
 * True only when the product has nothing at all — the one case that still gets
 * the whole-product empty state instead of five per-kind ones.
 */
export function isProductEmpty(groups: AssetGroup[]): boolean {
  return groups.every((group) => group.entries.length === 0);
}
