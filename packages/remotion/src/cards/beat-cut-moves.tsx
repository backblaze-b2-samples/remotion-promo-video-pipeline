// rhythm / high energy — hard-cut between framings strictly on the beat grid.
// Sub-shots stay >= 6 frames: four cuts inside a second is a seizure risk.
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { ShotProps } from "../lib/types";
import { CardFrame, Headline, Sub } from "./frame";

const MIN_SUBSHOT_FRAMES = 6;

export const BeatCutMoves: React.FC<ShotProps> = ({
  copy,
  accent,
  variant,
  durationInFrames,
  fps,
  bpm,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  const framesPerBeat = Math.max(MIN_SUBSHOT_FRAMES, Math.round((fps * 60) / bpm));
  const beat = Math.floor(frame / framesPerBeat);
  const layouts = [
    { align: "flex-start", justify: "flex-start", scale: 1 },
    { align: "flex-end", justify: "center", scale: 1.08 },
    { align: "center", justify: "flex-end", scale: 0.94 },
    { align: "flex-start", justify: "center", scale: 1.04 },
  ];
  const layout = layouts[beat % layouts.length];
  const beatsTotal = Math.max(1, Math.ceil(durationInFrames / framesPerBeat));

  return (
    <CardFrame accent={accent} variant={variant} background={beat % 2 === 0 ? accent.background : accent.surface}>
      <AbsoluteFill
        style={{
          alignItems: layout.align as React.CSSProperties["alignItems"],
          justifyContent: layout.justify as React.CSSProperties["justifyContent"],
          padding: base * 0.09,
          transform: `scale(${layout.scale})`,
        }}
      >
        <div>
          <Headline accent={accent} scale={0.9}>
            {copy.headline}
          </Headline>
          <Sub accent={accent}>
            {copy.sub} — beat {(beat % beatsTotal) + 1}/{beatsTotal}
          </Sub>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: "flex-end", padding: base * 0.05 }}>
        <div style={{ display: "flex", gap: base * 0.01 }}>
          {Array.from({ length: beatsTotal }).map((_, index) => (
            <span
              key={index}
              style={{
                flex: 1,
                height: base * 0.008,
                borderRadius: base * 0.004,
                backgroundColor: index <= beat ? accent.highlight : accent.muted,
                opacity: index <= beat ? 1 : 0.3,
              }}
            />
          ))}
        </div>
      </AbsoluteFill>
    </CardFrame>
  );
};
