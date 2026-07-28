import Link from "next/link";
import { Film } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { RecentRendersTable } from "@/components/dashboard/recent-renders-table";
import { WriteVolumeChart } from "@/components/dashboard/write-volume-chart";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-prose text-pretty">
            Write amplification first: how many intermediate PNG bytes each
            delivered MP4 byte cost, measured from the delivery manifests in
            Backblaze B2 — not estimated.
          </p>
        </div>
        <Button asChild size="sm" className="h-8">
          <Link href="/promos/new">
            <Film className="h-3.5 w-3.5" />
            New promo
          </Link>
        </Button>
      </div>
      <StatsCards />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="animate-fade-in-up stagger-3">
          <WriteVolumeChart />
        </div>
        <div className="animate-fade-in-up stagger-4">
          <RecentRendersTable />
        </div>
      </div>
    </div>
  );
}
