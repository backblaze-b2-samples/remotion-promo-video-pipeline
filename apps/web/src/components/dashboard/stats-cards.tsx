"use client";

import { Film, HardDrive, Layers, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { usePipelineStats } from "@/lib/queries";
import { formatAmplification, formatFrameCount } from "@/lib/amplification";

export function StatsCards() {
  const { data: stats, isLoading, error, refetch } = usePipelineStats();

  // Surface fetch failures inline rather than rendering zeros — that would lie
  // about the bucket state when really the API is unreachable.
  if (error) {
    return (
      <Card>
        <CardContent className="p-0">
          <ErrorState error={error} onRetry={() => refetch()} />
        </CardContent>
      </Card>
    );
  }

  const cards = [
    {
      title: "Write amplification",
      value: formatAmplification(stats?.amplification_ratio),
      icon: TrendingUp,
      hint: "intermediate bytes per delivered byte",
      lead: true,
    },
    {
      title: "Frames archived",
      value: formatFrameCount(stats?.frames_written),
      icon: Layers,
      hint: `${stats?.frame_bytes_human ?? "0 B"} under frames/`,
    },
    {
      title: "Delivered video",
      value: stats?.variant_bytes_human ?? "0 B",
      icon: HardDrive,
      hint: `${stats?.variants_delivered ?? 0} variants under renders/`,
    },
    {
      title: "Render passes",
      value: stats?.passes ?? 0,
      icon: Film,
      hint: `${stats?.promos ?? 0} promos with a manifest`,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, i) => (
        <Card
          key={card.title}
          className={`card-hover animate-fade-in-up stagger-${i + 1} ${
            card.lead ? "border-[var(--brand-b2)]/40" : ""
          }`}
        >
          <CardHeader className="flex flex-row items-center justify-between pt-4 pb-2 px-4 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground">
              {card.title}
            </CardTitle>
            <div className="stat-icon-wrap">
              <card.icon className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="pb-5 px-4">
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="stat-value">{card.value}</div>
                <p className="mt-1 text-[11px] text-muted-foreground">{card.hint}</p>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
