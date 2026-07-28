// The composition body: map beat-snapped shots to <Sequence> and dispatch each
// to its shot card. All timing already lives in the storyboard (the API snapped
// it to the BPM grid at authoring time), so nothing is re-derived here.

import React from "react";
import { AbsoluteFill, Sequence } from "remotion";

import { cardComponent } from "./cards";
import type { PromoProps } from "./lib/types";
import { accentTheme } from "./lib/variant";

export const Promo: React.FC<PromoProps> = ({ storyboard, variant }) => {
  const accent = accentTheme(storyboard.accent);
  return (
    <AbsoluteFill style={{ backgroundColor: accent.background }}>
      {storyboard.shots.map((shot, index) => {
        const Card = cardComponent(shot.card);
        return (
          <Sequence
            key={`${shot.card}-${shot.from}-${index}`}
            from={shot.from}
            durationInFrames={shot.duration_frames}
            name={`${index + 1}. ${shot.card}`}
          >
            <Card
              copy={{ headline: shot.headline, sub: shot.sub }}
              capture={shot.capture_url}
              accent={accent}
              variant={variant}
              durationInFrames={shot.duration_frames}
              fps={storyboard.fps}
              bpm={storyboard.bpm}
              index={index}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
