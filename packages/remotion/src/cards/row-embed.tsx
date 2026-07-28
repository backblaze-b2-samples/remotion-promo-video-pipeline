// embed / medium — embed the real captured UI in a device row so the claim is
// evidenced by the product itself.
import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { ShotProps } from "../lib/types";
import { CaptureImage, CardFrame, Headline, Sub } from "./frame";

export const RowEmbed: React.FC<ShotProps> = ({
  copy,
  capture,
  accent,
  variant,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  const drift = interpolate(frame, [0, durationInFrames], [base * 0.04, -base * 0.04]);
  const rise = interpolate(frame, [0, durationInFrames * 0.35], [base * 0.08, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <CardFrame accent={accent} variant={variant}>
      <Headline accent={accent} scale={0.72}>
        {copy.headline}
      </Headline>
      <div
        style={{
          display: "flex",
          gap: base * 0.025,
          marginTop: base * 0.04,
          transform: `translateX(${drift}px) translateY(${rise}px)`,
        }}
      >
        {[0, 1].map((slot) => (
          <div
            key={slot}
            style={{
              width: slot === 0 ? "68%" : "40%",
              aspectRatio: "16 / 10",
              borderRadius: base * 0.016,
              overflow: "hidden",
              border: `${base * 0.004}px solid ${accent.muted}`,
              boxShadow: `0 ${base * 0.02}px ${base * 0.05}px rgba(0,0,0,0.45)`,
              opacity: slot === 0 ? 1 : 0.72,
              flexShrink: 0,
            }}
          >
            <CaptureImage src={capture} accent={accent} fit="cover" />
          </div>
        ))}
      </div>
      <Sub accent={accent}>{copy.sub}</Sub>
    </CardFrame>
  );
};
