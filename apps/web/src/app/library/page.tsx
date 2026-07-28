import { AssetLibrary } from "@/components/library/asset-library";

export default function LibraryPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <h1 className="page-title">Asset library</h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted-foreground text-pretty">
          Everything a promo author reuses: product captures at 2x, the synthesized
          audio bed, SFX one-shots and brand files — scoped to one product&apos;s
          prefix, served through presigned URLs so the bucket stays private.
        </p>
      </div>
      <div className="animate-fade-in-up stagger-2">
        <AssetLibrary />
      </div>
    </div>
  );
}
