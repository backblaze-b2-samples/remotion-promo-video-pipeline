// Shared chrome for every shot card: background, variant-aware safe area, and
// the two typography slots. Cards compose these instead of re-deriving padding,
// so a 16:9 layout survives a 9:16 reframe without copy falling off the edge.

import React, { useState } from "react";
import { AbsoluteFill, Img, useVideoConfig } from "remotion";
import type { AccentTheme } from "../lib/types";
import { variantGeometry } from "../lib/variant";

export const CardFrame: React.FC<{
  accent: AccentTheme;
  variant: string;
  children: React.ReactNode;
  background?: string;
}> = ({ accent, variant, children, background }) => {
  const { width, height } = useVideoConfig();
  const geometry = variantGeometry(variant, Math.min(width, height));
  return (
    <AbsoluteFill
      style={{
        backgroundColor: background ?? accent.background,
        color: accent.foreground,
        fontFamily:
          '"Inter", "Helvetica Neue", "Segoe UI", system-ui, sans-serif',
        padding: `${geometry.safeArea.y * 100}% ${geometry.safeArea.x * 100}%`,
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

export const Headline: React.FC<{
  children: React.ReactNode;
  accent: AccentTheme;
  scale?: number;
  style?: React.CSSProperties;
}> = ({ children, accent, scale = 1, style }) => {
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  return (
    <div
      style={{
        fontSize: base * 0.085 * scale,
        fontWeight: 700,
        letterSpacing: "-0.02em",
        lineHeight: 1.08,
        color: accent.foreground,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const Sub: React.FC<{
  children: React.ReactNode;
  accent: AccentTheme;
  style?: React.CSSProperties;
}> = ({ children, accent, style }) => {
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  return (
    <div
      style={{
        fontSize: base * 0.038,
        fontWeight: 500,
        letterSpacing: "0.01em",
        color: accent.muted,
        marginTop: base * 0.022,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/**
 * A drawn stand-in for the product UI, used when a shot has no capture (or the
 * presigned URL failed). Never a blank rectangle: a shot with no capture must
 * still read as "a product screen".
 */
export const MockUI: React.FC<{ accent: AccentTheme; label?: string }> = ({
  accent,
  label,
}) => {
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: `linear-gradient(160deg, ${accent.surface} 0%, ${accent.background} 100%)`,
        border: `${base * 0.003}px solid ${accent.muted}`,
        borderRadius: base * 0.02,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          height: base * 0.055,
          backgroundColor: accent.highlight,
          opacity: 0.9,
          display: "flex",
          alignItems: "center",
          gap: base * 0.012,
          paddingLeft: base * 0.02,
        }}
      >
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            style={{
              width: base * 0.014,
              height: base * 0.014,
              borderRadius: "50%",
              backgroundColor: accent.background,
              opacity: 0.55,
            }}
          />
        ))}
      </div>
      <div style={{ flex: 1, padding: base * 0.03 }}>
        {[0.7, 0.45, 0.9, 0.3, 0.6].map((fraction, index) => (
          <div
            key={index}
            style={{
              height: base * 0.026,
              width: `${fraction * 100}%`,
              marginBottom: base * 0.022,
              borderRadius: base * 0.008,
              backgroundColor: index === 0 ? accent.highlight : accent.foreground,
              opacity: index === 0 ? 0.85 : 0.34,
            }}
          />
        ))}
        {label ? (
          <div
            style={{
              marginTop: base * 0.02,
              fontSize: base * 0.028,
              color: accent.muted,
            }}
          >
            {label}
          </div>
        ) : null}
      </div>
    </div>
  );
};

/**
 * Remotion's `<Img>` blocks the frame until the bitmap is decoded, which is what
 * makes a render deterministic. `onError` is wired so an expired presigned URL
 * degrades to the drawn mock instead of failing the whole pass.
 */
export const CaptureImage: React.FC<{
  src: string | null;
  accent: AccentTheme;
  fit?: "cover" | "contain";
  style?: React.CSSProperties;
}> = ({ src, accent, fit = "cover", style }) => {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <MockUI accent={accent} />;
  }
  return (
    <Img
      src={src}
      onError={() => setFailed(true)}
      style={{
        width: "100%",
        height: "100%",
        objectFit: fit,
        display: "block",
        ...style,
      }}
    />
  );
};
