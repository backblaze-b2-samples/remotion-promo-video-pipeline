import Link from "next/link";
import { Film } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PromoTable } from "@/components/promos/promo-table";

export default function PromosPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <h1 className="page-title">Promos</h1>
          <p className="mt-1.5 max-w-prose text-sm text-muted-foreground text-pretty">
            Each promo is a storyboard in{" "}
            <code className="font-mono text-xs">storyboards/&lt;id&gt;.json</code> plus
            every render pass recorded in{" "}
            <code className="font-mono text-xs">manifests/&lt;id&gt;.json</code>. Editing
            a storyboard bumps its revision; the next render becomes a new pass.
          </p>
        </div>
        <Button asChild size="sm" className="h-8 shrink-0">
          <Link href="/promos/new">
            <Film aria-hidden="true" className="h-3.5 w-3.5" />
            New promo
          </Link>
        </Button>
      </div>
      <div className="animate-fade-in-up stagger-2">
        <PromoTable />
      </div>
    </div>
  );
}
