"use client";

import Image from "next/image";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import type { AssetGroup } from "@/lib/asset-groups";

/**
 * One asset kind for one product: captures as a thumbnail grid, everything else
 * as a list with inline players.
 *
 * A kind with nothing in it still renders — as "0 objects" plus one line saying
 * how to populate *that* kind. Dropping empty kinds meant a product with a single
 * brand file showed one card and empty space below it, so nothing on screen said
 * captures, an audio bed or SFX were part of a product's material at all.
 */
export function AssetGroupCard({ group }: { group: AssetGroup }) {
  const count = group.entries.length;

  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">{group.label}</CardTitle>
        <CardDescription className="text-xs">
          {count} {count === 1 ? "object" : "objects"}
        </CardDescription>
      </CardHeader>
      <CardContent className={count === 0 ? "p-0" : "p-5"}>
        {count === 0 ? (
          <EmptyState title={group.emptyTitle} description={group.emptyHint} />
        ) : group.kind === "capture" ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.entries.map((entry) => (
              <figure key={entry.key} className="space-y-2">
                <div className="relative aspect-video overflow-hidden rounded border border-border bg-muted">
                  {entry.url ? (
                    // Presigned, short-lived: skip Next's optimizer cache.
                    <Image
                      src={entry.url}
                      alt={entry.name}
                      fill
                      unoptimized
                      sizes="(min-width: 1024px) 320px, 50vw"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <figcaption className="space-y-1 text-[11px] text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">
                    {entry.group}
                  </Badge>{" "}
                  {entry.name} · {entry.size_human}
                  <div className="truncate font-mono">{entry.key}</div>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <ul className="space-y-3">
            {group.entries.map((entry) => (
              <li key={entry.key} className="space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{entry.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {entry.size_human} · {formatDate(entry.updated_at)}
                  </span>
                </div>
                {entry.url && entry.content_type.startsWith("audio/") ? (
                  <audio controls preload="none" src={entry.url} className="w-full" />
                ) : null}
                <div className="truncate font-mono text-[11px] text-muted-foreground">
                  {entry.key}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
