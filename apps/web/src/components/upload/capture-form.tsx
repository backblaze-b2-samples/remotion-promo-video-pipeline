"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Camera, Film, FolderOpen, ImageOff } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { InFlightState } from "@/components/ui/in-flight-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { captureBudgetNote, captureBudgetSeconds } from "@/lib/capture";
import { productQuery } from "@/lib/product-slug";
import { useCreateCaptures, usePreviewUrl, usePromoDefaults } from "@/lib/queries";
import type { CaptureResponse } from "@remotion-promo-video-pipeline/shared";

export function CaptureForm({
  product,
  onProductChange,
  initialUrl,
}: {
  product: string;
  onProductChange: (product: string) => void;
  /** Safe default from the server, used as the field's initial value. */
  initialUrl: string;
}) {
  const { data: defaults } = usePromoDefaults();
  const capture = useCreateCaptures();
  const [url, setUrl] = useState(initialUrl);
  const [viewports, setViewports] = useState<string[]>(["desktop"]);
  const [result, setResult] = useState<CaptureResponse | null>(null);

  const viewportOptions = defaults?.viewport_options ?? [];

  const onCapture = () => {
    // Clear the previous attempt BEFORE the next one starts. A failed capture
    // returns 200 with `engine: "placeholder"` and a note naming the URL that
    // failed, so leaving it on screen meant a 10.9s retry showed "Capturing..."
    // and "could not capture <old URL>" at the same time — an error state
    // accusing a URL the user had already corrected in the field above.
    setResult(null);
    capture.mutate(
      { product, url, viewports, accent: defaults?.accent ?? "ink-amber" },
      {
        onSuccess: (response) => {
          setResult(response);
          toast.success(
            response.engine === "playwright"
              ? `Captured ${response.captures.length} viewports`
              : `Wrote ${response.captures.length} placeholder cards`,
          );
        },
        onError: (error) =>
          toast.error("Capture failed", { description: error.message }),
      },
    );
  };

  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">Capture from a URL</CardTitle>
        <CardDescription className="text-xs">
          Playwright Chromium at{" "}
          <code className="font-mono">device_scale_factor=2</code>, straight into{" "}
          <code className="font-mono">
            assets/&lt;product&gt;/captures/&lt;viewport&gt;/
          </code>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="capture-product">Product slug</Label>
            <Input
              id="capture-product"
              value={product}
              placeholder={defaults?.product}
              onChange={(event) => onProductChange(event.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              A safe default is{" "}
              <code className="font-mono">{defaults?.product ?? "demo-product"}</code>.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="capture-url">Page URL</Label>
            <Input
              id="capture-url"
              value={url}
              placeholder={defaults?.capture_url}
              onChange={(event) => setUrl(event.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              A safe default is{" "}
              <code className="font-mono">
                {defaults?.capture_url ?? "http://localhost:3000"}
              </code>{" "}
              — this app&apos;s own UI.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Viewports</Label>
          <div className="flex flex-wrap gap-4">
            {viewportOptions.map((viewport) => (
              <label
                key={viewport.id}
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <Checkbox
                  checked={viewports.includes(viewport.id)}
                  onCheckedChange={(checked) =>
                    setViewports((current) =>
                      checked
                        ? [...current, viewport.id]
                        : current.filter((id) => id !== viewport.id),
                    )
                  }
                />
                {viewport.label}
              </label>
            ))}
          </div>
        </div>

        {/* The same 10-20s-per-viewport capture that gets a stage breakdown, a
            determinate bar and an elapsed clock on /promos/new. It used to get
            only a button spinner here, so the identical operation looked hung on
            one surface and healthy on the other. */}
        {capture.isPending ? (
          <InFlightState
            title="Capturing the product UI"
            budgetSeconds={captureBudgetSeconds(viewports.length)}
            budgetNote={captureBudgetNote(viewports.length)}
          >
            Launching Chromium &rarr; loading{" "}
            <code className="font-mono">{url}</code> &rarr; waiting for the page to
            stop being a skeleton &rarr; screenshotting{" "}
            {Math.max(1, viewports.length)}{" "}
            {viewports.length === 1 ? "viewport" : "viewports"} at 2x &rarr;
            uploading the PNGs to B2.
          </InFlightState>
        ) : null}

        {result?.note ? (
          <Alert>
            <ImageOff className="h-4 w-4" />
            <AlertTitle>Placeholder captures</AlertTitle>
            <AlertDescription>{result.note}</AlertDescription>
          </Alert>
        ) : null}

        {result ? <CaptureResult result={result} /> : null}

        <div className="flex justify-end">
          <Button
            onClick={onCapture}
            disabled={capture.isPending || !product || !url || viewports.length === 0}
          >
            <Camera className="h-3.5 w-3.5" />
            {capture.isPending ? "Capturing..." : "Capture now"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * What a finished capture leads to.
 *
 * A bare list of monospace keys was the ONLY thing a successful capture added to
 * this page: no proof of what was shot, and no way onward — `/ingest` is the nav
 * entry that most literally matches "capture the product UI", so a first-time
 * user finished here with nothing pointing at the goal. Now it shows the frame
 * that landed and carries both next steps.
 */
function CaptureResult({ result }: { result: CaptureResponse }) {
  const primary =
    result.captures.find((entry) => entry.viewport === "desktop") ?? result.captures[0];
  const { data: preview, isLoading } = usePreviewUrl(primary?.key, !!primary);
  const scope = productQuery(result.product);

  if (!primary) return null;

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="relative h-24 w-40 shrink-0 overflow-hidden rounded border border-border bg-muted">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : preview?.url ? (
            // Presigned B2 URL with a short TTL, so Next's optimizer is bypassed
            // (`unoptimized`) — it would cache a URL that expires.
            <Image
              src={preview.url}
              alt={`Capture of ${result.url} at the ${primary.label} viewport`}
              fill
              unoptimized
              sizes="160px"
              className="object-cover object-top"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageOff aria-hidden className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">
            {result.captures.length}{" "}
            {result.captures.length === 1 ? "capture" : "captures"} in B2 for{" "}
            <code className="font-mono text-xs">{result.product}</code>
          </p>
          <ul className="space-y-0.5 text-[11px] text-muted-foreground">
            {result.captures.map((entry) => (
              <li key={entry.key} className="truncate font-mono">
                {entry.key}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="space-y-2">
        {/* Both actions carry `?product=` — the server's slugified product, which
            is the one the keys above actually live under. Without it the create
            form re-seeded its own default and the promo was built against a
            different prefix than the capture that had just landed. */}
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href={`/promos/new${scope}`}>
              <Film aria-hidden className="h-3.5 w-3.5" />
              New promo
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`/library${scope}`}>
              <FolderOpen aria-hidden className="h-3.5 w-3.5" />
              Open in Library
            </Link>
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Both open scoped to{" "}
          <code className="font-mono">{result.product}</code> — the create form opens
          pre-filled with it, and every shot wires itself to the desktop capture above.
        </p>
      </div>
    </div>
  );
}
