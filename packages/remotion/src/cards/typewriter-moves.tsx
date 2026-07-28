// text / medium — type the value proposition in so the viewer reads at the
// narrator's pace. Typing always finishes before the shot ends.
import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { ShotProps } from "../lib/types";
import { CardFrame, Headline, Sub } from "./frame";

export const TypewriterMoves: React.FC<ShotProps> = ({
  copy,
  accent,
  variant,
  durationInFrames,
  fps,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  // Finish typing at 70% of the shot; the caret settles solid after that so the
  // last frame never looks like a stall.
  const typeUntil = Math.max(1, Math.floor(durationInFrames * 0.7));
  // Starts at 1, never 0: a shot whose first frame is blank reads as a dropped
  // frame in the finished video (and can be picked as the poster).
  const shown = Math.max(
    1,
    Math.round(
      interpolate(frame, [0, typeUntil], [1, copy.headline.length], {
        extrapolateRight: "clamp",
      }),
    ),
  );
  const typing = frame < typeUntil;
  const caretOn = typing ? Math.floor(frame / Math.max(1, fps / 3)) % 2 === 0 : true;
  // The sub is dim from frame 0 and brightens once typing finishes, so the shot
  // always has two lines of content on screen.
  const subOpacity = interpolate(frame, [0, typeUntil, typeUntil + fps * 0.4], [0.3, 0.3, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <CardFrame accent={accent} variant={variant}>
      <Headline accent={accent} style={{ fontFamily: "'SFMono-Regular', ui-monospace, monospace" }}>
        {copy.headline.slice(0, shown)}
        <span style={{ opacity: caretOn ? 1 : 0, color: accent.highlight }}>_</span>
      </Headline>
      <Sub accent={accent} style={{ opacity: subOpacity, marginTop: base * 0.03 }}>
        {copy.sub}
      </Sub>
    </CardFrame>
  );
};
