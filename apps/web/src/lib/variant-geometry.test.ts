import { describe, expect, it } from "vitest";
import {
  VARIANT_DEFS,
  tierFromMaster,
  variantGeometry,
  variantIds,
} from "@remotion-promo-video-pipeline/shared/src/variant-geometry";

// The create form used to label every variant with the SERVER's default tier, so
// picking 1920x1080 promised four 720p deliverables and then shipped 1080p ones.
// These pin the derivation the form now shares with the renderer and mirrors from
// `services/api/app/types/variants.py`.
describe("variantGeometry", () => {
  it("derives 720p sizes at the demo tier", () => {
    expect(variantGeometry("master-16x9", 720)).toMatchObject({
      width: 1280,
      height: 720,
    });
    expect(variantGeometry("vertical-9x16", 720)).toMatchObject({
      width: 720,
      height: 1280,
    });
    expect(variantGeometry("square-1x1", 720)).toMatchObject({
      width: 720,
      height: 720,
    });
  });

  it("follows the chosen resolution up to 1080p", () => {
    expect(variantGeometry("master-16x9", 1080)).toMatchObject({
      width: 1920,
      height: 1080,
    });
    expect(variantGeometry("square-1x1", 1080)).toMatchObject({
      width: 1080,
      height: 1080,
    });
    expect(variantGeometry("loop-muted-16x9", 1080)).toMatchObject({
      width: 1920,
      height: 1080,
      muted: true,
    });
  });

  it("keeps every dimension even for x264", () => {
    for (const tier of [719, 720, 1079, 1080]) {
      for (const id of variantIds()) {
        const { width, height } = variantGeometry(id, tier);
        expect(width % 2).toBe(0);
        expect(height % 2).toBe(0);
      }
    }
  });

  it("surfaces `required` as a boolean for every variant", () => {
    expect(variantGeometry("master-16x9", 720).required).toBe(true);
    expect(variantGeometry("square-1x1", 720).required).toBe(false);
  });

  it("falls back to the master rather than throwing on an unknown id", () => {
    expect(variantGeometry("does-not-exist", 720).id).toBe(VARIANT_DEFS[0].id);
  });

  it("reads the tier off the master's short edge", () => {
    expect(tierFromMaster(1920, 1080)).toBe(1080);
    expect(tierFromMaster(1280, 720)).toBe(720);
  });
});
