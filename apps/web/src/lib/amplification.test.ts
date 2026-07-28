import { describe, expect, it } from "vitest";

import {
  amplificationBlurb,
  amplificationRatio,
  formatAmplification,
  formatDuration,
  formatFrameCount,
  renderPercent,
} from "./amplification";

describe("formatAmplification", () => {
  it("formats a normal ratio to one decimal", () => {
    expect(formatAmplification(12.44)).toBe("12.4x");
  });

  it("drops the decimal above 100x, where it is noise", () => {
    expect(formatAmplification(148.7)).toBe("149x");
  });

  it("renders an em dash instead of Infinity when nothing was delivered", () => {
    expect(formatAmplification(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatAmplification(0)).toBe("—");
    expect(formatAmplification(null)).toBe("—");
    expect(formatAmplification(undefined)).toBe("—");
  });
});

describe("amplificationRatio", () => {
  it("matches the backend rounding (two decimals)", () => {
    expect(amplificationRatio(1000, 3)).toBe(333.33);
  });

  it("returns 0 rather than dividing by zero mid-pass", () => {
    expect(amplificationRatio(4_000_000, 0)).toBe(0);
  });
});

describe("formatFrameCount", () => {
  it("groups thousands so 1086 reads as a real volume", () => {
    expect(formatFrameCount(1086)).toBe("1,086 frames");
  });

  it("singularizes one frame", () => {
    expect(formatFrameCount(1)).toBe("1 frame");
  });

  it("treats missing counts as zero", () => {
    expect(formatFrameCount(undefined)).toBe("0 frames");
  });
});

describe("formatDuration", () => {
  it("converts frames to seconds at the given fps", () => {
    expect(formatDuration(1086, 30)).toBe("36.2s");
    expect(formatDuration(180, 30)).toBe("6.0s");
  });

  it("never divides by a zero fps", () => {
    expect(formatDuration(180, 0)).toBe("0.0s");
  });
});

describe("renderPercent", () => {
  it("clamps to 0..100", () => {
    expect(renderPercent(90, 180)).toBe(50);
    expect(renderPercent(500, 180)).toBe(100);
    expect(renderPercent(-5, 180)).toBe(0);
    expect(renderPercent(10, 0)).toBe(0);
  });
});

describe("amplificationBlurb", () => {
  it("prompts a first render when there is no data", () => {
    expect(amplificationBlurb(0, 0)).toMatch(/Render a promo/);
  });

  it("states the ratio once both sides are known", () => {
    expect(amplificationBlurb(1000, 100)).toMatch(/10\.0x more intermediate bytes/);
  });
});
