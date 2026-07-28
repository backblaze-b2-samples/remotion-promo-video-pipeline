"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRenderPromo } from "@/lib/queries";
import { ApiError } from "@/lib/api-client";
import type { PromoStatus } from "@remotion-promo-video-pipeline/shared";

interface RenderPassButtonProps {
  jobId: string;
  title: string;
  status: PromoStatus;
  /**
   * Icon-only (the `/promos` Actions column, where every row is icons) or a
   * labelled button. The whole goal of this app runs through this control, so
   * anywhere it is the primary action it must say "Render" in words — README
   * step 4 tells people to "Hit Render", and a bare glyph next to a red trash
   * can is not that.
   */
  labelled?: boolean;
  /** Navigate to the detail page after queueing. Off when already there. */
  navigateOnSuccess?: boolean;
  size?: "sm" | "default";
}

export function RenderPassButton({
  jobId,
  title,
  status,
  labelled = false,
  navigateOnSuccess = true,
  size = "sm",
}: RenderPassButtonProps) {
  const router = useRouter();
  const render = useRenderPromo();
  const inFlight = status === "rendering";
  const disabled = render.isPending || inFlight;

  const onRender = () => {
    render.mutate(jobId, {
      onSuccess: (progress) => {
        toast.success(`Pass ${progress.pass_number} queued`, {
          description: "Frames stream to B2 as they render.",
        });
        if (navigateOnSuccess) router.push(`/promos/${jobId}`);
      },
      onError: (error) => {
        const conflict = error instanceof ApiError && error.status === 409;
        toast.error(
          conflict ? "A render is already in flight" : "Could not start the render",
          { description: error.message },
        );
      },
    });
  };

  const tip = inFlight ? "Render in flight" : "Render a new pass";
  const icon =
    render.isPending || inFlight ? (
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
    ) : (
      <Play className="h-3.5 w-3.5" />
    );

  if (labelled) {
    return (
      <Button size={size} disabled={disabled} onClick={onRender} title={tip}>
        {icon}
        {inFlight ? "Rendering..." : "Render"}
      </Button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={`Render ${title}`}
          disabled={disabled}
          onClick={onRender}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}
