"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Camera } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateCaptures, usePromoDefaults } from "@/lib/queries";
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

        {result?.note ? (
          <Alert>
            <AlertTitle>Placeholder captures</AlertTitle>
            <AlertDescription>{result.note}</AlertDescription>
          </Alert>
        ) : null}

        {result ? (
          <ul className="space-y-1 text-[11px] text-muted-foreground">
            {result.captures.map((entry) => (
              <li key={entry.key} className="font-mono truncate">
                {entry.key}
              </li>
            ))}
          </ul>
        ) : null}

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
