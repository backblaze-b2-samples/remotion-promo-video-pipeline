"use client";

import Link from "next/link";
import { ArrowLeft, FileQuestion, ImageOff } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api-client";
import { usePromo, usePromoProgress } from "@/lib/queries";
import { formatAmplification, formatDuration } from "@/lib/amplification";
import { ManifestPanel } from "./manifest-panel";
import { PromoActions } from "./promo-actions";
import { PromoStatusBadge } from "./promo-status-badge";
import { RenderPassButton } from "./render-pass-button";
import { RenderProgressPanel } from "./render-progress-panel";
import { StoryboardTimeline } from "./storyboard-timeline";
import { VariantPlayer } from "./variant-player";

export function PromoDetailView({ jobId }: { jobId: string }) {
  const { data: promo, isLoading, error, refetch } = usePromo(jobId);
  // Shares the poll (and the cache entry) the progress panel already owns, so
  // the header badge and the render button track a live pass instead of the
  // detail payload's snapshot.
  const { data: progress } = usePromoProgress(jobId);

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
    // A stale bookmark, a deleted promo, or Back after a delete all land here.
    // Those are 404s: retrying re-reads the same absent `storyboards/<id>.json`
    // and fails identically forever, so offering Retry as the ONLY action left
    // escape entirely to the global sidebar. A transient failure (API down, 502
    // from B2) is the opposite — there Retry is the right and only useful action.
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <Card>
        <CardContent className="p-0">
          <ErrorState
            error={error}
            icon={missing ? FileQuestion : undefined}
            title={missing ? "No such promo" : undefined}
            description={
              missing
                ? `There is no storyboards/${jobId}.json in the bucket. The promo was probably deleted, or the link is stale.`
                : undefined
            }
            onRetry={missing ? undefined : () => refetch()}
            action={
              missing ? (
                <>
                  <Button asChild size="sm">
                    <Link href="/promos">All promos</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/promos/new">New promo</Link>
                  </Button>
                </>
              ) : undefined
            }
          />
        </CardContent>
      </Card>
    );
  }

  const { storyboard, manifest, playback, frame_samples: frameSamples } = promo;
  const status = progress?.status === "rendering" ? "rendering" : promo.status;
  const placeholderCapture = storyboard.capture_engine === "placeholder";
  const renderAction = (
    <RenderPassButton
      jobId={jobId}
      title={storyboard.title}
      status={status}
      labelled
      navigateOnSuccess={false}
    />
  );

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
              <PromoStatusBadge status={status} />
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
              status={status}
              redirectAfterDelete="/promos"
              showView={false}
              // The labelled `Edit storyboard` button beside this already covers
              // the pencil, and the render action is labelled here because this
              // is where the goal's primary action lives.
              showEdit={false}
              labelledRender
            />
          </div>
        </div>
      </div>

      {placeholderCapture ? (
        // The capture never fails a create — it degrades to a Pillow-drawn card.
        // Without this the promo silently became a promo *of a synthetic card*,
        // discoverable only by watching the finished MP4.
        <Alert className="animate-fade-in">
          <ImageOff className="h-4 w-4" />
          <AlertTitle>Built from placeholder captures, not the product UI</AlertTitle>
          <AlertDescription className="block">
            {storyboard.capture_note ||
              "This promo's capture fell back to a Pillow-drawn placeholder card."}{" "}
            Fix the cause, re-capture from{" "}
            <Link href="/ingest" className="underline">
              Ingest
            </Link>
            , then render a new pass to replace the synthetic cards.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="animate-fade-in-up stagger-2">
        <RenderProgressPanel jobId={jobId} />
      </div>

      <div className="animate-fade-in-up stagger-3 space-y-4">
        <h2 className="section-title text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Delivered variants
        </h2>
        {/* The empty panels name the render as the next step, so they carry the
            control too — the app's own EmptyState pattern (see /promos). */}
        <VariantPlayer playback={playback} emptyAction={renderAction} />
      </div>

      <div className="animate-fade-in-up stagger-4 grid gap-6 lg:grid-cols-2">
        <StoryboardTimeline storyboard={storyboard} />
        <ManifestPanel
          manifest={manifest}
          frameSamples={frameSamples}
          emptyAction={renderAction}
        />
      </div>
    </div>
  );
}
