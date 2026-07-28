"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderOpen, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FilePreview } from "./file-preview";
import { FileTreeRow } from "./file-tree-row";
import { Input } from "@/components/ui/input";
import { ApiError, getDownloadUrl } from "@/lib/api-client";
import {
  FILE_PAGE_MAX,
  FILE_PAGE_SIZE,
  useDeleteFile,
  useFileStats,
  useFiles,
} from "@/lib/queries";
import { allFolderPaths, buildFileTree, type TreeFolder } from "@/lib/file-tree";
import type { FileMetadata } from "@remotion-promo-video-pipeline/shared";

export function FileBrowser() {
  // `prefix` is what makes deep keys reachable at all: the listing is capped and
  // sorted newest-first, so with 13,168 objects in the bucket an unscoped view
  // can never walk down to `frames/<job>/pass-NN/<variant>/`. Scoping to a
  // prefix puts one pass comfortably inside the cap.
  const [prefix, setPrefix] = useState("");
  const [prefixDraft, setPrefixDraft] = useState("");
  const [limit, setLimit] = useState(FILE_PAGE_SIZE);
  const { data: files = [], isLoading, isFetching, error, refetch } = useFiles(
    prefix,
    limit,
  );
  const { data: stats } = useFileStats();
  const deleteMutation = useDeleteFile();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<FileMetadata | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FileMetadata | null>(null);

  const tree = useMemo(() => buildFileTree(files), [files]);
  // A full page means the API sliced the tail off; there is no cheap exact count
  // for a scoped prefix, so "we hit the cap" is the honest signal.
  const truncated = files.length >= limit;

  // Seed the expansion once per prefix. Unscoped: top-level folders only, as
  // before. Scoped: the WHOLE subtree, because scoping to `frames/<job>/pass-01/`
  // otherwise renders a chain of collapsed single-child rows and the objects the
  // user scoped to see are still three clicks away — which is exactly the
  // reachability the prefix filter exists to provide. Keying on the prefix
  // (rather than the old `prev.size > 0` guard) keeps a user's own toggles across
  // refetches while still re-seeding when they re-scope.
  const seededPrefix = useRef<string | null>(null);
  useEffect(() => {
    if (files.length === 0 || seededPrefix.current === prefix) return;
    seededPrefix.current = prefix;
    const paths = prefix
      ? allFolderPaths(tree)
      : tree.filter((n): n is TreeFolder => n.type === "folder").map((f) => f.path);
    // Syncing initial UI state once when async data first arrives is the
    // documented escape hatch for react-hooks/set-state-in-effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpanded(new Set(paths));
  }, [files.length, tree, prefix]);

  const toggleFolder = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleDownload = async (file: FileMetadata) => {
    try {
      const { url } = await getDownloadUrl(file.key);
      window.open(url, "_blank");
    } catch (err) {
      const detail = err instanceof ApiError ? err.message : "Failed to get download URL";
      toast.error(detail);
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    deleteMutation.mutate(target.key, {
      onSuccess: () => {
        toast.success(`${target.filename} deleted`);
      },
      onError: (err) => {
        const detail = err instanceof ApiError ? err.message : "Failed to delete file";
        toast.error(detail);
      },
      onSettled: () => setDeleteTarget(null),
    });
  };

  const handlePreview = (file: FileMetadata) => {
    setPreviewFile(file);
    setPreviewOpen(true);
  };

  return (
    <>
      <Card>
        <CardHeader className="space-y-3 border-b border-border px-5 py-4">
          <div className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle className="card-title">All Files</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="touch-target h-7 shrink-0 text-xs"
              disabled={isFetching}
              aria-label={isFetching ? "Refreshing file list" : "Refresh file list"}
            >
              <RefreshCw
                aria-hidden="true"
                className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setPrefix(prefixDraft.trim());
              setLimit(FILE_PAGE_SIZE);
            }}
          >
            <Input
              value={prefixDraft}
              onChange={(event) => setPrefixDraft(event.target.value)}
              placeholder="Scope to a prefix, e.g. frames/"
              aria-label="Filter by key prefix"
              className="h-7 max-w-xs text-xs"
            />
            <Button type="submit" size="sm" variant="outline" className="h-7 text-xs">
              Scope
            </Button>
            {prefix ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => {
                  setPrefixDraft("");
                  setPrefix("");
                  setLimit(FILE_PAGE_SIZE);
                }}
              >
                Clear
              </Button>
            ) : null}
          </form>
          {/* Truncation is disclosed rather than silent: this view used to show
              the newest ~100 objects while the dashboard next door reported
              13,168, with nothing on screen to reconcile the two.

              While the listing is in flight this renders a skeleton instead of
              the counts — the dashboard tiles' treatment. Rendering
              `files.length` unguarded asserted "Showing 0 of 0 objects in the
              bucket" for the ~9s a full-bucket scan takes, so someone checking
              whether their frames landed in B2 read a false terminal fact and
              the only contradiction was an `sr-only` announcement. The bucket
              total is also only claimed once `/files/stats` has answered: "500 of
              500" would understate an 16k-object bucket just as badly. */}
          {isLoading ? (
            <div
              className="flex items-center gap-2"
              role="status"
              aria-live="polite"
            >
              <Skeleton className="h-3 w-48" />
              <span className="text-[11px] text-muted-foreground">
                Counting objects in the bucket...
              </span>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground" aria-live="polite">
              Showing {files.length.toLocaleString("en-US")}
              {prefix ? (
                <>
                  {" "}
                  object{files.length === 1 ? "" : "s"} under{" "}
                  <code className="font-mono">{prefix}</code>
                </>
              ) : stats ? (
                <>
                  {" "}
                  of {stats.total_files.toLocaleString("en-US")} objects in the bucket
                </>
              ) : (
                <> objects in the bucket</>
              )}
              , newest first.
              {truncated
                ? " Older keys are hidden — raise the page size or scope to a prefix (e.g. frames/<job-id>/pass-01/) to reach them."
                : ""}
            </p>
          )}
        </CardHeader>
        <CardContent className="p-3" aria-busy={isLoading || isFetching}>
          {isLoading ? (
            <div
              className="space-y-2 px-1 py-1"
              role="status"
              aria-live="polite"
              aria-label="Loading files"
            >
              <p className="sr-only">Loading files...</p>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : error ? (
            <ErrorState
              error={error}
              title="Couldn't load files"
              onRetry={() => refetch()}
              className="px-4"
            />
          ) : files.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title={prefix ? `Nothing under ${prefix}` : "This bucket is empty"}
              description={
                prefix
                  ? "No object in the bucket starts with that prefix. Prefixes are case-sensitive and match from the start of the key."
                  : "Upload some files to see them listed here."
              }
              action={
                prefix ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPrefixDraft("");
                      setPrefix("");
                    }}
                  >
                    Clear prefix
                  </Button>
                ) : (
                  <Button asChild size="sm">
                    <Link href="/ingest">
                      <Upload aria-hidden="true" className="h-3.5 w-3.5" />
                      Ingest assets
                    </Link>
                  </Button>
                )
              }
              className="px-4"
            />
          ) : (
            <div className="space-y-0.5 overflow-hidden" aria-label="Files in bucket">
              {tree.map((node) => (
                <FileTreeRow
                  key={node.type === "folder" ? node.path : node.data.key}
                  node={node}
                  depth={0}
                  expanded={expanded}
                  onToggle={toggleFolder}
                  onPreview={handlePreview}
                  onDownload={handleDownload}
                  onDelete={setDeleteTarget}
                />
              ))}
              {truncated && limit < FILE_PAGE_MAX ? (
                <div className="pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-full text-xs"
                    disabled={isFetching}
                    onClick={() => setLimit(FILE_PAGE_MAX)}
                  >
                    Show up to {FILE_PAGE_MAX.toLocaleString("en-US")} objects
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <FilePreview
        file={previewFile}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete file?</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              This will permanently delete{" "}
              <strong className="break-all font-semibold text-foreground">
                {deleteTarget?.filename}
              </strong>
              . This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              // Use the destructive variant so the confirm gets white-on-red
              // (AA in both themes); AlertDialogAction merges this over its
              // default variant.
              className={buttonVariants({ variant: "destructive" })}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
