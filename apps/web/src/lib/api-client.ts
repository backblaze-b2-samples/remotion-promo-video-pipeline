import type {
  AssetLibrary,
  CaptureInput,
  CaptureResponse,
  CreatePromoInput,
  DailyUploadCount,
  FileMetadata,
  FileMetadataDetail,
  FileUploadResponse,
  PassVolumePoint,
  PipelineStats,
  PromoDefaults,
  PromoDetail,
  PromoSummary,
  RenderProgress,
  ShotCardLibrary,
  Storyboard,
  UpdatePromoInput,
  UploadStats,
} from "@remotion-promo-video-pipeline/shared";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** Typed API error with HTTP status code for caller-side branching. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** True for 408, 429, 500, 502, 503, 504 — worth retrying. */
  get isRetryable(): boolean {
    return [408, 429, 500, 502, 503, 504].includes(this.status);
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }
}

/**
 * Build the right status-0 ApiError for a thrown fetch().
 *
 * fetch() rejects with a TypeError for genuinely-offline/DNS failures AND for
 * responses the browser refused to expose — most notably a cross-origin 500
 * that shipped without `Access-Control-Allow-Origin`. We can't tell those apart
 * from the error object, but `navigator.onLine === false` reliably means the
 * device has no connectivity. Anything else reached the network, so the most
 * likely cause is the server erroring with a CORS-blocked response — point the
 * developer at the API logs instead of blaming their connection.
 */
function networkError(): ApiError {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return new ApiError("You appear to be offline — check your connection", 0);
  }
  return new ApiError(
    "Couldn't reach the API, or the server returned an error the browser blocked (CORS). Check the API logs.",
    0,
  );
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw networkError();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      body.detail || `API error: ${res.status}`,
      res.status,
    );
  }
  return res.json();
}

function isEndpointUnavailable(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status === 404 &&
    (error.message === "Not Found" || error.message === "API error: 404")
  );
}

async function apiFetchWithLegacyFallback<T>(
  path: string,
  legacyPath: () => string,
  init?: RequestInit
): Promise<T> {
  try {
    return await apiFetch<T>(path, init);
  } catch (error) {
    if (isEndpointUnavailable(error)) {
      return apiFetch<T>(legacyPath(), init);
    }
    throw error;
  }
}

function fileKeyQuery(key: string): string {
  if (key.length === 0) {
    throw new ApiError("File key is required", 400);
  }
  return new URLSearchParams({ key }).toString();
}

function legacyFileKeyPath(
  key: string,
  options: { blockRouteCollisions?: boolean } = {}
): string {
  if (!isLegacyPathFallbackSafe(key, options)) {
    throw new ApiError("Current API version required for this file key", 404);
  }
  return encodeURIComponent(key);
}

function isLegacyPathFallbackSafe(
  key: string,
  { blockRouteCollisions = false }: { blockRouteCollisions?: boolean } = {}
): boolean {
  if (/(\.\.\/|\/\.\.|\\|%2e%2e|%00|\x00)/i.test(key)) return false;
  if (!blockRouteCollisions) return true;

  const lowerKey = key.toLowerCase();
  if (lowerKey === "stats" || lowerKey === "stats/activity") return false;
  if (lowerKey.endsWith("/download") || lowerKey.endsWith("/preview")) return false;
  return true;
}

export async function getHealth() {
  return apiFetch<{ status: string; b2_connected: boolean }>("/health");
}

export async function getFiles(prefix = "", limit = 100) {
  return apiFetch<FileMetadata[]>(
    `/files?prefix=${encodeURIComponent(prefix)}&limit=${limit}`
  );
}

export async function getFileStats() {
  return apiFetch<UploadStats>("/files/stats");
}

export async function getUploadActivity(days = 7) {
  return apiFetch<DailyUploadCount[]>(`/files/stats/activity?days=${days}`);
}

export async function getFile(key: string) {
  return apiFetchWithLegacyFallback<FileMetadata>(
    `/files-by-key/metadata?${fileKeyQuery(key)}`,
    () => `/files/${legacyFileKeyPath(key, { blockRouteCollisions: true })}`
  );
}

/**
 * Rich metadata (checksums, image/PDF fields) for an already-stored file.
 * The server recomputes this on demand by downloading the object, so it's a
 * heavier call than getFile — fetch it lazily (only when the user asks to see
 * details). No legacy path fallback: this endpoint is new, so an older backend
 * wouldn't serve it under any route.
 */
export async function getFileDetail(key: string) {
  return apiFetch<FileMetadataDetail>(
    `/files-by-key/detail?${fileKeyQuery(key)}`
  );
}

