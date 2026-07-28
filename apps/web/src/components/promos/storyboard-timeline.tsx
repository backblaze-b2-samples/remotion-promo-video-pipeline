"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/amplification";
import type { Storyboard } from "@remotion-promo-video-pipeline/shared";

const SWATCHES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function StoryboardTimeline({ storyboard }: { storyboard: Storyboard }) {
  const total = storyboard.shots.reduce((sum, shot) => sum + shot.duration_frames, 0);
  const framesPerBeat = (storyboard.fps * 60) / storyboard.bpm;

  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">Storyboard</CardTitle>
        <CardDescription className="text-xs">
          {storyboard.shots.length} shots · {total} frames ·{" "}
          {formatDuration(total, storyboard.fps)} · {storyboard.bpm} BPM (
          {framesPerBeat.toFixed(1)} frames per beat) · revision {storyboard.revision}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-5">
        {/* Proportional strip: every boundary here is beat-snapped. */}
        <div
          className="flex h-8 w-full overflow-hidden rounded border border-border"
          role="img"
          aria-label={`Timeline of ${storyboard.shots.length} shots`}
        >
          {storyboard.shots.map((shot, index) => (
            <div
              key={`${shot.card}-${shot.from}`}
              title={`${shot.card} — frames ${shot.from}-${shot.from + shot.duration_frames - 1}`}
              style={{
                width: `${(shot.duration_frames / Math.max(1, total)) * 100}%`,
                backgroundColor: SWATCHES[index % SWATCHES.length],
                opacity: 0.85,
              }}
            />
          ))}
        </div>

        <ol className="space-y-2">
          {storyboard.shots.map((shot, index) => (
            <li
              key={`${shot.card}-${shot.from}-${index}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border border-border px-3 py-2 text-sm"
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: SWATCHES[index % SWATCHES.length] }}
              />
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="font-medium">{shot.card}</span>
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                f{shot.from}–{shot.from + shot.duration_frames - 1} (
                {shot.duration_frames})
              </span>
              {shot.sfx && shot.sfx !== "none" ? (
                <Badge variant="outline" className="text-[10px]">
                  sfx: {shot.sfx}
                </Badge>
              ) : null}
              {shot.capture ? (
                <Badge variant="outline" className="text-[10px]">
                  capture
                </Badge>
              ) : null}
              <span className="w-full text-[11px] text-muted-foreground">
                {shot.headline}
                {shot.sub ? ` — ${shot.sub}` : ""}
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
