import { describe, expect, it } from "vitest";

import {
  amplificationBlurb,
  amplificationRatio,
  formatAmplification,
  formatDuration,
  formatFrameCount,
  passPercent,
  renderPercent,
} from "./amplification";

/** A progress payload with the fields `passPercent` reads. */
function progress(overrides: Partial<Parameters<typeof passPercent>[0]> = {}) {
  return {
    status: "rendering",
    phase: "rendering",
    pass_number: 1,
    variant_index: 1,
    variant_total: 2,
    rendered: 0,
    total: 180,
    ...overrides,
  };
}

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

// Regression suite: the bar used to be `rendered / total`, so it hit 100% the
// moment rasterizing finished and then sat completely full — with a frozen
// counter — through upload, encode and publish for every variant. A full bar
// that is not done reads as "stuck".
describe("passPercent", () => {
  it("is 0 for a promo that has never been rendered", () => {
    expect(passPercent(progress({ status: "draft", phase: "idle", pass_number: 0 }))).toBe(0);
  });

  it("is 100 only for a genuinely finished pass", () => {
    expect(passPercent(progress({ status: "rendered", phase: "done" }))).toBe(100);
    expect(
      passPercent(progress({ status: "rendered", phase: "done", pass_number: 0 })),
    ).toBe(0);
  });

  it("never reaches 100 while the first variant is still rendering", () => {
    const full = passPercent(
      progress({ phase: "rendering", rendered: 180, total: 180 }),
    );
    expect(full).toBeGreaterThan(0);
    expect(full).toBeLessThan(50);
  });

  it("keeps advancing through the upload leg", () => {
    const start = passPercent(progress({ phase: "uploading", rendered: 0, total: 180 }));
    const mid = passPercent(progress({ phase: "uploading", rendered: 90, total: 180 }));
    const end = passPercent(progress({ phase: "uploading", rendered: 180, total: 180 }));
    expect(start).toBeLessThan(mid);
    expect(mid).toBeLessThan(end);
  });

  it("advances monotonically across the legs of one variant", () => {
    const phases = ["resuming", "rendering", "uploading", "encoding", "publishing"];
    const values = phases.map((phase) =>
      passPercent(progress({ phase, variant_total: 1, rendered: 0, total: 180 })),
    );
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(values.at(-1)).toBeLessThan(100);
  });

  it("scales across variants so variant 2 of 2 starts above 50%", () => {
    const second = passPercent(
      progress({ variant_index: 2, variant_total: 2, phase: "rendering", rendered: 0 }),
    );
    expect(second).toBeGreaterThanOrEqual(50);
  });

  it("tolerates a variant_index of 0 and a variant_total of 0", () => {
    expect(
      passPercent(progress({ variant_index: 0, variant_total: 0, rendered: 90 })),
    ).toBeGreaterThanOrEqual(0);
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
