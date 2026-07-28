"use client";

import { useMemo, useState } from "react";
import { LayoutTemplate } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { useShotCards } from "@/lib/queries";

const ALL = "all";

export function ShotCardBrowser() {
  const { data: library, isLoading, error, refetch } = useShotCards();
  const [category, setCategory] = useState(ALL);

  const categories = useMemo(() => {
    const found = new Set((library?.cards ?? []).map((card) => card.category));
    return [ALL, ...Array.from(found).sort()];
  }, [library]);

  const cards = (library?.cards ?? []).filter(
    (card) => category === ALL || card.category === category,
  );

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  if (error || !library) {
    return (
      <Card>
        <CardContent className="p-0">
          <ErrorState error={error} onRetry={() => refetch()} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-end justify-between gap-4 p-5">
          <div className="space-y-2">
            <Label htmlFor="card-category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="card-category" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option === ALL ? "All categories" : option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="max-w-md text-xs text-muted-foreground">
            {library.cards.length} of {library.upstream_card_count} upstream cards are
            implemented here — one from each category. The full taxonomy lives in{" "}
            <a
              href={library.upstream}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              video-shotcraft
            </a>
            .
          </p>
        </CardContent>
      </Card>

      {cards.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={LayoutTemplate}
              title="No cards in this category"
              description="Pick another category to see the implemented cards."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cards.map((card) => (
            <Card key={card.id} className="card-hover">
              <CardHeader className="border-b border-border py-4 px-5">
                <CardTitle className="card-title flex flex-wrap items-center gap-2">
                  {card.title}
                  <Badge variant="outline" className="text-[10px]">
                    {card.category}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {card.energy}
                  </Badge>
                  {card.uses_capture ? (
                    <Badge variant="outline" className="text-[10px]">
                      uses capture
                    </Badge>
                  ) : null}
                </CardTitle>
                <CardDescription className="font-mono text-[11px]">
                  {card.id} · {card.default_duration_frames} frames default
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 p-5 text-sm">
                <p>{card.purpose}</p>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Pitfalls
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                    {card.pitfalls.map((pitfall) => (
                      <li key={pitfall}>{pitfall}</li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
