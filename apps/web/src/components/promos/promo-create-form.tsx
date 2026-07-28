"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import type { PromoDefaults } from "@remotion-promo-video-pipeline/shared";

// Every finite-option field is a selector; only genuinely open text (product
// slug, title, capture URL) is an Input. Defaults arrive from the API as
// *hints* — placeholder + FormDescription — and there is deliberately NO
// autofill button: the form teaches the safe default instead of filling it in.
const createSchema = z.object({
  product: z
    .string()
    .min(2, "Product slug must be at least 2 characters")
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, "Letters, numbers, dot, dash and underscore only"),
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

export function PromoCreateForm() {
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
  return <PromoCreateFormFields defaults={defaults} />;
}

function PromoCreateFormFields({ defaults }: { defaults: PromoDefaults }) {
  const router = useRouter();
  const create = useCreatePromo();

  // Selector *values* are pre-selected from the server defaults (a Select with
  // nothing chosen is not a usable control); the free-text fields stay EMPTY and
  // show their safe default as a placeholder + description only — no autofill.
  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      product: "",
      title: "",
      captureUrl: "",
      preset: defaults.preset,
      bpm: String(defaults.bpm),
      resolution: `${defaults.width}x${defaults.height}`,
      accent: defaults.accent,
      variants: defaults.variants,
      viewports: ["desktop"],
    },
  });

  const presetOptions = defaults.preset_options ?? [];
  const chosenPreset = presetOptions.find((p) => p.id === form.watch("preset"));

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
          toast.success("Promo created", {
            description: `${storyboard.shots.length} shots, beat-snapped to ${storyboard.bpm} BPM.`,
          });
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
                    in B2. A safe default is{" "}
                    <code className="font-mono text-xs">{defaults.product}</code>.
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
                  <FormDescription>
                    Screenshots land in{" "}
                    <code className="font-mono text-xs">
                      assets/&lt;slug&gt;/captures/&lt;viewport&gt;/
                    </code>
                    . Without Chromium installed
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
                      Every other variant re-renders from this short edge.
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
                    {(defaults.variant_options ?? []).map((variant) => (
                      <FormField
                        key={variant.id}
                        control={form.control}
                        name="variants"
                        render={({ field }) => (
                          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3">
                            <Checkbox
                              checked={field.value.includes(variant.id)}
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
                      ? ` At ${chosenPreset.duration_frames} frames that is ${(
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
            {create.isPending ? "Capturing & creating..." : "Create promo"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
