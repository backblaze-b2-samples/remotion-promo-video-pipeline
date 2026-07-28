// outro / calm — morph the product surface into the brand lockup so the last
// frame is the thing you want remembered. Holds >= 0.5s after it settles, and
// still reads with no audio (the muted loop variant depends on that).
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { ShotProps } from "../lib/types";
import { CaptureImage, CardFrame, Headline, Sub } from "./frame";

export const UiToBrandMorph: React.FC<ShotProps> = ({
  copy,
  capture,
  accent,
  variant,
  durationInFrames,
  fps,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  const hold = Math.max(Math.round(fps * 0.5), Math.round(durationInFrames * 0.3));
  const morphEnd = Math.max(1, durationInFrames - hold);
  const progress = interpolate(frame, [0, morphEnd], [0, 1], {
    extrapolateRight: "clamp",
  });
  const eased = 1 - Math.pow(1 - progress, 2);

  return (
    <CardFrame accent={accent} variant={variant}>
      <AbsoluteFill
        style={{
          opacity: 1 - eased,
          transform: `scale(${interpolate(eased, [0, 1], [1, 0.82])})`,
          filter: `blur(${interpolate(eased, [0, 1], [0, base * 0.012])}px)`,
        }}
      >
        <CaptureImage src={capture} accent={accent} />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          opacity: eased,
        }}
      >
        <div
          style={{
            width: base * 0.2,
            height: base * 0.2,
            borderRadius: base * 0.05,
            backgroundColor: accent.highlight,
            color: accent.background,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: base * 0.09,
            fontWeight: 800,
            transform: `scale(${interpolate(eased, [0, 1], [0.6, 1])})`,
          }}
        >
          B2
        </div>
        <div style={{ marginTop: base * 0.04, textAlign: "center" }}>
          <Headline accent={accent} scale={0.72}>
            {copy.headline}
          </Headline>
          <Sub accent={accent}>{copy.sub}</Sub>
        </div>
      </AbsoluteFill>
    </CardFrame>
  );
};
