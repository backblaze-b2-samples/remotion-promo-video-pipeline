"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { usePromoProgress } from "@/lib/queries";
import { formatFrameCount, passPercent } from "@/lib/amplification";

const PHASE_LABELS: Record<string, string> = {
  // "Not started" rather than "Queued": nothing is waiting on the render worker
  // for a promo that has never been rendered, and announcing "Queued" beside
  // "No render yet" left first-timers waiting for a pass that never comes.
  idle: "Not started",
  queued: "Queued",
  resuming: "Scanning B2 for frames already rendered",
  rendering: "Rendering frames in headless Chrome",
  uploading: "Uploading frames to B2",
  encoding: "Muxing frames + audio with ffmpeg",
  publishing: "Uploading the variant + poster",
  done: "Idle",
  error: "Failed",
};

// The counter's meaning follows the phase: during the upload leg the backend
// re-points `rendered`/`total` at objects uploaded, so the numbers keep moving
// instead of freezing at "180 / 180".
const COUNTER_NOUN: Record<string, string> = {
  uploading: "uploaded",
  rendering: "rendered",
};

export function RenderProgressPanel({ jobId }: { jobId: string }) {
  const { data: progress, isLoading } = usePromoProgress(jobId);

  if (isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }
  if (!progress) return null;

  // Weighted across resume -> render -> upload -> encode -> publish for every
  // variant, so the bar tracks the whole pass rather than the render leg alone.
  const percent = passPercent(progress);
  const active = progress.status === "rendering";
  const noun = COUNTER_NOUN[progress.phase];

  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">
          {active
            ? `Pass ${progress.pass_number} in flight`
            : `Last pass: ${progress.pass_number || "none"}`}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        {progress.error ? (
          <Alert variant="destructive">
            <AlertTitle>Render failed</AlertTitle>
            <AlertDescription>{progress.error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="font-medium">
            {PHASE_LABELS[progress.phase] ?? progress.phase}
          </span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {progress.variant ? `${progress.variant} · ` : ""}
            {progress.variant_total > 0
              ? `variant ${progress.variant_index}/${progress.variant_total} · `
              : ""}
            {formatFrameCount(progress.rendered)} / {progress.total}
            {noun ? ` ${noun}` : ""}
          </span>
        </div>

        <Progress value={percent} aria-label="Render progress" />
        <div className="flex justify-between text-[11px] tabular-nums text-muted-foreground">
          <span>{active ? `${percent}% of pass ${progress.pass_number}` : ""}</span>
          <span>
            {active && progress.variant_total > 0
              ? `${progress.variant_total} variants this pass`
              : ""}
          </span>
        </div>

        <p className="text-xs text-muted-foreground" aria-live="polite">
          {progress.message || "No render yet."}
          {progress.frames_uploaded > 0
            ? ` ${formatFrameCount(progress.frames_uploaded)} uploaded to B2 this pass.`
            : ""}
        </p>
      </CardContent>
    </Card>
  );
}
