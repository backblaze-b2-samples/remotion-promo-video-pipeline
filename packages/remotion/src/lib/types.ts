// The render payload the Python side writes to disk
// (services/api/app/service/render_payload.py). Kept as its own tiny module so
// every card component and the composition agree on one shape.

export interface RenderShot {
  card: string;
  from: number;
  duration_frames: number;
  headline: string;
  sub: string;
  sfx: string;
  /** Short-lived presigned B2 URL, or null when no capture is attached. */
  capture_url: string | null;
}

export interface RenderStoryboard {
  job_id: string;
  product: string;
  title: string;
  fps: number;
  bpm: number;
  /** Master frame size. Each variant re-derives its own from the short edge. */
  width: number;
  height: number;
  accent: string;
  duration_frames: number;
  shots: RenderShot[];
}

/**
 * Props of the one `<Composition>`. A `type` alias, not an `interface`, on
 * purpose: Remotion constrains a composition's props to
 * `Record<string, unknown>`, and only a type alias gets TypeScript's implicit
 * index signature. As an interface, `Composition`'s generic silently widens to
 * `Record<string, unknown>` and `calculateMetadata` loses every field type.
 */
export type PromoProps = {
  storyboard: RenderStoryboard;
  variant: string;
};

export interface ShotProps {
  copy: { headline: string; sub: string };
  capture: string | null;
  accent: AccentTheme;
  variant: string;
  durationInFrames: number;
  fps: number;
  bpm: number;
  index: number;
}

export interface AccentTheme {
  id: string;
  background: string;
  surface: string;
  foreground: string;
  muted: string;
  highlight: string;
}
