"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InFlightState } from "@/components/ui/in-flight-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useCreatePromo, usePromoDefaults } from "@/lib/queries";
import { formatDuration } from "@/lib/amplification";
import {
  CAPTURE_TIMEOUT_SECONDS,
  captureBudgetNote,
  captureBudgetSeconds,
} from "@/lib/capture";
import {
  PRODUCT_SLUG_MAX,
  PRODUCT_SLUG_MIN,
  PRODUCT_SLUG_PATTERN,
  resolveProductParam,
} from "@/lib/product-slug";
import type { PromoDefaults } from "@remotion-promo-video-pipeline/shared";
import {
  tierFromMaster,
  variantGeometry,
} from "@remotion-promo-video-pipeline/shared/src/variant-geometry";

// Every finite-option field is a selector; only genuinely open text (product
// slug, title, capture URL) is an Input.
//
// The server's safe defaults arrive as real, editable initial VALUES, and each
// field still explains its default in a `FormDescription`. They used to be
// placeholders only, which made the shortest path to a first render three manual
// retypes of values the server had already sent — and because the grey
// placeholder text reads as pre-filled, the natural first click was a submit that
// returned three inline errors. There is still no autofill button (see AGENTS.md
// §4): nothing is filled in after the user starts typing.
const createSchema = z.object({
  product: z
    .string()
    .min(PRODUCT_SLUG_MIN, `Product slug must be at least ${PRODUCT_SLUG_MIN} characters`)
    .max(PRODUCT_SLUG_MAX)
    .regex(PRODUCT_SLUG_PATTERN, "Letters, numbers, dot, dash and underscore only"),
  title: z.string().min(3, "Give the promo a title").max(120),
  captureUrl: z.string().url("Enter a full URL, e.g. http://localhost:3000"),
  preset: z.string().min(1),
  bpm: z.string().min(1),
  resolution: z.string().min(1),
  accent: z.string().min(1),
  variants: z.array(z.string()).min(1, "Pick at least one delivery variant"),
  viewports: z.array(z.string()).min(1, "Pick at least one capture viewport"),
});

type CreateValues = z.infer<typeof createSchema>;

/**
 * @param productParam `?product=` from the URL — the product `/ingest` just
 *   ingested under. It becomes the product field's initial value; a missing or
 *   malformed slug falls back to the server default. This is a different DEFAULT,
 *   not a new mechanism: the field stays a real, editable, pre-filled value.
 */
export function PromoCreateForm({ productParam }: { productParam?: string | string[] }) {
  const { data: defaults, isLoading, error, refetch } = usePromoDefaults();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-4 p-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error || !defaults) {
    return (
      <Card>
        <CardContent className="p-0">
          <ErrorState error={error} onRetry={() => refetch()} />
        </CardContent>
      </Card>
    );
  }

  // The form mounts only once the server defaults are in hand, so `useForm`
  // gets real defaultValues instead of an effect resetting the form later.
  return <PromoCreateFormFields defaults={defaults} productParam={productParam} />;
}

