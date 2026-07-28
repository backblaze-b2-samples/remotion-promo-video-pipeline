// title / calm — state the promise on a flat paper-stock card. One headline,
// one sub, nothing else.
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { ShotProps } from "../lib/types";
import { CardFrame, Headline, Sub } from "./frame";

export const PaperTitleCard: React.FC<ShotProps> = ({
  copy,
  accent,
  variant,
  durationInFrames,
  fps,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  const enter = spring({ frame, fps, config: { damping: 200, mass: 0.6 } });
  const settle = interpolate(enter, [0, 1], [base * 0.05, 0]);
  const tilt = interpolate(enter, [0, 1], [-1.6, 0]);
  const exit = interpolate(
    frame,
    [durationInFrames - Math.round(fps * 0.25), durationInFrames],
    [1, 0.94],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <CardFrame accent={accent} variant={variant} background={accent.surface}>
      <div
        style={{
          transform: `translateY(${settle}px) rotate(${tilt}deg) scale(${exit})`,
          backgroundColor: accent.background,
          borderLeft: `${base * 0.012}px solid ${accent.highlight}`,
          padding: base * 0.07,
          borderRadius: base * 0.012,
        }}
      >
        <Headline accent={accent}>{copy.headline}</Headline>
        <Sub accent={accent}>{copy.sub}</Sub>
      </div>
    </CardFrame>
  );
};
