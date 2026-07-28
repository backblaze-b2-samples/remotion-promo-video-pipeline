// Write-amplification formatting — the headline number of this app.
//
// Pure functions with no React and no fetching, so they are unit-testable
// (`amplification.test.ts`) and reusable by the dashboard, the promo list and
// the manifest viewer without any of them re-deriving the maths.

/** "12.4x", or "—" when nothing has been delivered yet (never "Infinityx"). */
export function formatAmplification(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined) return "—";
  if (!Number.isFinite(ratio) || ratio <= 0) return "—";
  if (ratio >= 100) return `${Math.round(ratio)}x`;
  return `${ratio.toFixed(1)}x`;
}

/**
 * Intermediate bytes written per delivered byte. Mirrors
 * `services/api/app/types/promo.py::amplification_ratio` so the UI can compute
 * it for an in-flight pass without waiting for the manifest.
 */
export function amplificationRatio(frameBytes: number, variantBytes: number): number {
  if (variantBytes <= 0) return 0;
  return Math.round((frameBytes / variantBytes) * 100) / 100;
}

/** "1,086 frames" — thousands separators matter at 1086 and up. */
export function formatFrameCount(frames: number | null | undefined): string {
  if (!frames || frames < 0) return "0 frames";
  return `${frames.toLocaleString("en-US")} ${frames === 1 ? "frame" : "frames"}`;
}

/** "6.0s" from a frame count and fps. */
export function formatDuration(frames: number, fps: number): string {
  if (fps <= 0) return "0.0s";
  return `${(frames / fps).toFixed(1)}s`;
}

/** Fraction complete for a progress bar, clamped to 0..100. */
export function renderPercent(rendered: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((rendered / total) * 100)));
}

/**
 * A plain-language reading of the ratio, used as the dashboard's supporting
 * line. Deliberately concrete: the point is that intermediates dominate.
 */
export function amplificationBlurb(
  frameBytes: number,
  variantBytes: number,
): string {
  if (variantBytes <= 0 || frameBytes <= 0) {
    return "Render a promo to measure intermediate vs delivered bytes.";
  }
  const ratio = amplificationRatio(frameBytes, variantBytes);
  return `${formatAmplification(ratio)} more intermediate bytes than delivered video.`;
}
