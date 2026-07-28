import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { StoryboardEditor } from "@/components/promos/storyboard-editor";

export default async function EditPromoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-8">
      <div className="animate-fade-in space-y-3 border-b border-border pb-5">
        <Link
          href={`/promos/${id}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to promo
        </Link>
        <h1 className="page-title">Edit storyboard</h1>
        <p className="max-w-prose text-sm text-muted-foreground text-pretty">
          Reorder shots, swap cards, retime, and rewrite copy. Saving bumps the
          storyboard&apos;s revision and re-snaps every boundary to the BPM grid; the
          next render then writes a fresh{" "}
          <code className="font-mono text-xs">frames/&lt;id&gt;/pass-NN/</code> tree.
        </p>
      </div>
      <div className="animate-fade-in-up stagger-2">
        <StoryboardEditor jobId={id} />
      </div>
    </div>
  );
}
