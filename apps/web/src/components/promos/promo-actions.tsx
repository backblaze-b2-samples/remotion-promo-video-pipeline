"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, Pencil, Play, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDeletePromo, useRenderPromo } from "@/lib/queries";
import { ApiError } from "@/lib/api-client";
import type { PromoStatus } from "@remotion-promo-video-pipeline/shared";

interface PromoActionsProps {
  jobId: string;
  title: string;
  status: PromoStatus;
  /** Detail pages navigate away after a delete; list rows stay put. */
  redirectAfterDelete?: string;
  showView?: boolean;
}

export function PromoActions({
  jobId,
  title,
  status,
  redirectAfterDelete,
  showView = true,
}: PromoActionsProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const render = useRenderPromo();
  const remove = useDeletePromo();

  const onRender = () => {
    render.mutate(jobId, {
      onSuccess: (progress) => {
        toast.success(`Pass ${progress.pass_number} queued`, {
          description: "Frames stream to B2 as they render.",
        });
        router.push(`/promos/${jobId}`);
      },
      onError: (error) => {
        const conflict = error instanceof ApiError && error.status === 409;
        toast.error(conflict ? "A render is already in flight" : "Could not start the render", {
          description: error.message,
        });
      },
    });
  };

  const onDelete = () => {
    remove.mutate(jobId, {
      onSuccess: (result) => {
        toast.success(`Deleted "${title}"`, {
          description: `${result.objects_removed} objects purged from this promo's prefixes.`,
        });
        setConfirmOpen(false);
        if (redirectAfterDelete) router.push(redirectAfterDelete);
      },
      onError: (error) => {
        toast.error("Delete failed", { description: error.message });
      },
    });
  };

  return (
    <div className="flex items-center justify-end gap-1">
      {showView ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={`View ${title}`}
              onClick={() => router.push(`/promos/${jobId}`)}
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>View</TooltipContent>
        </Tooltip>
      ) : null}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={`Edit ${title}`}
            onClick={() => router.push(`/promos/${jobId}/edit`)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Edit storyboard</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={`Render ${title}`}
            disabled={render.isPending || status === "rendering"}
            onClick={onRender}
          >
            <Play className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {status === "rendering" ? "Render in flight" : "Render a new pass"}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            aria-label={`Delete ${title}`}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Delete</TooltipContent>
      </Tooltip>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This purges only this promo&apos;s own keys —{" "}
              <code className="font-mono text-xs">storyboards/{jobId}.json</code>,{" "}
              <code className="font-mono text-xs">frames/{jobId}/</code>,{" "}
              <code className="font-mono text-xs">renders/{jobId}/</code> and{" "}
              <code className="font-mono text-xs">manifests/{jobId}.json</code>. Shared
              assets under <code className="font-mono text-xs">assets/</code> are left
              alone, and no other promo is touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                onDelete();
              }}
              disabled={remove.isPending}
            >
              {remove.isPending ? "Deleting..." : "Delete promo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
