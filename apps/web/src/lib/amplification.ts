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
 * Where each leg of ONE variant sits inside that variant's 0..1 span.
 *
 * `rendered / total` alone described only the render leg, so the bar hit 100%
 * the instant rasterizing finished and then sat completely full — with a frozen
 * counter — through upload, encode and publish, which are the majority of the
 * wall clock (minutes on the `full` preset). A full bar that is not done reads
 * as "stuck", which is worse than no bar.
 *
 * `span` is the share of the variant a leg covers; legs that report a
 * `rendered`/`total` pair (render, upload) interpolate inside their span.
 */
const PHASE_SPANS: Record<string, { base: number; span: number; fractional: boolean }> = {
  idle: { base: 0, span: 0, fractional: false },
  queued: { base: 0, span: 0, fractional: false },
  resuming: { base: 0, span: 0.03, fractional: false },
  rendering: { base: 0.03, span: 0.57, fractional: true },
  uploading: { base: 0.6, span: 0.3, fractional: true },
  encoding: { base: 0.9, span: 0.06, fractional: false },
  publishing: { base: 0.96, span: 0.04, fractional: false },
};

export interface PassProgressLike {
  status: string;
  phase: string;
  pass_number: number;
  variant_index: number;
  variant_total: number;
  rendered: number;
  total: number;
}

/**
 * Percent complete for a whole render pass, across every leg and every variant.
 *
 * Returns 100 only when the pass is genuinely finished, and 0 for a promo that
 * has never been rendered.
 */
export function passPercent(progress: PassProgressLike): number {
  if (progress.status !== "rendering") {
    return progress.phase === "done" && progress.pass_number > 0 ? 100 : 0;
  }

  const leg = PHASE_SPANS[progress.phase] ?? PHASE_SPANS.queued;
  const fraction =
    leg.fractional && progress.total > 0
      ? Math.max(0, Math.min(1, progress.rendered / progress.total))
      : 0;
  const withinVariant = leg.base + leg.span * fraction;

  const variants = Math.max(1, progress.variant_total);
  // variant_index is 1-based and 0 before the first variant starts.
  const done = Math.max(0, Math.min(variants - 1, progress.variant_index - 1));
  const overall = (done + withinVariant) / variants;
  return Math.max(0, Math.min(100, Math.round(overall * 100)));
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
