"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";

interface InFlightStateProps {
  /** What the server is doing, e.g. "Creating this promo". */
  title: string;
  /** Worst-case wall clock in seconds; scales the bar. Never reports 100%. */
  budgetSeconds: number;
  /** The stage breakdown — what happens, in order, while this is up. */
  children: ReactNode;
  /** Why the wait can be this long. Appended to the elapsed clock. */
  budgetNote?: string;
}

/**
 * In-flight-state primitive — the third member of the `EmptyState` /
 * `ErrorState` family, for a blocking request long enough that a faded button
 * with a spinner is not feedback.
 *
 * Both capture surfaces block: `POST /captures` and `POST /promos` do the
 * Playwright run inline, so there is no server-side progress to poll. The honest
 * display is therefore an indeterminate spinner PLUS the stage list, a
 * determinate bar against the known timeout budget, and a real elapsed clock —
 * enough to tell "still capturing" from "hung". This is shared rather than
 * duplicated because the *same* capture ran behind a full stage breakdown on
 * `/promos/new` and behind a bare button spinner on `/ingest`.
 */
export function InFlightState({
  title,
  budgetSeconds,
  children,
  budgetNote,
}: InFlightStateProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - started) / 1000), 250);
    return () => clearInterval(timer);
  }, []);

  const budget = Math.max(1, budgetSeconds);

  return (
    <Alert aria-live="polite" aria-busy="true">
      <Loader2 className="h-4 w-4 animate-spin" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="space-y-2">
        <span className="block text-xs">{children}</span>
        <Progress
          value={Math.min(99, (elapsed / budget) * 100)}
          aria-label={`${title} progress`}
        />
        <span className="block text-xs tabular-nums">
          {elapsed.toFixed(1)}s elapsed{budgetNote ? ` — ${budgetNote}` : ""}
        </span>
      </AlertDescription>
    </Alert>
  );
}
