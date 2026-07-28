// What a Playwright capture costs, in one place.
//
// Both surfaces that trigger a capture — `/ingest` (POST /captures) and
// `/promos/new` (POST /promos captures first) — need the same numbers to tell
// the user how long the wait can be, so the budget lives here rather than being
// re-guessed per form.

/** Per-viewport capture timeout, mirroring `service/capture.CAPTURE_TIMEOUT_MS`. */
export const CAPTURE_TIMEOUT_SECONDS = 20;

/** Worst-case wall clock for capturing `viewports` viewports, in seconds. */
export function captureBudgetSeconds(viewports: number): number {
  return Math.max(1, Math.round(viewports)) * CAPTURE_TIMEOUT_SECONDS;
}

/** Why the wait can be this long — appended to the elapsed clock. */
export function captureBudgetNote(viewports: number): string {
  return (
    `the capture waits up to ${CAPTURE_TIMEOUT_SECONDS}s per viewport for an ` +
    `unreachable URL, so up to ~${captureBudgetSeconds(viewports)}s here.`
  );
}
