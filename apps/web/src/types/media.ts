/**
 * TypeScript mirror of the MediaAsset REST API (Sprint E1 / D-033).
 *
 * The backend is the source of truth — if a field shape changes there,
 * mirror it here on the same commit. The wire format is owned by
 * `backend/apps/media/serializers.py::MediaAssetSerializer`.
 *
 * Conventions:
 *  - All timestamps are ISO-8601 strings (`created_at`, `updated_at`).
 *  - `public_url` and `thumbnail_url` are absolute URLs (backend resolves
 *    them through `Request.build_absolute_uri(media.url)`).
 *  - `size_bytes` is a positive integer (DRF PositiveBigIntegerField).
 *  - `kind` is the open enum below — the backend's `MediaKind` TextChoices
 *    may grow in V2 (e.g. `document`), keep this union in sync.
 */

export type MediaKind = "image" | "video" | "audio" | "file";

export interface MediaAsset {
  id: number;
  kind: MediaKind;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  storage_key: string;
  public_url: string;
  width: number | null;
  height: number | null;
  alt_text: string;
  uploaded_by_email: string | null;
  thumbnail_url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Default 5 MB cap — mirrors backend `MAX_SIZE_BYTES` in views_mediaasset. */
export const MEDIA_MAX_BYTES = 5 * 1024 * 1024;

/** Image MIME whitelist — mirrors backend `ALLOWED_MIME_TYPES`. */
export const MEDIA_ALLOWED_IMAGE_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Human-readable size formatter used by gallery tiles + upload status. */
export function formatMediaSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}