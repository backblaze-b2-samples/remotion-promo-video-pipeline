// hero / high energy — open on the product surface with a travelling spotlight
// so the eye lands on the UI before any copy appears.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { ShotProps } from "../lib/types";
import { CaptureImage, CardFrame, Headline, Sub } from "./frame";

export const SpotlightHeroCard: React.FC<ShotProps> = ({
  copy,
  capture,
  accent,
  variant,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateRight: "clamp",
  });
  // Spotlight travels left -> right; radius stays >= 35% of the frame so it
  // reads as a highlight rather than a vignette bug.
  const x = interpolate(progress, [0, 1], [22, 78]);
  const copyOpacity = interpolate(frame, [0, durationInFrames * 0.3], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <CardFrame accent={accent} variant={variant}>
      <AbsoluteFill>
        <CaptureImage src={capture} accent={accent} />
        <AbsoluteFill
          style={{
            background:
              `radial-gradient(circle at ${x}% 42%, rgba(0,0,0,0) 24%, rgba(0,0,0,0.35) 46%, rgba(0,0,0,0.78) 88%)`,
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          padding: base * 0.09,
          opacity: copyOpacity,
        }}
      >
        <Headline accent={accent}>{copy.headline}</Headline>
        <Sub accent={accent}>{copy.sub}</Sub>
      </AbsoluteFill>
    </CardFrame>
  );
};
