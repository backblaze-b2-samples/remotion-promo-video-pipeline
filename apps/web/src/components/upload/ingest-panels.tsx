"use client";

import { useState } from "react";
import Link from "next/link";

import { Skeleton } from "@/components/ui/skeleton";
import { normalizeProductParam, productQuery } from "@/lib/product-slug";
import { usePromoDefaults } from "@/lib/queries";
import { AssetUploadForm } from "./asset-upload-form";
import { CaptureForm } from "./capture-form";

/**
 * Holds the one piece of state both ingest panels share: which product the
 * material belongs to. Kept here rather than duplicated so a capture and an
 * upload in the same session can never disagree about the product prefix.
 *
 * It also owns the page's intro copy, because that copy's two onward links have
 * to carry this product. They used to be static `/library` and `/promos/new`
 * hrefs on a server component, so "create a promo that uses them" landed on a
 * form re-seeded with `demo-product` — a promo built against a different prefix
 * than the assets that had just been ingested.
 *
 * The panels only mount once the server defaults have loaded, so the initial
 * product/URL are real `useState` initial values — no effect syncing server
 * data into state after the fact.
 */
export function IngestPanels() {
  const { data: defaults, isLoading } = usePromoDefaults();

  if (isLoading || !defaults) {
    return (
      <div className="space-y-8">
        <IngestIntro />
        <div className="animate-fade-in-up stagger-2 max-w-3xl space-y-6">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return <IngestPanelsReady product={defaults.product} url={defaults.capture_url} />;
}

function IngestPanelsReady({ product, url }: { product: string; url: string }) {
  const [chosenProduct, setChosenProduct] = useState(product);

  return (
    <div className="space-y-8">
      <IngestIntro product={chosenProduct} />
      <div className="animate-fade-in-up stagger-2 max-w-3xl space-y-6">
        <CaptureForm
          product={chosenProduct}
          onProductChange={setChosenProduct}
          initialUrl={url}
        />
        <AssetUploadForm product={chosenProduct} />
      </div>
    </div>
  );
}

/**
 * The page header. `product` is whatever the panels below are currently filing
 * material under; both onward links carry it as `?product=`, so Library opens
 * scoped to it and the create form opens pre-filled with it. Before the defaults
 * resolve there is no product yet and the links fall back to their own defaults.
 */
function IngestIntro({ product }: { product?: string }) {
  // A half-typed or malformed slug is neither shown as a prefix (it is not the key
  // the backend would write) nor carried in the links; the copy falls back to the
  // generic form and the targets to their own defaults.
  const slug = normalizeProductParam(product);
  const scope = productQuery(slug);

  return (
    <div className="animate-fade-in border-b border-border pb-5">
      <h1 className="page-title">Ingest</h1>
      <p className="mt-1.5 max-w-prose text-sm text-muted-foreground text-pretty">
        Two ways material enters the bucket: capture a live page with Playwright, or
        upload a file you already have. Both land under{" "}
        <code className="font-mono text-xs">assets/{slug ?? "<product>"}/</code> so
        the scoped{" "}
        <Link href={`/library${scope}`} className="underline">
          Library
        </Link>{" "}
        and the renderer can find them — then{" "}
        <Link href={`/promos/new${scope}`} className="underline">
          create a promo
        </Link>{" "}
        that uses them.
      </p>
    </div>
  );
}
