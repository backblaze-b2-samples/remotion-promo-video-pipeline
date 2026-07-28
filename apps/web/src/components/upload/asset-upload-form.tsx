"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { FileRejection } from "react-dropzone";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dropzone } from "./dropzone";
import { UploadProgress, type UploadItem } from "./upload-progress";
import { uploadAsset } from "@/lib/api-client";
import { humanizeBytes } from "@/lib/utils";
import { useRefresh } from "@/lib/refresh-context";

const KIND_OPTIONS = [
  {
    id: "brand" as const,
    label: "Brand file",
    hint: "assets/<product>/brand/ — logos, palettes, JSON tokens",
  },
  {
    id: "audio" as const,
    label: "Audio bed",
    hint: "assets/<product>/audio/bgm/ — WAV or MP3, preferred over the synthesized bed",
  },
  {
    id: "capture" as const,
    label: "Manual capture",
    hint: "assets/<product>/captures/manual/ — a screenshot you took yourself",
  },
];

function newItem(file: File, status: UploadItem["status"], error?: string): UploadItem {
  return {
    id: `${file.name}-${file.lastModified}-${Date.now()}-${Math.random()}`,
    file,
    progress: 0,
    retryable: status !== "error",
    status,
    error,
  };
}

export function AssetUploadForm({ product }: { product: string }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [kind, setKind] = useState<(typeof KIND_OPTIONS)[number]["id"]>("brand");
  const { triggerRefresh } = useRefresh();

  const uploadItems = useCallback(
    async (queue: UploadItem[]) => {
      if (queue.length === 0) return;
      setUploading(true);
      let anySuccess = false;
      try {
        for (const item of queue) {
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? { ...i, error: undefined, progress: 0, status: "uploading" }
                : i,
            ),
          );
          try {
            await uploadAsset(item.file, product, kind, (percent) => {
              setItems((prev) =>
                prev.map((i) => (i.id === item.id ? { ...i, progress: percent } : i)),
              );
            });
            setItems((prev) =>
              prev.map((i) =>
                i.id === item.id ? { ...i, status: "complete", progress: 100 } : i,
              ),
            );
            toast.success(`${item.file.name} filed under assets/${product}/`);
            anySuccess = true;
          } catch (err) {
            const message = err instanceof Error ? err.message : "Upload failed";
            setItems((prev) =>
              prev.map((i) =>
                i.id === item.id ? { ...i, status: "error", error: message } : i,
              ),
            );
            toast.error(`Failed to upload ${item.file.name}: ${message}`);
          }
        }
      } finally {
        setUploading(false);
        if (anySuccess) triggerRefresh();
      }
    },
    [kind, product, triggerRefresh],
  );

  const handleFilesRejected = useCallback((rejections: FileRejection[]) => {
    const rejected = rejections.map((rejection) => {
      const reasons = rejection.errors.map((e) =>
        e.code === "file-too-large"
          ? `exceeds 100MB limit (${humanizeBytes(rejection.file.size)})`
          : e.code === "file-invalid-type"
            ? "file type not supported"
            : e.message,
      );
      const message = reasons.join(", ") || "File could not be added.";
      toast.error(`${rejection.file.name}: ${message}`);
      return newItem(rejection.file, "error", message);
    });
    setItems((prev) => [...prev, ...rejected]);
  }, []);

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      if (uploading) {
        toast.info("Wait for the current upload queue to finish first.");
        return;
      }
      if (!product) {
        toast.error("Choose a product first — assets are filed per product.");
        return;
      }
      const next = files.map((file) => newItem(file, "uploading"));
      setItems((prev) => [...prev, ...next]);
      void uploadItems(next);
    },
    [product, uploadItems, uploading],
  );

  const chosen = KIND_OPTIONS.find((option) => option.id === kind);
  const hasFinished = items.some(
    (item) => item.status === "complete" || item.status === "error",
  );

  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">Upload an asset</CardTitle>
        <CardDescription className="text-xs">
          Files are filed by product and kind rather than dumped in a generic
          uploads/ folder, so they show up in the scoped Library view.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-5">
        <div className="space-y-2">
          <Label htmlFor="asset-kind">Asset kind</Label>
          <Select value={kind} onValueChange={(value) => setKind(value as typeof kind)}>
            <SelectTrigger id="asset-kind" className="w-full max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_OPTIONS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="font-mono text-[11px] text-muted-foreground">{chosen?.hint}</p>
        </div>

        <Dropzone
          onFilesSelected={handleFilesSelected}
          onFilesRejected={handleFilesRejected}
          disabled={uploading || !product}
        />
        <UploadProgress
          disabled={uploading}
          items={items}
          onRetry={(id) => {
            const item = items.find((i) => i.id === id);
            if (item && item.retryable !== false && !uploading) void uploadItems([item]);
          }}
        />
        {hasFinished && !uploading ? (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              aria-label="Clear completed and failed uploads"
              onClick={() =>
                setItems((prev) => prev.filter((i) => i.status === "uploading"))
              }
            >
              Clear finished
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