function PromoCreateFormFields({
  defaults,
  productParam,
}: {
  defaults: PromoDefaults;
  productParam?: string | string[];
}) {
  const router = useRouter();
  const create = useCreatePromo();

  // Every field opens with the server's safe default already in it — selectors
  // pre-selected, free text pre-filled — so the first submit is a working render
  // instead of a guaranteed validation failure.
  const requiredVariants = (defaults.variant_options ?? [])
    .filter((variant) => variant.required)
    .map((variant) => variant.id);

  // A product carried in from `/ingest` wins over the server default: the promo
  // must be built against the prefix the user just filled, not `demo-product`.
  const initialProduct = resolveProductParam(productParam, defaults.product);

  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      product: initialProduct,
      title: defaults.title,
      captureUrl: defaults.capture_url,
      preset: defaults.preset,
      bpm: String(defaults.bpm),
      resolution: `${defaults.width}x${defaults.height}`,
      accent: defaults.accent,
      // Required variants are part of the value, not silently added later, so
      // the PNG estimate below matches what the pass actually writes.
      variants: Array.from(new Set([...requiredVariants, ...defaults.variants])),
      viewports: ["desktop"],
    },
  });

  const presetOptions = defaults.preset_options ?? [];
  const chosenPreset = presetOptions.find((p) => p.id === form.watch("preset"));
  const chosenViewports = form.watch("viewports").length;

  // Variant sizes are re-derived from the RESOLUTION THE USER PICKED, not from
  // the server's `RENDER_PRESET` tier. `/promo-defaults` can only answer for its
  // own default, so selecting 1920x1080 used to label all four variants 720p
  // while the pass went on to deliver 1080p — the same resource described
  // differently on the create form and on the promo page. The aspect ratios still
  // come from `packages/shared/src/variants.json` (one source of truth); only the
  // pixel derivation happens here, through the shared helper the renderer uses.
  const [chosenWidth, chosenHeight] = form.watch("resolution").split("x").map(Number);
  const chosenTier = tierFromMaster(chosenWidth || defaults.width, chosenHeight || defaults.height);
  const variantOptions = (defaults.variant_options ?? []).map((variant) => ({
    ...variant,
    ...variantGeometry(variant.id, chosenTier),
  }));

  const onSubmit = (values: CreateValues) => {
    const [width, height] = values.resolution.split("x").map(Number);
    create.mutate(
      {
        product: values.product.trim(),
        title: values.title.trim(),
        preset: values.preset,
        bpm: Number(values.bpm),
        width,
        height,
        accent: values.accent,
        variants: values.variants,
        capture_url: values.captureUrl.trim(),
        viewports: values.viewports,
      },
      {
        onSuccess: (storyboard) => {
          // A capture NEVER fails a create — it degrades to a Pillow-drawn
          // placeholder card. Reporting that as plain success turned "a promo
          // from a product-UI capture" into a promo of a synthetic card that only
          // showed up when someone watched the finished MP4.
          if (storyboard.capture_engine === "placeholder") {
            toast.warning("Promo created, but the capture fell back", {
              description:
                storyboard.capture_note ||
                "Placeholder cards were used instead of the product UI.",
              duration: 12_000,
            });
          } else {
            toast.success("Promo created", {
              description: `${storyboard.shots.length} shots, beat-snapped to ${storyboard.bpm} BPM.`,
            });
          }
          router.push(`/promos/${storyboard.job_id}`);
        },
        onError: (mutationError) => {
          toast.error("Could not create the promo", {
            description: mutationError.message,
          });
        },
      },
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader className="border-b border-border py-4 px-5">
            <CardTitle className="card-title">Subject</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <FormField
              control={form.control}
              name="product"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product slug</FormLabel>
                  <FormControl>
                    <Input placeholder={defaults.product} {...field} />
                  </FormControl>
                  <FormDescription>
                    Every asset for this promo lands under{" "}
                    <code className="font-mono text-xs">
                      assets/&lt;slug&gt;/
                    </code>{" "}
                    in B2.{" "}
                    {initialProduct === defaults.product ? (
                      <>
                        A safe default is{" "}
                        <code className="font-mono text-xs">{defaults.product}</code>.
                      </>
                    ) : (
                      <>
                        Carried over from Ingest, so this promo uses the material you
                        just uploaded; the server&apos;s safe default is{" "}
                        <code className="font-mono text-xs">{defaults.product}</code>.
                      </>
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Video title</FormLabel>
                  <FormControl>
                    <Input placeholder={defaults.title} {...field} />
                  </FormControl>
                  <FormDescription>
                    Used as the headline copy in the title and outro shots. A safe
                    default is &ldquo;{defaults.title}&rdquo;.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="captureUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Capture URL</FormLabel>
                  <FormControl>
                    <Input placeholder={defaults.capture_url} {...field} />
                  </FormControl>
                  <FormDescription>
                    Captured with Playwright at 2x on create. A safe default is{" "}
                    <code className="font-mono text-xs">{defaults.capture_url}</code>{" "}
                    — this app&apos;s own UI, so a first run needs nothing external.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="viewports"
              render={() => (
                <FormItem>
                  <FormLabel>Capture viewports</FormLabel>
                  <div className="flex flex-wrap gap-4">
                    {(defaults.viewport_options ?? []).map((viewport) => (
                      <FormField
                        key={viewport.id}
                        control={form.control}
                        name="viewports"
                        render={({ field }) => (
                          <label className="flex cursor-pointer items-center gap-2 text-sm">
                            <Checkbox
                              checked={field.value.includes(viewport.id)}
                              onCheckedChange={(checked) =>
                                field.onChange(
                                  checked
                                    ? [...field.value, viewport.id]
                                    : field.value.filter((v) => v !== viewport.id),
                                )
                              }
                            />
                            {viewport.label}
                          </label>
                        )}
                      />
                    ))}
                  </div>
                  {/* Honest about what the extra viewports buy. `build_shots`
                      wires EVERY shot to the product's desktop capture, so
                      ticking Tablet and Mobile costs a real screenshot round
                      each (up to 20s apiece) and produces Library material, not
                      anything this promo renders. Saying so beats a control that
                      silently charges for nothing. */}
                  <FormDescription>
                    Screenshots land in{" "}
                    <code className="font-mono text-xs">
                      assets/&lt;slug&gt;/captures/&lt;viewport&gt;/
                    </code>
                    . This promo&apos;s shots are all wired to the{" "}
                    <strong className="font-medium">desktop</strong> capture; extra
                    viewports are shot as reusable Library material and add up to{" "}
                    {CAPTURE_TIMEOUT_SECONDS}s each to this create. Without Chromium
                    installed
                    (&nbsp;<code className="font-mono text-xs">pnpm run setup:capture</code>&nbsp;)
                    these fall back to placeholder cards.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border py-4 px-5">
            <CardTitle className="card-title">Storyboard &amp; render</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 p-5">
            <FormField
              control={form.control}
              name="preset"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Storyboard preset</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full max-w-md">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {presetOptions.map((preset) => (
                        <SelectItem key={preset.id} value={preset.id}>
                          {preset.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {chosenPreset
                      ? `${chosenPreset.description} ${chosenPreset.shot_count} shots, ${chosenPreset.duration_frames} frames per variant per pass.`
                      : "Shot list and length. Longer presets multiply the intermediate frame volume."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="bpm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>BPM</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(defaults.bpm_options ?? []).map((bpm) => (
                          <SelectItem key={bpm} value={String(bpm)}>
                            {bpm} BPM
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Shot boundaries snap to this beat grid.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="resolution"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Master resolution</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(defaults.resolution_options ?? []).map((option) => (
                          <SelectItem
                            key={option.label}
                            value={`${option.width}x${option.height}`}
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Every other variant re-renders from this short edge, so the
                      delivery sizes below follow it.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="variants"
              render={() => (
                <FormItem>
                  <FormLabel>Delivery variants</FormLabel>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {variantOptions.map((variant) => (
                      <FormField
                        key={variant.id}
                        control={form.control}
                        name="variants"
                        render={({ field }) => (
                          <label
                            className={`flex items-start gap-3 rounded-md border border-border p-3 ${
                              variant.required ? "bg-muted/40" : "cursor-pointer"
                            }`}
                          >
                            {/* A required variant is rendered whether or not it is
                                ticked (the backend force-adds it), so it is shown
                                locked-on rather than as an optional checkbox whose
                                unticked state the pass ignores. */}
                            <Checkbox
                              checked={
                                variant.required || field.value.includes(variant.id)
                              }
                              disabled={variant.required}
                              onCheckedChange={(checked) =>
                                field.onChange(
                                  checked
                                    ? [...field.value, variant.id]
                                    : field.value.filter((v) => v !== variant.id),
                                )
                              }
                            />
                            <span className="grid gap-1 leading-tight">
                              <span className="text-sm font-medium">
                                {variant.label}
                                {variant.required ? (
                                  <span className="ml-2 text-[10px] font-normal uppercase tracking-wider text-muted-foreground">
                                    always included
                                  </span>
                                ) : null}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {variant.width}x{variant.height}
                                {variant.muted ? " · muted" : ""} — {variant.purpose}
                              </span>
                            </span>
                          </label>
                        )}
                      />
                    ))}
                  </div>
                  <FormDescription>
                    Each variant is a real re-render, so N more frames per pass.
                    {chosenPreset
                      ? ` At ${chosenPreset.duration_frames} frames and ${
                          form.watch("variants").length || 1
                        } variants that is ${(
                          chosenPreset.duration_frames * (form.watch("variants").length || 1)
                        ).toLocaleString("en-US")} PNGs on the next pass (${formatDuration(
                          chosenPreset.duration_frames,
                          defaults.fps,
                        )} each).`
                      : ""}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="accent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Accent theme</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      className="flex flex-wrap gap-6"
                    >
                      {(defaults.accent_options ?? ["ink-amber"]).map((accent) => (
                        <label
                          key={accent}
                          className="flex cursor-pointer items-center gap-2 text-sm"
                        >
                          <RadioGroupItem value={accent} />
                          {accent}
                        </label>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormDescription>
                    Drives the palette every shot card draws with.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Creating a promo takes ~9s with a reachable URL and up to 20s PER
            viewport with an unreachable one. A faded button alone left the page
            pixel-identical at 1.2s and at 19s, so nothing distinguished "still
            capturing" from "hung". Shared with /ingest's capture panel — the same
            operation must not look hung on one surface and healthy on the other. */}
        {create.isPending ? (
          <InFlightState
            title="Creating this promo"
            budgetSeconds={captureBudgetSeconds(chosenViewports)}
            budgetNote={captureBudgetNote(chosenViewports)}
          >
            Capturing {Math.max(1, chosenViewports)}{" "}
            {chosenViewports === 1 ? "viewport" : "viewports"} at 2x &rarr; expanding
            the storyboard preset &rarr; beat-snapping &rarr; writing{" "}
            <code className="font-mono">storyboards/&lt;id&gt;.json</code> to B2.
          </InFlightState>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/promos")}
            disabled={create.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Capturing &amp; creating...
              </>
            ) : (
              "Create promo"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
