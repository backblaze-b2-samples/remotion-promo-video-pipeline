// Variant id -> pixel geometry, derived from `variants.json`.
//
// `variants.json` is the one source of truth for variant geometry (AGENTS.md
// §4), but it stores ASPECT RATIOS, not pixels: a variant's real size only
// exists once you know the render tier (the master frame's short edge, 720 or
// 1080). That derivation used to live in three places — `types/variants.py` on
// the API, `packages/remotion/src/lib/variant.ts` for the renderer, and nowhere
// at all in the web app, which simply displayed whatever tier the SERVER default
// happened to be. Picking 1920x1080 on the create form therefore labelled every
// variant 720p while the pass delivered 1080p.
//
// This module is the single TypeScript derivation, imported by BOTH
// `packages/remotion` and `apps/web`; `services/api/app/types/variants.py` is
// its Python mirror.

import variantsDoc from "./variants.json";

export interface VariantDef {
  id: string;
  label: string;
  aspect_w: number;
  aspect_h: number;
  fit: string;
  muted: boolean;
  /** The backend always adds this variant; the forms show it as locked-on. */
  required?: boolean;
  purpose: string;
}

/** One variant's real pixel size at a given tier, plus its static metadata. */
export interface VariantSizing {
  id: string;
  label: string;
  width: number;
  height: number;
  fit: string;
  muted: boolean;
  required: boolean;
  purpose: string;
}

export const VARIANT_DEFS: VariantDef[] = (
  variantsDoc as { variants: VariantDef[] }
).variants;

export const MASTER_VARIANT = "master-16x9";

/** x264 needs even dimensions; odd ones fail the encode, not the render. */
function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

export function variantIds(): string[] {
  return VARIANT_DEFS.map((variant) => variant.id);
}

export function variantDef(id: string): VariantDef | undefined {
  return VARIANT_DEFS.find((variant) => variant.id === id);
}

/** The render tier implied by a master frame size (its short edge). */
export function tierFromMaster(width: number, height: number): number {
  return Math.min(width, height);
}

/**
 * Pixel size for `id` at `tier` (the master's short edge).
 * 16:9 at tier 720 -> 1280x720; 9:16 -> 720x1280; 1:1 -> 720x720.
 *
 * Unknown ids fall back to the first definition rather than throwing: this runs
 * inside render loops and form labels, where a hard failure would be worse than
 * the master's geometry.
 */
export function variantGeometry(id: string, tier: number): VariantSizing {
  const def = variantDef(id) ?? VARIANT_DEFS[0];
  const shortEdge = Math.max(2, Math.round(tier));
  const landscape = def.aspect_w >= def.aspect_h;
  return {
    id: def.id,
    label: def.label,
    width: landscape ? even((shortEdge * def.aspect_w) / def.aspect_h) : even(shortEdge),
    height: landscape
      ? even(shortEdge)
      : even((shortEdge * def.aspect_h) / def.aspect_w),
    fit: def.fit,
    muted: def.muted,
    required: Boolean(def.required),
    purpose: def.purpose,
  };
}
