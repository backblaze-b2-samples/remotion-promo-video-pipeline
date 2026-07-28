"use client";

import { useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { usePromoDefaults } from "@/lib/queries";
import { AssetUploadForm } from "./asset-upload-form";
import { CaptureForm } from "./capture-form";

/**
 * Holds the one piece of state both ingest panels share: which product the
 * material belongs to. Kept here rather than duplicated so a capture and an
 * upload in the same session can never disagree about the product prefix.
 *
 * The panels only mount once the server defaults have loaded, so the initial
 * product/URL are real `useState` initial values — no effect syncing server
 * data into state after the fact.
 */
export function IngestPanels() {
  const { data: defaults, isLoading } = usePromoDefaults();

  if (isLoading || !defaults) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return <IngestPanelsReady product={defaults.product} url={defaults.capture_url} />;
}

function IngestPanelsReady({ product, url }: { product: string; url: string }) {
  const [chosenProduct, setChosenProduct] = useState(product);

  return (
    <div className="space-y-6">
      <CaptureForm
        product={chosenProduct}
        onProductChange={setChosenProduct}
        initialUrl={url}
      />
      <AssetUploadForm product={chosenProduct} />
    </div>
  );
}
