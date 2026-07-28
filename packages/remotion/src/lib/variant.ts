// Variant safe-area insets + accent themes, on top of the shared geometry.
//
// The aspect-ratio -> pixels derivation lives in
// `packages/shared/src/variant-geometry.ts`, read by BOTH this package and
// `apps/web` (and mirrored in `services/api/app/types/variants.py`), so a new
// delivery format is added in one place and every surface agrees on its
// dimensions. Only the rendering-specific bit — the safe area the shot cards lay
// text inside — is added here.

import {
  type VariantSizing,
  variantGeometry as sharedVariantGeometry,
} from "@remotion-promo-video-pipeline/shared/src/variant-geometry";
import type { AccentTheme } from "./types";

export {
  MASTER_VARIANT,
  tierFromMaster,
  variantIds,
} from "@remotion-promo-video-pipeline/shared/src/variant-geometry";

export interface VariantGeometry extends VariantSizing {
  /** Fraction of the frame to keep clear of copy on each edge. */
  safeArea: { x: number; y: number };
}

/**
 * Geometry for `id` at `tier` (the master's short edge: 720 or 1080), plus the
 * safe area. 16:9 at 720 -> 1280x720; 9:16 -> 720x1280; 1:1 -> 720x720.
 */
export function variantGeometry(id: string, tier: number): VariantGeometry {
  const sizing = sharedVariantGeometry(id, tier);
  // A 16:9 capture reframed to 9:16 loses its edges, so vertical and square
  // variants keep more horizontal margin clear of copy.
  const vertical = sizing.height > sizing.width;
  return {
    ...sizing,
    safeArea: vertical ? { x: 0.1, y: 0.16 } : { x: 0.08, y: 0.1 },
  };
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
