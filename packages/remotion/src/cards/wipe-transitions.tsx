// transition / medium — wipe from one colour field to the next to change subject
// without a jarring jump cut. Wipe direction matches the reading direction.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { ShotProps } from "../lib/types";
import { CardFrame, Headline, Sub } from "./frame";

export const WipeTransitions: React.FC<ShotProps> = ({
  copy,
  accent,
  variant,
  durationInFrames,
  fps,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  // A wipe slower than ~0.5s reads as a loading screen, so it is capped.
  const wipeFrames = Math.min(Math.round(fps * 0.5), Math.round(durationInFrames * 0.45));
  const wipe = interpolate(frame, [0, wipeFrames], [0, 100], {
    extrapolateRight: "clamp",
  });
  const reveal = interpolate(frame, [wipeFrames * 0.6, wipeFrames * 1.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <CardFrame accent={accent} variant={variant} background={accent.surface}>
      <AbsoluteFill
        style={{
          backgroundColor: accent.highlight,
          clipPath: `polygon(0 0, ${wipe}% 0, ${Math.max(0, wipe - 8)}% 100%, 0 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          padding: base * 0.09,
          opacity: reveal,
          transform: `translateX(${interpolate(reveal, [0, 1], [base * 0.05, 0])}px)`,
        }}
      >
        <Headline accent={accent}>{copy.headline}</Headline>
        <Sub accent={accent}>{copy.sub}</Sub>
      </AbsoluteFill>
    </CardFrame>
  );
};
