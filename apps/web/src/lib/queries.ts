"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  ApiError,
  createCaptures,
  createDemoAudio,
  createPromo,
  deleteFile,
  deletePromo,
  getAssetLibrary,
  getFileDetail,
  getFiles,
  getFileStats,
  getHealth,
  getPassVolume,
  getPreviewUrl,
  getProducts,
  getPromo,
  getPromoDefaults,
  getPromos,
  getPromoStats,
  getRenderProgress,
  getShotCards,
  getUploadActivity,
  renderPromo,
  updatePromo,
} from "@/lib/api-client";
import type {
  AssetLibrary,
  CaptureInput,
  CreatePromoInput,
  FileMetadata,
  FileMetadataDetail,
  PassVolumePoint,
  PipelineStats,
  PromoDefaults,
  PromoDetail,
  PromoSummary,
  RenderProgress,
  ShotCardLibrary,
  UpdatePromoInput,
} from "@remotion-promo-video-pipeline/shared";

// Single source of truth for query keys. Keep these tightly scoped so that
// invalidating "files" doesn't blow away unrelated caches, and so an IDE
// "find usages" of `qk.files` reveals every consumer.
export const qk = {
  all: ["b2"] as const,
  files: (prefix?: string, limit?: number) =>
    [...qk.all, "files", prefix ?? "", limit ?? 100] as const,
  stats: () => [...qk.all, "stats"] as const,
  uploadActivity: (days: number) =>
    [...qk.all, "stats", "activity", days] as const,
  preview: (key: string) => [...qk.all, "preview", key] as const,
  detail: (key: string) => [...qk.all, "detail", key] as const,
  health: () => [...qk.all, "health"] as const,
};

export type Health = Awaited<ReturnType<typeof getHealth>>;

/**
 * Newest-first objects under `prefix`, capped at `limit`.
 *
 * The endpoint sorts the whole prefix newest-first and then slices, so `limit`
 * genuinely hides the tail — a bucket-wide listing at 100 showed 96 frames while
 * `/files/stats` reported 13,168 objects. `FILE_PAGE_SIZE` is therefore the
 * browser's default and the caller is expected to disclose the truncation; see
 * `FileBrowser`. 1,000 is the API's own ceiling (`service/files.get_files`).
 */
export const FILE_PAGE_SIZE = 500;
export const FILE_PAGE_MAX = 1000;

export function useFiles(prefix = "", limit = FILE_PAGE_SIZE) {
  return useQuery<FileMetadata[], ApiError>({
    queryKey: qk.files(prefix, limit),
    queryFn: () => getFiles(prefix, limit),
  });
}

export function useFileStats() {
  return useQuery({
    queryKey: qk.stats(),
    queryFn: getFileStats,
  });
}

export function useUploadActivity(days = 7) {
  return useQuery({
    queryKey: qk.uploadActivity(days),
    queryFn: () => getUploadActivity(days),
  });
}

// Presigned preview URL — only fetched when `enabled` is true (e.g., when
// the dialog opens for a specific file). Kept short-lived (60s) because
// the URL itself has a presigned expiry and is cheap to regenerate.
export function usePreviewUrl(key: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qk.preview(key ?? ""),
    queryFn: () => getPreviewUrl(key as string),
    enabled: enabled && !!key,
    staleTime: 60_000,
  });
}

// Rich metadata for an already-stored file. The server recomputes it on demand
// (a full object download), so it's only fetched when `enabled` — i.e. the
// preview dialog is open AND the user expands "Detailed metadata". Kept
// short-lived like the preview URL; cheap correctness under key overwrites.
export function useFileDetail(key: string | undefined, enabled: boolean) {
  return useQuery<FileMetadataDetail, ApiError>({
    queryKey: qk.detail(key ?? ""),
    queryFn: () => getFileDetail(key as string),
    enabled: enabled && !!key,
    staleTime: 60_000,
  });
}

// Health poll for the top-of-app B2 banner. `retry: false` and letting a
// failed fetch leave `data` undefined keeps a down API silent (the
// per-component ErrorState covers that); the banner only reacts to an up API
// reporting b2_connected: false. Polls every 60s and on window focus.
export function useHealth() {
  return useQuery<Health>({
    queryKey: qk.health(),
    queryFn: getHealth,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  });
}

export function useDeleteFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileKey: string) => deleteFile(fileKey),
    // After delete, blow away every cached file list + stats. Cheap and
    // correct — the dashboard re-fetches lazily as components remount.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Promo render pipeline hooks
//
// Query keys stay narrow so invalidating promos doesn't blow away the bucket
// listing (or vice versa). `usePromoProgress` is the only polling query: it
// polls while a pass is in flight and stops the moment it isn't.
// ---------------------------------------------------------------------------

