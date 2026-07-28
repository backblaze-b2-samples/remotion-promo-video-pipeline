import { PromoCreateForm } from "@/components/promos/promo-create-form";

// `?product=<slug>` pre-fills the product field instead of the server default —
// `/ingest` links here with the product whose assets were just uploaded, and
// re-seeding `demo-product` silently pointed the promo at a different prefix than
// the one holding the user's material.
export default async function NewPromoPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string | string[] }>;
}) {
  const { product } = await searchParams;

  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <h1 className="page-title">New promo</h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted-foreground text-pretty">
          Creating a promo captures the product UI, expands the chosen preset into
          beat-snapped shots, and writes{" "}
          <code className="font-mono text-xs">storyboards/&lt;id&gt;.json</code> to B2 at
          revision 1. Nothing renders until you hit Render.
        </p>
      </div>
      <div className="animate-fade-in-up stagger-2 max-w-3xl">
        <PromoCreateForm productParam={product} />
      </div>
    </div>
  );
}
