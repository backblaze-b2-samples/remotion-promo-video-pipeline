"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { FileJson } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAmplification, formatFrameCount } from "@/lib/amplification";
import { formatDate, humanizeBytes } from "@/lib/utils";
import type { DeliveryManifest } from "@remotion-promo-video-pipeline/shared";

export function ManifestPanel({
  manifest,
  frameSamples,
  emptyAction,
}: {
  manifest: DeliveryManifest | null;
  frameSamples: string[];
  /** The control the empty state names — see `VariantPlayer`. */
  emptyAction?: ReactNode;
}) {
  if (!manifest || manifest.passes.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={FileJson}
            title="No delivery manifest yet"
            description="The manifest gains one entry per completed pass — revision, shot cards, frame counts and byte totals."
            action={emptyAction}
          />
        </CardContent>
      </Card>
    );
  }

  const passes = [...manifest.passes].reverse();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b border-border py-4 px-5">
          <CardTitle className="card-title">Delivery manifest</CardTitle>
          <CardDescription className="text-xs">
            <code className="font-mono">manifests/{manifest.job_id}.json</code> —{" "}
            {manifest.totals.passes} passes,{" "}
            {formatFrameCount(manifest.totals.frames_written)},{" "}
            {humanizeBytes(manifest.totals.frame_bytes)} of intermediates for{" "}
            {humanizeBytes(manifest.totals.variant_bytes)} delivered (
            {formatAmplification(manifest.totals.amplification_ratio)}).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5">
          <Accordion type="single" collapsible className="w-full">
            {passes.map((pass) => (
              <AccordionItem key={pass.pass_number} value={`pass-${pass.pass_number}`}>
                <AccordionTrigger className="text-sm">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      Pass {pass.pass_number}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      revision {pass.revision}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {formatDate(pass.finished_at)} ·{" "}
                      {formatAmplification(pass.amplification_ratio)} ·{" "}
                      {formatFrameCount(pass.frames_written)}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Variant</TableHead>
                        <TableHead className="text-xs">Size</TableHead>
                        <TableHead className="text-xs">Frames</TableHead>
                        <TableHead className="text-xs">Frame bytes</TableHead>
                        <TableHead className="text-xs">MP4 bytes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pass.variants.map((variant) => (
                        <TableRow key={variant.variant}>
                          <TableCell className="font-mono text-xs">
                            {variant.variant}
                          </TableCell>
                          <TableCell className="font-mono text-xs tabular-nums">
                            {variant.width}x{variant.height}
                          </TableCell>
                          <TableCell className="font-mono text-xs tabular-nums">
                            {variant.frame_count.toLocaleString("en-US")}
                          </TableCell>
                          <TableCell className="font-mono text-xs tabular-nums">
                            {humanizeBytes(variant.frame_bytes)}
                          </TableCell>
                          <TableCell className="font-mono text-xs tabular-nums">
                            {humanizeBytes(variant.variant_bytes)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <p className="text-[11px] text-muted-foreground">
                    Shot cards used: {pass.shot_cards.join(", ")}
                  </p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {frameSamples.length > 0 ? (
        <Card>
          <CardHeader className="border-b border-border py-4 px-5">
            <CardTitle className="card-title">Frames in B2</CardTitle>
            <CardDescription className="text-xs">
              Evenly spaced PNGs read straight out of{" "}
              <code className="font-mono">
                frames/{manifest.job_id}/pass-NN/master-16x9/
              </code>{" "}
              — the intermediates, not the finished video.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {frameSamples.map((url, index) => (
                <div
                  key={url}
                  className="relative h-20 w-36 shrink-0 overflow-hidden rounded border border-border bg-muted"
                >
                  {/* Presigned URLs expire, so `unoptimized` keeps Next's image
                      optimizer from caching a URL that will 403 later. */}
                  <Image
                    src={url}
                    alt={`Sampled render frame ${index + 1}`}
                    fill
                    unoptimized
                    sizes="144px"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
