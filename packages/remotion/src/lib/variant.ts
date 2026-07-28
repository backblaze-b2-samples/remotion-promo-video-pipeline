// Variant id -> pixel geometry + safe-area insets.
//
// Read from packages/shared/src/variants.json, the SAME file the API reads
// (services/api/app/types/variants.py), so a new delivery format is added in one
// place and both sides agree on its dimensions.

import variantsDoc from "@remotion-promo-video-pipeline/shared/src/variants.json";
import type { AccentTheme } from "./types";

interface VariantDef {
  id: string;
  label: string;
  aspect_w: number;
  aspect_h: number;
  fit: string;
  muted: boolean;
  purpose: string;
}

export interface VariantGeometry {
  id: string;
  label: string;
  width: number;
  height: number;
  fit: string;
  muted: boolean;
  /** Fraction of the frame to keep clear of copy on each edge. */
  safeArea: { x: number; y: number };
}

const VARIANTS = (variantsDoc as { variants: VariantDef[] }).variants;
export const MASTER_VARIANT = "master-16x9";

/** x264 needs even dimensions; odd ones fail the encode, not the render. */
function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

export function variantIds(): string[] {
  return VARIANTS.map((v) => v.id);
}

/**
 * Geometry for `id` at `tier` (the master's short edge: 720 or 1080).
 * 16:9 at 720 -> 1280x720; 9:16 -> 720x1280; 1:1 -> 720x720.
 */
export function variantGeometry(id: string, tier: number): VariantGeometry {
  const def = VARIANTS.find((v) => v.id === id) ?? VARIANTS[0];
  const shortEdge = Math.max(2, Math.round(tier));
  const landscape = def.aspect_w >= def.aspect_h;
  const width = landscape
    ? even((shortEdge * def.aspect_w) / def.aspect_h)
    : even(shortEdge);
  const height = landscape
    ? even(shortEdge)
    : even((shortEdge * def.aspect_h) / def.aspect_w);

  // A 16:9 capture reframed to 9:16 loses its edges, so vertical and square
  // variants keep more horizontal margin clear of copy. This is the "safe area"
  // the shot cards lay text inside.
  const vertical = height > width;
  return {
    id: def.id,
    label: def.label,
    width,
    height,
    fit: def.fit,
    muted: def.muted,
    safeArea: vertical ? { x: 0.1, y: 0.16 } : { x: 0.08, y: 0.1 },
  };
}

export function tierFromMaster(width: number, height: number): number {
  return Math.min(width, height);
}

const THEMES: Record<string, AccentTheme> = {
  "ink-amber": {
    id: "ink-amber",
    background: "#141210",
    surface: "#1f1b16",
    foreground: "#f7efe4",
    muted: "#a1917c",
    highlight: "#f5b042",
  },
  "neon-cyan": {
    id: "neon-cyan",
    background: "#06161e",
    surface: "#0c2430",
    foreground: "#e6fbff",
    muted: "#79a7b5",
    highlight: "#56e2ec",
  },
  "mono-slate": {
    id: "mono-slate",
    background: "#12151b",
    surface: "#1b2028",
    foreground: "#f1f5f9",
    muted: "#94a3b8",
    highlight: "#cbd5e1",
  },
};

export function accentTheme(id: string): AccentTheme {
  return THEMES[id] ?? THEMES["ink-amber"];
}
