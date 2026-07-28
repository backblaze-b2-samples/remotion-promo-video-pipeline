"use client";

import Link from "next/link";
import { ArrowRight, Film } from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { usePromos } from "@/lib/queries";
import { formatAmplification, formatDuration } from "@/lib/amplification";
import { formatDate } from "@/lib/utils";
import { PromoStatusBadge } from "@/components/promos/promo-status-badge";

export function RecentRendersTable() {
  const { data: promos = [], isLoading, error, refetch } = usePromos();
  const recent = promos.slice(0, 8);

  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">Recent renders</CardTitle>
        <CardAction className="self-center">
          <Link
            href="/promos"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            View all
            <ArrowRight className="h-3 w-3" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : recent.length === 0 ? (
          <EmptyState
            icon={Film}
            title="No promos yet"
            description="Create one from Promos → New promo to run a first render pass."
          />
        ) : (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-[34%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Promo
                </TableHead>
                <TableHead className="w-[13%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Rev
                </TableHead>
                <TableHead className="w-[13%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Ratio
                </TableHead>
                <TableHead className="w-[20%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Updated
                </TableHead>
                <TableHead className="w-[20%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((promo) => (
                <TableRow key={promo.job_id} className="table-row-hover">
                  <TableCell className="font-medium">
                    <Link href={`/promos/${promo.job_id}`} className="block truncate hover:underline">
                      {promo.title}
                    </Link>
                    <span className="text-[11px] text-muted-foreground">
                      {promo.product} · {formatDuration(promo.duration_frames, promo.fps)}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground tabular-nums">
                    r{promo.revision} / p{promo.passes}
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">
                    {formatAmplification(promo.amplification_ratio)}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
                    {formatDate(promo.updated_at)}
                  </TableCell>
                  <TableCell>
                    <PromoStatusBadge status={promo.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
