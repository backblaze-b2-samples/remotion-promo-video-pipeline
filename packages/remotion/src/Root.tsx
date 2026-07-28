// ONE composition serves all four delivery variants.
//
// `calculateMetadata` reads the incoming `inputProps` and returns the frame
// size, fps and duration for this render — so `vertical-9x16` is a genuine
// re-render at 720x1280, not a crop of the master. That is the whole reason the
// intermediate frame volume multiplies per variant.

import React from "react";
import { Composition } from "remotion";

import { Promo } from "./Promo";
import type { PromoProps, RenderStoryboard } from "./lib/types";
import { MASTER_VARIANT, tierFromMaster, variantGeometry } from "./lib/variant";

/** Used by `remotion studio` and by `selectComposition` before inputProps land. */
const FALLBACK_STORYBOARD: RenderStoryboard = {
  job_id: "preview",
  product: "demo-product",
  title: "Ship faster with demo-product",
  fps: 30,
  bpm: 120,
  width: 1280,
  height: 720,
  accent: "ink-amber",
  duration_frames: 90,
  shots: [
    {
      card: "spotlight-hero-card",
      from: 0,
      duration_frames: 30,
      headline: "Ship faster with demo-product",
      sub: "demo-product",
      sfx: "none",
      capture_url: null,
    },
    {
      card: "typewriter-moves",
      from: 30,
      duration_frames: 30,
      headline: "Every frame archived",
      sub: "frames/, renders/, manifests/",
      sfx: "none",
      capture_url: null,
    },
    {
      card: "ui-to-brand-morph",
      from: 60,
      duration_frames: 30,
      headline: "Ship faster with demo-product",
      sub: "backblaze.com",
      sfx: "none",
      capture_url: null,
    },
  ],
};

export const Root: React.FC = () => {
  return (
    <Composition
      id="Promo"
      component={Promo}
      durationInFrames={FALLBACK_STORYBOARD.duration_frames}
      fps={FALLBACK_STORYBOARD.fps}
      width={FALLBACK_STORYBOARD.width}
      height={FALLBACK_STORYBOARD.height}
      defaultProps={
        {
          storyboard: FALLBACK_STORYBOARD,
          variant: MASTER_VARIANT,
        } satisfies PromoProps
      }
      calculateMetadata={({ props }) => {
        const storyboard = props.storyboard ?? FALLBACK_STORYBOARD;
        const geometry = variantGeometry(
          props.variant ?? MASTER_VARIANT,
          tierFromMaster(storyboard.width, storyboard.height),
        );
        const total =
          storyboard.shots.reduce((sum, shot) => sum + shot.duration_frames, 0) ||
          storyboard.duration_frames;
        return {
          durationInFrames: Math.max(1, total),
          fps: storyboard.fps,
          width: geometry.width,
          height: geometry.height,
        };
      }}
    />
  );
};
