"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { usePromo } from "@/lib/queries";
import { formatAmplification, formatDuration } from "@/lib/amplification";
import { ManifestPanel } from "./manifest-panel";
import { PromoActions } from "./promo-actions";
import { PromoStatusBadge } from "./promo-status-badge";
import { RenderProgressPanel } from "./render-progress-panel";
import { StoryboardTimeline } from "./storyboard-timeline";
import { VariantPlayer } from "./variant-player";

export function PromoDetailView({ jobId }: { jobId: string }) {
  const { data: promo, isLoading, error, refetch } = usePromo(jobId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !promo) {
    return (
      <Card>
        <CardContent className="p-0">
          <ErrorState error={error} onRetry={() => refetch()} />
        </CardContent>
      </Card>
    );
  }

  const { storyboard, manifest, playback, frame_samples: frameSamples } = promo;

  return (
    <div className="space-y-8">
      <div className="animate-fade-in space-y-4 border-b border-border pb-5">
        <Link
          href="/promos"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          All promos
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="page-title">{storyboard.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <PromoStatusBadge status={promo.status} />
              <Badge variant="outline" className="font-mono text-[10px]">
                {storyboard.product}
              </Badge>
              <Badge variant="outline" className="font-mono text-[10px]">
                {storyboard.preset}
              </Badge>
              <span>
                revision {storyboard.revision} ·{" "}
                {formatDuration(storyboard.duration_frames, storyboard.fps)} ·{" "}
                {storyboard.width}x{storyboard.height} · {storyboard.bpm} BPM
              </span>
              {manifest ? (
                <span className="font-mono">
                  {formatAmplification(manifest.totals.amplification_ratio)} write
                  amplification
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/promos/${jobId}/edit`}>Edit storyboard</Link>
            </Button>
            <PromoActions
              jobId={jobId}
              title={storyboard.title}
              status={promo.status}
              redirectAfterDelete="/promos"
              showView={false}
            />
          </div>
        </div>
      </div>

      <div className="animate-fade-in-up stagger-2">
        <RenderProgressPanel jobId={jobId} />
      </div>

      <div className="animate-fade-in-up stagger-3 space-y-4">
        <h2 className="section-title text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Delivered variants
        </h2>
        <VariantPlayer playback={playback} />
      </div>

      <div className="animate-fade-in-up stagger-4 grid gap-6 lg:grid-cols-2">
        <StoryboardTimeline storyboard={storyboard} />
        <ManifestPanel manifest={manifest} frameSamples={frameSamples} />
      </div>
    </div>
  );
}
