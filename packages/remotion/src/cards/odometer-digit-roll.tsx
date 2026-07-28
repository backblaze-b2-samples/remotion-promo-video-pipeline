// data / medium — roll a headline number up like an odometer so a metric feels
// earned. Roll to a REAL number: a fake metric loses a technical audience.
import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { ShotProps } from "../lib/types";
import { CardFrame, Headline, Sub } from "./frame";

const MAX_DIGITS = 4;

export const OdometerDigitRoll: React.FC<ShotProps> = ({
  copy,
  accent,
  variant,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  const digitsOnly = copy.headline.replace(/[^0-9]/g, "");
  const target = Number(digitsOnly || "0");
  const progress = interpolate(frame, [0, durationInFrames * 0.8], [0, 1], {
    extrapolateRight: "clamp",
  });
  // Ease-out so the last digits settle instead of stopping dead.
  const eased = 1 - Math.pow(1 - progress, 3);
  const value = Math.round(target * eased);
  // More than four rolling digits turns to mush at 30fps.
  const label = digitsOnly
    ? String(value).slice(-MAX_DIGITS)
    : copy.headline;

  return (
    <CardFrame accent={accent} variant={variant}>
      <div
        style={{
          fontSize: base * 0.26,
          fontWeight: 800,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.04em",
          color: accent.highlight,
          lineHeight: 1,
        }}
      >
        {label}
      </div>
      <Headline accent={accent} scale={0.5} style={{ marginTop: base * 0.02 }}>
        {copy.sub}
      </Headline>
      <Sub accent={accent}>frames written to B2 per pass</Sub>
    </CardFrame>
  );
};
