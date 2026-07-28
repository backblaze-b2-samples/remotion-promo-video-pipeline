import { describe, expect, it } from "vitest";

import {
  MAX_SHOTS,
  MIN_SHOT_FRAMES,
  editorReducer,
  totalFrames,
  withStartFrames,
  type EditorAction,
} from "./storyboard-editor";
import type { ShotPatch } from "@remotion-promo-video-pipeline/shared";

function shot(card: string, duration = 30): ShotPatch {
  return {
    card,
    duration_frames: duration,
    headline: card,
    sub: "",
    sfx: "none",
    capture: null,
  };
}

function run(state: ShotPatch[], ...actions: EditorAction[]): ShotPatch[] {
  return actions.reduce(editorReducer, state);
}

describe("editorReducer", () => {
  it("patches one shot without touching its neighbours", () => {
    const state = [shot("paper-title-card"), shot("row-embed")];
    const next = run(state, {
      type: "patch",
      index: 1,
      patch: { card: "crash-zoom-punch", headline: "Right here" },
    });
    expect(next[0]).toEqual(state[0]);
    expect(next[1].card).toBe("crash-zoom-punch");
    expect(next[1].headline).toBe("Right here");
  });

  it("clamps a duration below the minimum shot length", () => {
    const next = run([shot("row-embed")], {
      type: "patch",
      index: 0,
      patch: { duration_frames: 1 },
    });
    expect(next[0].duration_frames).toBe(MIN_SHOT_FRAMES);
  });

  it("ignores a patch for an index that does not exist", () => {
    const state = [shot("row-embed")];
    expect(run(state, { type: "patch", index: 7, patch: { sub: "x" } })).toBe(state);
  });

  it("adds a shot that inherits the previous shot's capture", () => {
    const state = [{ ...shot("row-embed"), capture: "assets/p/captures/desktop/x@2x.png" }];
    const next = run(state, { type: "add", card: "wipe-transitions", durationFrames: 24 });
    expect(next).toHaveLength(2);
    expect(next[1].card).toBe("wipe-transitions");
    expect(next[1].capture).toBe("assets/p/captures/desktop/x@2x.png");
  });

  it("caps the shot count — every extra shot is N more frames per variant", () => {
    let state = [shot("paper-title-card")];
    for (let i = 0; i < MAX_SHOTS + 5; i += 1) {
      state = editorReducer(state, {
        type: "add",
        card: "beat-cut-moves",
        durationFrames: 30,
      });
    }
    expect(state).toHaveLength(MAX_SHOTS);
  });

  it("removes a shot but never the last one", () => {
    const two = [shot("a"), shot("b")];
    expect(run(two, { type: "remove", index: 0 })).toHaveLength(1);
    const one = [shot("a")];
    expect(run(one, { type: "remove", index: 0 })).toBe(one);
  });

  it("reorders shots and refuses to move past either end", () => {
    const state = [shot("a"), shot("b"), shot("c")];
    expect(run(state, { type: "move", index: 0, direction: 1 }).map((s) => s.card)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(run(state, { type: "move", index: 0, direction: -1 })).toBe(state);
    expect(run(state, { type: "move", index: 2, direction: 1 })).toBe(state);
  });

  it("resets from a stored storyboard, clamping as it goes", () => {
    const next = run([], {
      type: "reset",
      shots: [shot("row-embed", 2), shot("wipe-transitions", 24)],
    });
    expect(next.map((s) => s.duration_frames)).toEqual([MIN_SHOT_FRAMES, 24]);
  });
});

describe("totalFrames", () => {
  it("sums shot durations", () => {
    expect(totalFrames([shot("a", 30), shot("b", 24), shot("c", 36)])).toBe(90);
  });
});

describe("withStartFrames", () => {
  it("accumulates start frames in order", () => {
    expect(withStartFrames([shot("a", 30), shot("b", 24)]).map((e) => e.from)).toEqual([
      0, 30,
    ]);
  });
});
