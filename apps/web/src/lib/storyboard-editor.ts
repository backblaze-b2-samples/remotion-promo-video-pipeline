// Storyboard-editor state, as a pure reducer.
//
// Keeping add / remove / move / patch out of the component means the editor's
// behaviour is unit-testable (`storyboard-editor.test.ts`) without rendering
// anything, and the component stays a thin view over `dispatch`.

import type { ShotPatch, Storyboard } from "@remotion-promo-video-pipeline/shared";

export const MIN_SHOT_FRAMES = 6;
export const MAX_SHOT_FRAMES = 600;
export const MAX_SHOTS = 16;

export type EditorAction =
  | { type: "reset"; shots: ShotPatch[] }
  | { type: "patch"; index: number; patch: Partial<ShotPatch> }
  | { type: "add"; card: string; durationFrames: number }
  | { type: "remove"; index: number }
  | { type: "move"; index: number; direction: -1 | 1 };

export function shotsFromStoryboard(storyboard: Storyboard): ShotPatch[] {
  return storyboard.shots.map((shot) => ({
    card: shot.card,
    duration_frames: shot.duration_frames,
    headline: shot.headline,
    sub: shot.sub,
    sfx: shot.sfx || "none",
    capture: shot.capture,
  }));
}

function clampDuration(frames: number): number {
  if (!Number.isFinite(frames)) return MIN_SHOT_FRAMES;
  return Math.max(MIN_SHOT_FRAMES, Math.min(MAX_SHOT_FRAMES, Math.round(frames)));
}

export function editorReducer(state: ShotPatch[], action: EditorAction): ShotPatch[] {
  switch (action.type) {
    case "reset":
      return action.shots.map((shot) => ({
        ...shot,
        duration_frames: clampDuration(shot.duration_frames),
      }));

    case "patch": {
      if (action.index < 0 || action.index >= state.length) return state;
      return state.map((shot, index) => {
        if (index !== action.index) return shot;
        const merged = { ...shot, ...action.patch };
        return { ...merged, duration_frames: clampDuration(merged.duration_frames) };
      });
    }

    case "add": {
      // Capped so a storyboard can't grow without bound: every extra shot is N
      // more frames per variant per pass.
      if (state.length >= MAX_SHOTS) return state;
      const previous = state[state.length - 1];
      return [
        ...state,
        {
          card: action.card,
          duration_frames: clampDuration(action.durationFrames),
          headline: "",
          sub: "",
          sfx: "none",
          // Inherit the previous shot's capture so a new shot is not blank.
          capture: previous ? previous.capture : null,
        },
      ];
    }

    case "remove":
      // A storyboard with no shots has no duration and cannot be rendered.
      if (state.length <= 1) return state;
      return state.filter((_, index) => index !== action.index);

    case "move": {
      const target = action.index + action.direction;
      if (
        action.index < 0 ||
        action.index >= state.length ||
        target < 0 ||
        target >= state.length
      ) {
        return state;
      }
      const next = [...state];
      [next[action.index], next[target]] = [next[target], next[action.index]];
      return next;
    }

    default:
      return state;
  }
}

/** Total frames the edited storyboard will render (before beat snapping). */
export function totalFrames(shots: ShotPatch[]): number {
  return shots.reduce((sum, shot) => sum + shot.duration_frames, 0);
}

/**
 * Shots with their start frame, for the timeline strip. The API re-snaps
 * boundaries to the beat grid on save, so these positions are indicative.
 */
export function withStartFrames(
  shots: ShotPatch[],
): { shot: ShotPatch; from: number }[] {
  let cursor = 0;
  return shots.map((shot) => {
    const entry = { shot, from: cursor };
    cursor += shot.duration_frames;
    return entry;
  });
}
