"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, Pencil, Trash2 } from "lucide-react";

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
import { useDeletePromo } from "@/lib/queries";
import { RenderPassButton } from "./render-pass-button";
import type { PromoStatus } from "@remotion-promo-video-pipeline/shared";

interface PromoActionsProps {
  jobId: string;
  title: string;
  status: PromoStatus;
  /** Detail pages navigate away after a delete; list rows stay put. */
  redirectAfterDelete?: string;
  showView?: boolean;
  /**
   * The detail header already has a labelled `Edit storyboard` button, so the
   * pencil there was a second control going to the same place — leaving the
   * unlabelled glyphs as the only route to the app's primary action.
   */
  showEdit?: boolean;
  /** Render the primary action as a labelled "Render" button, not a glyph. */
  labelledRender?: boolean;
}

export function PromoActions({
  jobId,
  title,
  status,
  redirectAfterDelete,
  showView = true,
  showEdit = true,
  labelledRender = false,
}: PromoActionsProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const remove = useDeletePromo();

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

      {showEdit ? (
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
      ) : null}

      <RenderPassButton
        jobId={jobId}
        title={title}
        status={status}
        labelled={labelledRender}
        navigateOnSuccess={!labelledRender}
      />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            // Extra left margin keeps the destructive control off the primary
            // action's edge, so a misclick on Render cannot land on Delete.
            className="ml-2 h-8 w-8 text-destructive hover:text-destructive"
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
