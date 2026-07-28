"use client";

import { useState } from "react";
import { FolderOpen, Music } from "lucide-react";

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
import { FetchingState } from "@/components/ui/fetching-state";
import { AssetGroupCard } from "@/components/library/asset-group-card";
import { groupAssetsByKind, isProductEmpty } from "@/lib/asset-groups";
import { normalizeProductParam } from "@/lib/product-slug";
import { useAssetLibrary, useCreateDemoAudio, useProducts } from "@/lib/queries";
import { toast } from "sonner";

/**
 * @param productParam `?product=` from the URL — how `/ingest` hands over the
 *   product a user just ingested under. Honoured only when the bucket actually
 *   has that product, because the picker below is a `Select` over a fixed list.
 */
export function AssetLibrary({ productParam }: { productParam?: string | string[] }) {
  const { data: products, isLoading: productsLoading } = useProducts();

  // The picker only mounts once the product list has loaded, so the initial
  // selection is a real `useState` initial value rather than an effect syncing
  // server data into state after first paint.
  if (productsLoading || !products) {
    // This is the slow half of the wait: the product list is derived by listing
    // two B2 prefixes, and nothing product-scoped can be fetched until it lands.
    // Unlabelled grey bars for several seconds said none of that.
    return (
      <FetchingState
        rows={3}
        rowClassName="h-32 w-full"
        label={
          <>
            Listing <code className="font-mono">assets/</code> and{" "}
            <code className="font-mono">storyboards/</code> in B2 to find which
            products exist — the product list has to resolve before its assets can
            load...
          </>
        }
      />
    );
  }

  const requested = normalizeProductParam(productParam);
  const initialProduct =
    requested && products.products.includes(requested)
      ? requested
      : (products.products[0] ?? products.default);

  return (
    <AssetLibraryReady
      products={products.products}
      initialProduct={initialProduct}
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

  // Every kind, including the empty ones — a product with only brand files still
  // has to show that captures, a bed and SFX exist and how to add them.
  const grouped = groupAssetsByKind(library?.entries);

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
        <FetchingState
          rows={3}
          rowClassName="h-32 w-full"
          label={
            <>
              Listing <code className="font-mono">assets/{product}/</code> in B2 —
              captures, brand files, the audio bed and SFX...
            </>
          }
        />
      ) : error ? (
        <Card>
          <CardContent className="p-0">
            <ErrorState error={error} onRetry={() => refetch()} />
          </CardContent>
        </Card>
      ) : isProductEmpty(grouped) ? (
        // Nothing of ANY kind: one whole-product empty state rather than five
        // identical empty cards.
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
        grouped.map((group) => <AssetGroupCard key={group.kind} group={group} />)
      )}
    </div>
  );
}
