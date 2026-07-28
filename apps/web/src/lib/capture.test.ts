import { describe, expect, it } from "vitest";
import {
  CAPTURE_TIMEOUT_SECONDS,
  captureBudgetNote,
  captureBudgetSeconds,
} from "@/lib/capture";

// Shared so `/ingest` and `/promos/new` quote the same wait for the same
// operation — the two surfaces disagreed before (a full stage breakdown on one, a
// bare button spinner on the other).
describe("capture budget", () => {
  it("scales with the number of viewports", () => {
    expect(captureBudgetSeconds(1)).toBe(CAPTURE_TIMEOUT_SECONDS);
    expect(captureBudgetSeconds(3)).toBe(CAPTURE_TIMEOUT_SECONDS * 3);
  });

  it("never returns a zero budget (it divides the progress bar)", () => {
    expect(captureBudgetSeconds(0)).toBe(CAPTURE_TIMEOUT_SECONDS);
    expect(captureBudgetSeconds(-2)).toBe(CAPTURE_TIMEOUT_SECONDS);
  });

  it("explains the per-viewport timeout in the note", () => {
    expect(captureBudgetNote(2)).toContain(`${CAPTURE_TIMEOUT_SECONDS}s per viewport`);
    expect(captureBudgetNote(2)).toContain(`~${CAPTURE_TIMEOUT_SECONDS * 2}s`);
  });
});
