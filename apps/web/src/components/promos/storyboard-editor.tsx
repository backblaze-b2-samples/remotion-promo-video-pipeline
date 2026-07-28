"use client";

import { useReducer, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import {
  usePromo,
  usePromoDefaults,
  useShotCards,
  useUpdatePromo,
} from "@/lib/queries";
import type { PromoDetail } from "@remotion-promo-video-pipeline/shared";
import {
  tierFromMaster,
  variantGeometry,
} from "@remotion-promo-video-pipeline/shared/src/variant-geometry";
import { formatDuration } from "@/lib/amplification";
import {
  MAX_SHOTS,
  MAX_SHOT_FRAMES,
  MIN_SHOT_FRAMES,
  editorReducer,
  shotsFromStoryboard,
  totalFrames,
  withStartFrames,
} from "@/lib/storyboard-editor";

export function StoryboardEditor({ jobId }: { jobId: string }) {
  const { data: promo, isLoading, error, refetch } = usePromo(jobId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (error || !promo) {
    return (
      <Card>
        <CardContent className="p-0">
          <ErrorState error={error} onRetry={() => refetch()} />
        </CardContent>
      </Card>
    );
  }

  // The form mounts only once the stored storyboard is in hand, so every field
  // starts PRE-FILLED from it via `useState` initial values. No default hints
  // here — those belong on the create form only.
  return <StoryboardEditorForm jobId={jobId} promo={promo} />;
}

function StoryboardEditorForm({
  jobId,
  promo,
}: {
  jobId: string;
  promo: PromoDetail;
}) {
  const router = useRouter();
  const { data: library } = useShotCards();
  const { data: defaults } = usePromoDefaults();
  const update = useUpdatePromo(jobId);

  const [shots, dispatch] = useReducer(
    editorReducer,
    shotsFromStoryboard(promo.storyboard),
  );
  const [title, setTitle] = useState(promo.storyboard.title);
  const [bpm, setBpm] = useState(String(promo.storyboard.bpm));
  const [accent, setAccent] = useState(promo.storyboard.accent);
  const [variants, setVariants] = useState<string[]>(promo.storyboard.variants);

  const cards = library?.cards ?? [];
  const sfxOptions = library?.sfx ?? [{ id: "none", label: "No SFX", synthesized: false }];
  const accents = library?.accents ?? [{ id: "ink-amber", label: "Ink Amber" }];
  // Sizes come from THIS storyboard's master frame, not from the server's
  // `RENDER_PRESET` default — a 1080p promo edited while the server defaults to
  // 720p was told its variants were 720p, contradicting the badges on the promo
  // page next door.
  const variantOptions = (defaults?.variant_options ?? []).map((variant) => ({
    ...variant,
    ...variantGeometry(
      variant.id,
      tierFromMaster(promo.storyboard.width, promo.storyboard.height),
    ),
  }));
  const bpmOptions = defaults?.bpm_options ?? [90, 110, 120, 128];
  const total = totalFrames(shots);
  const fps = promo.storyboard.fps;
  // What the pass will ACTUALLY render: the backend force-adds every required
  // variant, so the PNG estimate below has to count them too.
  const effectiveVariants = Array.from(
    new Set([
      ...variantOptions.filter((variant) => variant.required).map((v) => v.id),
      ...variants,
    ]),
  );

  const onSave = () => {
    update.mutate(
      {
        title,
        bpm: Number(bpm),
        accent,
        variants: effectiveVariants,
        shots,
      },
      {
        onSuccess: (storyboard) => {
          toast.success(`Saved revision ${storyboard.revision}`, {
            description:
              "The next render becomes a new pass — that is the write-amplification loop.",
          });
          router.push(`/promos/${jobId}`);
        },
        onError: (mutationError) => {
          toast.error("Could not save the storyboard", {
            description: mutationError.message,
          });
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b border-border py-4 px-5">
          <CardTitle className="card-title">Promo settings</CardTitle>
          <CardDescription className="text-xs">
            Saving bumps revision {promo.storyboard.revision} to{" "}
            {promo.storyboard.revision + 1}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="promo-title">Video title</Label>
              <Input
                id="promo-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="promo-bpm">BPM</Label>
              <Select value={bpm} onValueChange={setBpm}>
                <SelectTrigger id="promo-bpm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {bpmOptions.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option} BPM
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Shot boundaries are re-snapped to this grid on save.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Delivery variants</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {variantOptions.map((variant) => (
                <label
                  key={variant.id}
                  className={`flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm ${
                    variant.required ? "bg-muted/40" : "cursor-pointer"
                  }`}
                >
                  {/* Locked on, because `service/promos.update_promo` force-adds
                      it: an unticked checkbox the backend overrides is a lie
                      about what the pass will write. */}
                  <Checkbox
                    checked={variant.required || variants.includes(variant.id)}
                    disabled={variant.required}
                    onCheckedChange={(checked) =>
                      setVariants((current) =>
                        checked
                          ? [...current, variant.id]
                          : current.filter((id) => id !== variant.id),
                      )
                    }
                  />
                  {variant.label}
                  {variant.required ? (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      always
                    </span>
                  ) : null}
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                    {variant.width}x{variant.height}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Accent theme</Label>
            <RadioGroup
              value={accent}
              onValueChange={setAccent}
              className="flex flex-wrap gap-6"
            >
              {accents.map((option) => (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <RadioGroupItem value={option.id} />
                  {option.label}
                </label>
              ))}
            </RadioGroup>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border py-4 px-5">
          <CardTitle className="card-title">Shots</CardTitle>
          <CardDescription className="text-xs">
            {shots.length} shots · {total} frames · {formatDuration(total, fps)} ·{" "}
            {total * Math.max(1, effectiveVariants.length)} PNGs on the next pass
            across {Math.max(1, effectiveVariants.length)} variants.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-5">
          {withStartFrames(shots).map(({ shot, from }, index) => (
            <div
              key={`${shot.card}-${index}`}
              className="grid gap-3 rounded-md border border-border p-3 lg:grid-cols-12"
            >
              <div className="lg:col-span-3">
                <Label className="text-[11px]" htmlFor={`card-${index}`}>
                  Shot card
                </Label>
                <Select
                  value={shot.card}
                  onValueChange={(value) =>
                    dispatch({ type: "patch", index, patch: { card: value } })
                  }
                >
                  <SelectTrigger id={`card-${index}`} className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cards.map((card) => (
                      <SelectItem key={card.id} value={card.id}>
                        {card.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  f{from}–{from + shot.duration_frames - 1}
                </p>
              </div>

              <div className="lg:col-span-3">
                <Label className="text-[11px]" htmlFor={`headline-${index}`}>
                  Headline
                </Label>
                <Input
                  id={`headline-${index}`}
                  className="mt-1"
                  value={shot.headline}
                  onChange={(event) =>
                    dispatch({
                      type: "patch",
                      index,
                      patch: { headline: event.target.value },
                    })
                  }
                />
              </div>

              <div className="lg:col-span-3">
                <Label className="text-[11px]" htmlFor={`sub-${index}`}>
                  Sub copy
                </Label>
                <Input
                  id={`sub-${index}`}
                  className="mt-1"
                  value={shot.sub}
                  onChange={(event) =>
                    dispatch({ type: "patch", index, patch: { sub: event.target.value } })
                  }
                />
              </div>

              <div className="lg:col-span-1">
                <Label className="text-[11px]" htmlFor={`frames-${index}`}>
                  Frames
                </Label>
                <Input
                  id={`frames-${index}`}
                  className="mt-1 font-mono tabular-nums"
                  type="number"
                  min={MIN_SHOT_FRAMES}
                  max={MAX_SHOT_FRAMES}
                  value={shot.duration_frames}
                  onChange={(event) =>
                    dispatch({
                      type: "patch",
                      index,
                      patch: { duration_frames: Number(event.target.value) },
                    })
                  }
                />
              </div>

              <div className="lg:col-span-1">
                <Label className="text-[11px]" htmlFor={`sfx-${index}`}>
                  SFX
                </Label>
                <Select
                  value={shot.sfx}
                  onValueChange={(value) =>
                    dispatch({ type: "patch", index, patch: { sfx: value } })
                  }
                >
                  <SelectTrigger id={`sfx-${index}`} className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sfxOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end justify-end gap-1 lg:col-span-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={`Move shot ${index + 1} up`}
                  disabled={index === 0}
                  onClick={() => dispatch({ type: "move", index, direction: -1 })}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={`Move shot ${index + 1} down`}
                  disabled={index === shots.length - 1}
                  onClick={() => dispatch({ type: "move", index, direction: 1 })}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  aria-label={`Remove shot ${index + 1}`}
                  disabled={shots.length <= 1}
                  onClick={() => dispatch({ type: "remove", index })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={shots.length >= MAX_SHOTS || cards.length === 0}
            onClick={() =>
              dispatch({
                type: "add",
                card: cards[0]?.id ?? "paper-title-card",
                durationFrames: cards[0]?.default_duration_frames ?? 30,
              })
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Add shot
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/promos/${jobId}`)}
          disabled={update.isPending}
        >
          Cancel
        </Button>
        <Button type="button" onClick={onSave} disabled={update.isPending}>
          {update.isPending ? "Saving..." : `Save revision ${promo.storyboard.revision + 1}`}
        </Button>
      </div>
    </div>
  );
}
