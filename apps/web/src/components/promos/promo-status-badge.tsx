"use client";

import { Badge } from "@/components/ui/badge";
import type { PromoStatus } from "@remotion-promo-video-pipeline/shared";

const LABELS: Record<PromoStatus, { label: string; className: string }> = {
  draft: {
    label: "Draft",
    className: "border-border bg-muted/50 text-muted-foreground",
  },
  rendering: {
    label: "Rendering",
    className: "border-[var(--brand-b2)]/40 bg-[var(--brand-b2)]/10 text-foreground",
  },
  rendered: {
    label: "Rendered",
    className: "border-[var(--success)]/40 bg-[var(--success)]/10 text-foreground",
  },
  failed: {
    label: "Failed",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
};

export function PromoStatusBadge({ status }: { status: PromoStatus }) {
  const entry = LABELS[status] ?? LABELS.draft;
  return (
    <Badge variant="outline" className={`text-[11px] font-medium ${entry.className}`}>
      {entry.label}
    </Badge>
  );
}
