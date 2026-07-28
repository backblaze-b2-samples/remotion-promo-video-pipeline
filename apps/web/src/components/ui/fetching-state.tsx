import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";

interface FetchingStateProps {
  /** What is being read, in the user's words — name the B2 keys or prefix. */
  label: ReactNode;
  /** How many placeholder rows to draw. Match the real list, roughly. */
  rows?: number;
  /** Height/width classes for each placeholder row (default: a table row). */
  rowClassName?: string;
  className?: string;
}

/**
 * Fetching state — labelled skeletons for a *read* that is still in flight.
 *
 * The fourth member of the `EmptyState` / `ErrorState` / `InFlightState`
 * family. `InFlightState` is for a blocking write with a known time budget;
 * this is the cheap case: rows are coming, and the placeholder says which B2
 * keys are being listed while the user waits. Unlabelled grey bars are the
 * thing this exists to prevent, so `label` is required.
 */
export function FetchingState({
  label,
  rows = 4,
  rowClassName = "h-14 w-full",
  className,
}: FetchingStateProps) {
  return (
    <div
      className={`space-y-3 ${className ?? ""}`}
      role="status"
      aria-live="polite"
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={rowClassName} />
      ))}
    </div>
  );
}
