export type FileStatus = "uploading" | "complete" | "error";

export interface FileMetadata {
  key: string;
  filename: string;
  folder: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  url: string | null;
}

export interface FileMetadataDetail {
  filename: string;
  size_bytes: number;
  size_human: string;
  mime_type: string;
  extension: string;
  md5: string;
  sha256: string;
  uploaded_at: string;
  // Image-specific
  image_width: number | null;
  image_height: number | null;
  exif: Record<string, string> | null;
  // Audio/Video
  duration_seconds: number | null;
  codec: string | null;
  bitrate: number | null;
}

export interface FileUploadResponse {
  key: string;
  filename: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  url: string | null;
  metadata: FileMetadataDetail | null;
}

export interface DailyUploadCount {
  date: string;
  uploads: number;
}

export interface UploadStats {
  total_files: number;
  total_size_bytes: number;
  total_size_human: string;
  uploads_today: number;
  total_downloads: number;
}

// ---------------------------------------------------------------------------
// Promo render pipeline
//
// These mirror the Pydantic models in services/api/app/types/promo.py. The
// storyboard is also the job record: `storyboards/<job_id>.json` in B2 is the
// only place job state lives (there is no database).
// ---------------------------------------------------------------------------

export type PromoStatus = "draft" | "rendering" | "rendered" | "failed";
export type RenderPhase =
  /** Nothing scheduled — a promo that has never been rendered. Not "queued". */
  | "idle"
  | "queued"
  | "resuming"
  | "rendering"
  | "uploading"
  | "encoding"
  | "publishing"
  | "done"
  | "error";

export interface ShotCard {
  id: string;
  title: string;
  category: string;
  energy: string;
  default_duration_frames: number;
  uses_capture: boolean;
  purpose: string;
  pitfalls: string[];
  implemented: boolean;
}

export interface SfxOption {
  id: string;
  label: string;
  synthesized: boolean;
}

export interface AccentOption {
  id: string;
  label: string;
}

export interface ShotCardLibrary {
  cards: ShotCard[];
  sfx: SfxOption[];
  accents: AccentOption[];
  upstream: string;
  upstream_card_count: number;
}

export interface StoryboardPreset {
  id: string;
  label: string;
  description: string;
  duration_frames: number;
  shot_count: number;
}

export interface Shot {
  card: string;
  /** Start frame, inclusive. Beat-snapped. */
  from: number;
  duration_frames: number;
  headline: string;
  sub: string;
  /** B2 key of the capture this shot embeds, if any. */
  capture: string | null;
  sfx: string;
}

export interface Storyboard {
  job_id: string;
  product: string;
  title: string;
  preset: string;
  revision: number;
  created_at: string;
  updated_at: string;
  bpm: number;
  fps: number;
  width: number;
  height: number;
  accent: string;
  variants: string[];
  shots: Shot[];
  /**
   * How the capture wired into this promo's shots was produced: `"playwright"`
   * for a real product screenshot, `"placeholder"` for a Pillow-drawn card.
   * `""` means unknown (a storyboard written before this was recorded).
   */
  capture_engine: string;
  /** Why the capture degraded, when it did. Empty on a clean capture. */
  capture_note: string;
  /** Server-computed sum of shot durations. */
  duration_frames: number;
}

export interface VariantSpec {
  id: string;
  label: string;
  width: number;
  height: number;
  fit: string;
  muted: boolean;
  /** The backend always adds this variant; the forms show it as locked-on. */
  required: boolean;
  purpose: string;
}

export interface RenderedVariant {
  variant: string;
  width: number;
  height: number;
  frame_count: number;
  frame_bytes: number;
  variant_key: string;
  variant_bytes: number;
  poster_key: string | null;
  duration_seconds: number;
}

export interface RenderPass {
  pass_number: number;
  revision: number;
  started_at: string;
  finished_at: string;
  storyboard_key: string;
  fps: number;
  bpm: number;
  duration_frames: number;
  shot_cards: string[];
  variants: RenderedVariant[];
  frames_written: number;
  frame_bytes: number;
  variant_bytes: number;
  amplification_ratio: number;
}

export interface AmplificationStats {
  passes: number;
  frames_written: number;
  frame_bytes: number;
  variant_bytes: number;
  amplification_ratio: number;
}

export interface DeliveryManifest {
  job_id: string;
  product: string;
  title: string;
  passes: RenderPass[];
  totals: AmplificationStats;
}

export interface PromoSummary {
  job_id: string;
  product: string;
  title: string;
  preset: string;
  revision: number;
  updated_at: string;
  status: PromoStatus;
  duration_frames: number;
  fps: number;
  bpm: number;
  variants: string[];
  passes: number;
  poster_url: string | null;
  amplification_ratio: number;
}

export interface VariantPlayback {
  variant: string;
  label: string;
  width: number;
  height: number;
  muted: boolean;
  key: string;
  url: string | null;
  poster_url: string | null;
  size_bytes: number;
  duration_seconds: number;
}

export interface PromoDetail {
  storyboard: Storyboard;
  manifest: DeliveryManifest | null;
  playback: VariantPlayback[];
  frame_samples: string[];
  status: PromoStatus;
}

export interface RenderProgress {
  job_id: string;
  status: PromoStatus;
  phase: RenderPhase;
  pass_number: number;
  variant: string | null;
  variant_index: number;
  variant_total: number;
  rendered: number;
  total: number;
  frames_uploaded: number;
  message: string;
  error: string | null;
  updated_at: string;
}

export interface PipelineStats extends AmplificationStats {
  promos: number;
  variants_delivered: number;
  frame_bytes_human: string;
  variant_bytes_human: string;
}

export interface PassVolumePoint {
  label: string;
  frame_bytes: number;
  variant_bytes: number;
}

export interface PromoDefaults {
  product: string;
  title: string;
  capture_url: string;
  preset: string;
  bpm: number;
  fps: number;
  width: number;
  height: number;
  variants: string[];
  accent: string;
  bpm_options: number[];
  resolution_options: { width: number; height: number; label: string }[];
  variant_options: VariantSpec[];
  viewport_options: { id: string; label: string; width: number; height: number }[];
  accent_options: string[];
  preset_options: StoryboardPreset[];
  render_preset: string;
  render_concurrency: number;
  frame_upload_enabled: boolean;
}

export interface AssetEntry {
  key: string;
  name: string;
  kind: "capture" | "bgm" | "sfx" | "brand" | "other";
  group: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  updated_at: string;
  url: string | null;
}

export interface AssetLibrary {
  product: string;
  prefix: string;
  entries: AssetEntry[];
}

export interface CaptureEntry {
  key: string;
  viewport: string;
  label: string;
  size_bytes: number;
}

export interface CaptureResponse {
  product: string;
  url: string;
  engine: "playwright" | "placeholder";
  note: string;
  captures: CaptureEntry[];
}

export interface CaptureInput {
  product: string;
  url: string;
  viewports: string[];
  accent: string;
  name?: string;
}

export interface CreatePromoInput {
  product: string;
  title: string;
  preset: string;
  bpm: number;
  width: number;
  height: number;
  accent: string;
  variants: string[];
  capture_url: string;
  viewports: string[];
}

export interface ShotPatch {
  card: string;
  duration_frames: number;
  headline: string;
  sub: string;
  sfx: string;
  capture: string | null;
}

export interface UpdatePromoInput {
  title?: string;
  bpm?: number;
  accent?: string;
  variants?: string[];
  shots?: ShotPatch[];
}