export const pk = {
  all: ["promo"] as const,
  list: () => [...pk.all, "list"] as const,
  detail: (jobId: string) => [...pk.all, "detail", jobId] as const,
  stats: () => [...pk.all, "stats"] as const,
  volume: (limit: number) => [...pk.all, "volume", limit] as const,
  defaults: () => [...pk.all, "defaults"] as const,
  progress: (jobId: string) => [...pk.all, "progress", jobId] as const,
  shotCards: () => [...pk.all, "shot-cards"] as const,
  assets: (product: string) => [...pk.all, "assets", product] as const,
  products: () => [...pk.all, "products"] as const,
};

const PROGRESS_POLL_MS = 1500;
// Slower than the detail page's progress poll: the list only needs to notice a
// pass starting or finishing, and each refetch is a bucket listing plus one GET
// per promo.
const LIST_POLL_MS = 5000;

/**
 * The promo list. Polls only while at least one row has a pass in flight, so a
 * running pass stops being indistinguishable from a finished one — the list used
 * to never refetch at all, and a row that read "Draft" when a pass started still
 * read "Draft" when it had produced two variants.
 */
export function usePromos() {
  return useQuery<PromoSummary[], ApiError>({
    queryKey: pk.list(),
    queryFn: getPromos,
    refetchInterval: (q) =>
      q.state.data?.some((promo) => promo.status === "rendering")
        ? LIST_POLL_MS
        : false,
  });
}

export function usePromo(jobId: string) {
  return useQuery<PromoDetail, ApiError>({
    queryKey: pk.detail(jobId),
    queryFn: () => getPromo(jobId),
    enabled: !!jobId,
  });
}

export function usePipelineStats() {
  return useQuery<PipelineStats, ApiError>({
    queryKey: pk.stats(),
    queryFn: getPromoStats,
  });
}

export function usePassVolume(limit = 8) {
  return useQuery<PassVolumePoint[], ApiError>({
    queryKey: pk.volume(limit),
    queryFn: () => getPassVolume(limit),
  });
}

// Form hints (safe defaults, selector options). They only change when the
// server configuration changes, so they are effectively static per session.
export function usePromoDefaults() {
  return useQuery<PromoDefaults, ApiError>({
    queryKey: pk.defaults(),
    queryFn: getPromoDefaults,
    staleTime: 5 * 60_000,
  });
}

export function useShotCards() {
  return useQuery<ShotCardLibrary, ApiError>({
    queryKey: pk.shotCards(),
    queryFn: getShotCards,
    staleTime: 5 * 60_000,
  });
}

export function useAssetLibrary(product: string) {
  return useQuery<AssetLibrary, ApiError>({
    queryKey: pk.assets(product),
    queryFn: () => getAssetLibrary(product),
    enabled: !!product,
  });
}

export function useProducts() {
  return useQuery({
    queryKey: pk.products(),
    queryFn: getProducts,
    staleTime: 60_000,
  });
}

/**
 * Poll a promo's render progress. Polling stops as soon as the pass leaves the
 * "rendering" state, and every completed pass invalidates the promo caches so
 * the new variants and the amplification stats appear without a manual refresh.
 */
export function usePromoProgress(jobId: string, enabled = true) {
  const qc = useQueryClient();
  const lastStatus = useRef<string | null>(null);

  const query = useQuery<RenderProgress, ApiError>({
    queryKey: pk.progress(jobId),
    queryFn: () => getRenderProgress(jobId),
    enabled: enabled && !!jobId,
    refetchInterval: (q) =>
      q.state.data?.status === "rendering" ? PROGRESS_POLL_MS : false,
    staleTime: 0,
  });

  useEffect(() => {
    const status = query.data?.status ?? null;
    if (status && lastStatus.current === "rendering" && status !== "rendering") {
      qc.invalidateQueries({ queryKey: pk.all });
      qc.invalidateQueries({ queryKey: qk.all });
    }
    lastStatus.current = status;
  }, [query.data?.status, qc]);

  return query;
}

export function useCreatePromo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePromoInput) => createPromo(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pk.all });
      qc.invalidateQueries({ queryKey: qk.all });
    },
  });
}

export function useUpdatePromo(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdatePromoInput) => updatePromo(jobId, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pk.all });
    },
  });
}

export function useDeletePromo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => deletePromo(jobId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pk.all });
      qc.invalidateQueries({ queryKey: qk.all });
    },
  });
}

export function useRenderPromo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => renderPromo(jobId),
    onSuccess: (progress) => {
      qc.setQueryData(pk.progress(progress.job_id), progress);
      qc.invalidateQueries({ queryKey: pk.list() });
    },
  });
}

export function useCreateCaptures() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CaptureInput) => createCaptures(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pk.all });
      qc.invalidateQueries({ queryKey: qk.all });
    },
  });
}

export function useCreateDemoAudio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ product, bpm }: { product: string; bpm: number }) =>
      createDemoAudio(product, bpm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pk.all });
      qc.invalidateQueries({ queryKey: qk.all });
    },
  });
}
