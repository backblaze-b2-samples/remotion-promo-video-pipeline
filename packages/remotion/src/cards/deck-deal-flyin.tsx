// layout / high energy — deal three feature cards in like playing cards to show
// breadth without a wall of text. Staggered on purpose: simultaneous arrival
// reads as one blurry object.
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { ShotProps } from "../lib/types";
import { CardFrame, Headline, Sub } from "./frame";

export const DeckDealFlyin: React.FC<ShotProps> = ({
  copy,
  accent,
  variant,
  durationInFrames,
  fps,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  const vertical = height > width;
  // Three is the ceiling: a fourth clips off-frame at 9:16.
  const items = copy.sub.split("/").map((part) => part.trim()).filter(Boolean).slice(0, 3);
  const cards = items.length > 0 ? items : ["Capture", "Render", "Deliver"];
  const headlineOpacity = interpolate(frame, [0, fps * 0.3], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <CardFrame accent={accent} variant={variant}>
      <Headline accent={accent} scale={0.8} style={{ opacity: headlineOpacity }}>
        {copy.headline}
      </Headline>
      <div
        style={{
          display: "flex",
          flexDirection: vertical ? "column" : "row",
          gap: base * 0.03,
          marginTop: base * 0.05,
        }}
      >
        {cards.map((label, index) => {
          const delay = Math.round((durationInFrames / (cards.length + 2)) * index);
          const enter = spring({
            frame: frame - delay,
            fps,
            config: { damping: 14, mass: 0.5 },
          });
          return (
            <div
              key={label}
              style={{
                flex: 1,
                backgroundColor: accent.surface,
                borderTop: `${base * 0.008}px solid ${accent.highlight}`,
                borderRadius: base * 0.014,
                padding: base * 0.035,
                fontSize: base * 0.042,
                fontWeight: 600,
                opacity: enter,
                transform: `translateY(${interpolate(enter, [0, 1], [base * 0.16, 0])}px) rotate(${interpolate(enter, [0, 1], [4 - index * 3, 0])}deg)`,
              }}
            >
              <div style={{ color: accent.highlight, fontSize: base * 0.026 }}>
                {String(index + 1).padStart(2, "0")}
              </div>
              {label}
            </div>
          );
        })}
      </div>
      <Sub accent={accent}>{cards.length} of the things it does</Sub>
    </CardFrame>
  );
};
