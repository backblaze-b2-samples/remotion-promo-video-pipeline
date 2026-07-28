"use client";

import Link from "next/link";
import Image from "next/image";
import { Film } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FetchingState } from "@/components/ui/fetching-state";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { usePromos } from "@/lib/queries";
import { formatAmplification, formatDuration } from "@/lib/amplification";
import { formatDate } from "@/lib/utils";
import { PromoActions } from "./promo-actions";
import { PromoStatusBadge } from "./promo-status-badge";

export function PromoTable() {
  const { data: promos = [], isLoading, error, refetch } = usePromos();

  return (
    <Card>
      <CardContent className="p-0">
        {isLoading ? (
          // Four unlabelled grey bars said nothing about what was happening or
          // where the data comes from. The wait itself is now ~1s (the API fetches
          // every storyboard + manifest concurrently instead of two blocking B2
          // GETs per row), but on a big bucket it is still a wait, so it says so.
          <FetchingState
            className="p-4"
            label={
              <>
                Reading every{" "}
                <code className="font-mono">storyboards/&lt;id&gt;.json</code> and
                its manifest from B2...
              </>
            }
          />
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : promos.length === 0 ? (
          <EmptyState
            icon={Film}
            title="No promos yet"
            description="A promo is a storyboard plus its render passes. Create one to run a first pass."
            action={
              <Button asChild size="sm">
                <Link href="/promos/new">New promo</Link>
              </Button>
            }
          />
        ) : (
          <>
            <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-[92px] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Poster
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Promo
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Storyboard
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Amplification
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Updated
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {promos.map((promo) => (
                <TableRow key={promo.job_id} className="table-row-hover">
                  <TableCell>
                    <div className="relative h-11 w-20 overflow-hidden rounded border border-border bg-muted">
                      {promo.poster_url ? (
                        // Presigned B2 URL with a short TTL, so Next's image
                        // optimizer is bypassed (`unoptimized`) — it would cache
                        // a URL that expires.
                        <Image
                          src={promo.poster_url}
                          alt={`Poster frame for ${promo.title}`}
                          fill
                          unoptimized
                          sizes="80px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Film
                            aria-hidden
                            className="h-4 w-4 text-muted-foreground"
                          />
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/promos/${promo.job_id}`}
                      className="font-medium hover:underline"
                    >
                      {promo.title}
                    </Link>
                    <div className="text-[11px] text-muted-foreground">
                      {promo.product} · {promo.variants.length} variants
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <div className="font-mono">{promo.preset}</div>
                    <div>
                      {formatDuration(promo.duration_frames, promo.fps)} ·{" "}
                      {promo.bpm} BPM · rev {promo.revision}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">
                    {formatAmplification(promo.amplification_ratio)}
                    <div className="text-[11px] text-muted-foreground">
                      {promo.passes} {promo.passes === 1 ? "pass" : "passes"}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDate(promo.updated_at)}
                  </TableCell>
                  <TableCell>
                    <PromoStatusBadge status={promo.status} />
                  </TableCell>
                  <TableCell>
                    <PromoActions
                      jobId={promo.job_id}
                      title={promo.title}
                      status={promo.status}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            </Table>
            {/* The count the loading state promised, so "is that everything?" has
                an answer on screen rather than requiring a row count by eye. */}
            <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
              {promos.length.toLocaleString("en-US")}{" "}
              {promos.length === 1 ? "promo" : "promos"} in{" "}
              <code className="font-mono">storyboards/</code>, newest first.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
