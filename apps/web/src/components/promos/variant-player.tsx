"use client";

import { Video } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { humanizeBytes } from "@/lib/utils";
import type { VariantPlayback } from "@remotion-promo-video-pipeline/shared";

export function VariantPlayer({ playback }: { playback: VariantPlayback[] }) {
  if (playback.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={Video}
            title="No rendered variants yet"
            description="Run a render pass to produce MP4s under renders/<job-id>/."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {playback.map((variant) => (
        <Card key={variant.variant}>
          <CardHeader className="border-b border-border py-3 px-4">
            <CardTitle className="card-title flex flex-wrap items-center gap-2">
              {variant.label}
              <Badge variant="outline" className="font-mono text-[10px]">
                {variant.width}x{variant.height}
              </Badge>
              {variant.muted ? (
                <Badge variant="outline" className="text-[10px]">
                  muted
                </Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-4">
            {/* Served straight from B2 with a presigned inline URL — the API
                never proxies video bytes and the bucket stays private. */}
            <video
              controls
              preload="metadata"
              muted={variant.muted}
              loop={variant.muted}
              poster={variant.poster_url ?? undefined}
              src={variant.url ?? undefined}
              className="w-full rounded-md border border-border bg-black"
              style={{ aspectRatio: `${variant.width} / ${variant.height}` }}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <code className="font-mono">{variant.key}</code>
              <span className="tabular-nums">
                {humanizeBytes(variant.size_bytes)} · {variant.duration_seconds}s
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
