"use client";

import { useState } from "react";
import Image from "next/image";
import { FolderOpen, Music } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAssetLibrary, useCreateDemoAudio, useProducts } from "@/lib/queries";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import type { AssetEntry } from "@remotion-promo-video-pipeline/shared";

const KIND_LABELS: Record<AssetEntry["kind"], string> = {
  capture: "Captures",
  bgm: "Audio bed",
  sfx: "SFX one-shots",
  brand: "Brand files",
  other: "Other",
};

const KIND_ORDER: AssetEntry["kind"][] = ["capture", "bgm", "sfx", "brand", "other"];

export function AssetLibrary() {
  const { data: products, isLoading: productsLoading } = useProducts();

  // The picker only mounts once the product list has loaded, so the initial
  // selection is a real `useState` initial value rather than an effect syncing
  // server data into state after first paint.
  if (productsLoading || !products) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  return (
    <AssetLibraryReady
      products={products.products}
      initialProduct={products.products[0] ?? products.default}
      fallbackProduct={products.default}
    />
  );
}

function AssetLibraryReady({
  products,
  initialProduct,
  fallbackProduct,
}: {
  products: string[];
  initialProduct: string;
  fallbackProduct: string;
}) {
  const [product, setProduct] = useState(initialProduct);
  const audio = useCreateDemoAudio();
  const { data: library, isLoading, error, refetch } = useAssetLibrary(product);

  const grouped = KIND_ORDER.map((kind) => ({
    kind,
    entries: (library?.entries ?? []).filter((entry) => entry.kind === kind),
  })).filter((group) => group.entries.length > 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b border-border py-4 px-5">
          <CardTitle className="card-title">Scope</CardTitle>
          <CardDescription className="text-xs">
            This view is scoped to{" "}
            <code className="font-mono">{library?.prefix ?? "assets/<product>/"}</code>{" "}
            only. For whole-bucket forensics use{" "}
            <a href="/files" className="underline">
              Files
            </a>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4 p-5">
          <div className="space-y-2">
            <Label htmlFor="library-product">Product</Label>
            <Select value={product} onValueChange={setProduct}>
              <SelectTrigger id="library-product" className="w-64">
                <SelectValue placeholder="Choose a product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((slug) => (
                  <SelectItem key={slug} value={slug}>
                    {slug}
                  </SelectItem>
                ))}
                {products.length === 0 ? (
                  <SelectItem value={fallbackProduct}>{fallbackProduct}</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!product || audio.isPending}
            onClick={() =>
              audio.mutate(
                { product, bpm: 120 },
                {
                  onSuccess: (result) =>
                    toast.success("Audio bed + SFX synthesized", {
                      description: `${result.bed_key} and ${result.sfx.length} one-shots are in B2.`,
                    }),
                  onError: (mutationError) =>
                    toast.error("Could not synthesize audio", {
                      description: mutationError.message,
                    }),
                },
              )
            }
          >
            <Music className="h-3.5 w-3.5" />
            {audio.isPending ? "Synthesizing..." : "Synthesize demo audio"}
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="p-0">
            <ErrorState error={error} onRetry={() => refetch()} />
          </CardContent>
        </Card>
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={FolderOpen}
              title="No assets for this product yet"
              description="Capture the product UI from Ingest, or synthesize the demo audio bed above."
            />
          </CardContent>
        </Card>
      ) : (
        grouped.map((group) => (
          <Card key={group.kind}>
            <CardHeader className="border-b border-border py-4 px-5">
              <CardTitle className="card-title">{KIND_LABELS[group.kind]}</CardTitle>
              <CardDescription className="text-xs">
                {group.entries.length} objects
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              {group.kind === "capture" ? (
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
        ))
      )}
    </div>
  );
}