export async function getDownloadUrl(key: string) {
  return apiFetchWithLegacyFallback<{ url: string }>(
    `/files-by-key/download?${fileKeyQuery(key)}`,
    () => `/files/${legacyFileKeyPath(key)}/download`
  );
}

/** Preview-only presigned URL — does NOT increment the download counter. */
export async function getPreviewUrl(key: string) {
  return apiFetchWithLegacyFallback<{ url: string }>(
    `/files-by-key/preview?${fileKeyQuery(key)}`,
    () => `/files/${legacyFileKeyPath(key)}/preview`
  );
}

export async function deleteFile(key: string) {
  return apiFetchWithLegacyFallback<{ deleted: boolean; key: string }>(
    `/files-by-key?${fileKeyQuery(key)}`,
    () => `/files/${legacyFileKeyPath(key)}`,
    {
      method: "DELETE",
    }
  );
}

export function uploadFile(
  file: File,
  onProgress?: (percent: number) => void
): Promise<FileUploadResponse> {
  return uploadFileTo("/upload", file, onProgress);
}

/**
 * XHR (not fetch) because only XHR exposes upload progress events, which the
 * dropzone's per-file progress bar needs. `path` carries the optional
 * `?product=&kind=` that files an asset under `assets/<product>/...`.
 */
export function uploadFileTo(
  path: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<FileUploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        try {
          const body = JSON.parse(xhr.responseText);
          reject(new ApiError(body.detail || `Upload failed: ${xhr.status}`, xhr.status));
        } catch {
          reject(new ApiError(`Upload failed: ${xhr.status}`, xhr.status));
        }
      }
    });

    xhr.addEventListener("error", () => reject(networkError()));
    xhr.addEventListener("abort", () =>
      reject(new ApiError("Upload aborted", 0)),
    );

    xhr.open("POST", `${API_BASE}${path}`);
    xhr.send(formData);
  });
}

// ---------------------------------------------------------------------------
// Promo render pipeline
//
// One function per endpoint, all going through the same `apiFetch` so error
// mapping, CORS diagnostics and retry behaviour are identical everywhere. These
// are consumed only via the TanStack Query hooks in `lib/queries.ts` — never
// called from a component directly (AGENTS.md §3).
// ---------------------------------------------------------------------------

async function apiSend<T>(path: string, method: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function getPromos() {
  return apiFetch<PromoSummary[]>("/promos");
}

export async function getPromo(jobId: string) {
  return apiFetch<PromoDetail>(`/promos/${encodeURIComponent(jobId)}`);
}

export async function getPromoStats() {
  return apiFetch<PipelineStats>("/promos/stats");
}

export async function getPassVolume(limit = 8) {
  return apiFetch<PassVolumePoint[]>(`/promos/volume?limit=${limit}`);
}

export async function getPromoDefaults() {
  return apiFetch<PromoDefaults>("/promo-defaults");
}

export async function createPromo(spec: CreatePromoInput) {
  return apiSend<Storyboard>("/promos", "POST", spec);
}

export async function updatePromo(jobId: string, patch: UpdatePromoInput) {
  return apiSend<Storyboard>(`/promos/${encodeURIComponent(jobId)}`, "PATCH", patch);
}

export async function deletePromo(jobId: string) {
  return apiSend<{ deleted: boolean; job_id: string; objects_removed: number }>(
    `/promos/${encodeURIComponent(jobId)}`,
    "DELETE",
  );
}

export async function renderPromo(jobId: string) {
  return apiSend<RenderProgress>(
    `/promos/${encodeURIComponent(jobId)}/render`,
    "POST",
  );
}

export async function getRenderProgress(jobId: string) {
  return apiFetch<RenderProgress>(`/promos/${encodeURIComponent(jobId)}/progress`);
}

export async function getShotCards() {
  return apiFetch<ShotCardLibrary>("/shot-cards");
}

export async function getAssetLibrary(product: string) {
  return apiFetch<AssetLibrary>(`/assets?product=${encodeURIComponent(product)}`);
}

export async function getProducts() {
  return apiFetch<{ products: string[]; default: string }>("/products");
}

export async function createCaptures(input: CaptureInput) {
  return apiSend<CaptureResponse>("/captures", "POST", input);
}

export async function createDemoAudio(product: string, bpm: number) {
  return apiSend<{ product: string; bed_key: string; sfx: { id: string; key: string }[] }>(
    "/assets/demo-audio",
    "POST",
    { product, bpm },
  );
}

/** Upload an asset straight into `assets/<product>/<kind>/` on B2. */
export function uploadAsset(
  file: File,
  product: string,
  kind: "brand" | "audio" | "capture",
  onProgress?: (percent: number) => void,
): Promise<FileUploadResponse> {
  const query = new URLSearchParams({ product, kind }).toString();
  return uploadFileTo(`/upload?${query}`, file, onProgress);
}
