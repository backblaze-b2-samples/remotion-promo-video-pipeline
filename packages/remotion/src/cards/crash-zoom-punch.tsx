// emphasis / high energy — punch into one detail of the capture ON the beat.
// One per video: two reads as a glitch.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { ShotProps } from "../lib/types";
import { CaptureImage, CardFrame, Headline, Sub } from "./frame";

export const CrashZoomPunch: React.FC<ShotProps> = ({
  copy,
  capture,
  accent,
  variant,
  durationInFrames,
  fps,
  bpm,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  const framesPerBeat = Math.max(1, Math.round((fps * 60) / bpm));
  // The punch lands on the first beat at/after 40% of the shot, so it is always
  // on the grid the storyboard was snapped to.
  const punchAt = Math.min(
    durationInFrames - 1,
    Math.ceil((durationInFrames * 0.4) / framesPerBeat) * framesPerBeat,
  );
  const scale = interpolate(
    frame,
    [0, punchAt - 1, punchAt, durationInFrames],
    [1.02, 1.06, 1.55, 1.62],
    { extrapolateRight: "clamp" },
  );
  const flash = frame === punchAt || frame === punchAt + 1 ? 0.22 : 0;
  const copyIn = interpolate(frame, [punchAt, punchAt + fps * 0.25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <CardFrame accent={accent} variant={variant}>
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <CaptureImage src={capture} accent={accent} />
      </AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: accent.foreground, opacity: flash }} />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          opacity: copyIn,
        }}
      >
        <div
          style={{
            backgroundColor: accent.background,
            padding: `${base * 0.03}px ${base * 0.05}px`,
            borderRadius: base * 0.012,
            textAlign: "center",
          }}
        >
          <Headline accent={accent} scale={0.8}>
            {copy.headline}
          </Headline>
          <Sub accent={accent}>{copy.sub}</Sub>
        </div>
      </AbsoluteFill>
    </CardFrame>
  );
};
