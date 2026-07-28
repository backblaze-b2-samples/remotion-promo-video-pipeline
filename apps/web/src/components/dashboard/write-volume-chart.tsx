"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { usePassVolume } from "@/lib/queries";
import { formatAmplification, amplificationRatio } from "@/lib/amplification";
import { humanizeBytes } from "@/lib/utils";

const chartConfig = {
  frame_bytes: { label: "Frames (intermediate)", color: "var(--chart-1)" },
  variant_bytes: { label: "Variants (delivered)", color: "var(--chart-2)" },
} satisfies ChartConfig;

const skeletonBarHeights = ["h-32", "h-24", "h-36", "h-28", "h-40", "h-24", "h-32"];

function ChartSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="h-[240px] w-full rounded-md border border-border bg-muted/20 px-4 py-4"
    >
      <span className="sr-only">Loading write volume per pass</span>
      <div aria-hidden className="flex h-full items-end gap-3">
        {skeletonBarHeights.map((height, i) => (
          <Skeleton
            key={`${height}-${i}`}
            className={`${height} min-w-0 flex-1 motion-reduce:animate-none`}
          />
        ))}
      </div>
    </div>
  );
}

export function WriteVolumeChart() {
  const { data: volume, isLoading, error, refetch } = usePassVolume(8);

  const data = useMemo(
    () =>
      (volume ?? []).map((point) => ({
        label: point.label,
        frame_bytes: point.frame_bytes,
        variant_bytes: point.variant_bytes,
      })),
    [volume],
  );

  const totals = data.reduce(
    (acc, point) => ({
      frames: acc.frames + point.frame_bytes,
      variants: acc.variants + point.variant_bytes,
    }),
    { frames: 0, variants: 0 },
  );

  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">Bytes written per pass</CardTitle>
        <CardDescription className="text-xs">
          Intermediate frames vs delivered video, last 8 passes
        </CardDescription>
        <CardAction className="text-right self-center">
          {isLoading ? (
            <div aria-hidden className="space-y-1">
              <Skeleton className="ml-auto h-2.5 w-10 motion-reduce:animate-none" />
              <Skeleton className="ml-auto h-6 w-12 motion-reduce:animate-none" />
            </div>
          ) : (
            <>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Ratio
              </div>
              <div className="text-lg font-semibold tabular-nums tracking-tight leading-tight">
                {formatAmplification(
                  amplificationRatio(totals.frames, totals.variants),
                )}
              </div>
            </>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="p-5">
        {isLoading ? (
          <ChartSkeleton />
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : data.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No render passes yet"
            description="Render a promo to see how many intermediate bytes a finished MP4 costs."
          />
        ) : (
          <ChartContainer config={chartConfig} className="h-[240px] w-full">
            <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                fontSize={10}
                interval={0}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={6}
                fontSize={10}
                width={54}
                tickFormatter={(value: number) => humanizeBytes(value)}
              />
              <ChartTooltip
                cursor={{ fill: "var(--accent-subtle)" }}
                content={
                  <ChartTooltipContent
                    formatter={(value) => humanizeBytes(Number(value))}
                  />
                }
              />
              <Bar
                dataKey="frame_bytes"
                fill="var(--color-frame_bytes)"
                radius={[4, 4, 0, 0]}
                animationDuration={500}
              />
              <Bar
                dataKey="variant_bytes"
                fill="var(--color-variant_bytes)"
                radius={[4, 4, 0, 0]}
                animationDuration={500}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
