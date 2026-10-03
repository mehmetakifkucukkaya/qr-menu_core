"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";

import { uploadMedia } from "@/lib/api-admin";

interface ImageUploadProps {
  /** Current image URL (from backend). Read-only preview when no new file is picked. */
  value: string | null;
  /**
   * Called with the uploaded server URL after a successful multipart
   * POST. The parent form should write this URL into the relevant
   * model field (MenuItem.image / Organization.logo / etc.) and PATCH
   * it on next save. Called with `null` when the user clears the image.
   */
  onUpload: (serverUrl: string | null) => void;
  /** Optional alt text for the preview. */
  alt?: string;
  /** Optional fixed aspect class (default "aspect-square"). */
  aspectClassName?: string;
  /** CSRF token — required for the multipart POST. */
  csrfToken: string | null;
  /** Optional surface a user-visible error to the parent form. */
  onError?: (message: string) => void;
}

/**
 * ImageUpload — file picker + preview + multipart upload + remove.
 *
 * Flow:
 *   1. User picks a file via the native input.
 *   2. We render an immediate local preview (ObjectURL) so the operator
 *      gets instant feedback.
 *   3. We POST the file as `multipart/form-data` to
 *      `/api/v1/admin/media/upload`. The backend returns a permanent
 *      server URL.
 *   4. We call `onUpload(serverUrl)` so the parent form can stash it
 *      in its state and PATCH it on the next item/business save.
 *   5. On error (invalid mime / size / network) we surface the message
 *      via `onError` and reset the local preview.
 *
 * Storage is local MEDIA_ROOT in V1 (D-011); cloud storage (S3/R2) lands
 * in Sprint 6 / V2. The API contract is identical regardless of backend
 * storage.
 */
export function ImageUpload({
  value,
  onUpload,
  alt = "Görsel önizleme",
  aspectClassName = "aspect-square",
  csrfToken,
  onError,
}: ImageUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(value);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep serverUrl in sync if the parent passes a new `value` (e.g. after
  // a successful PATCH round-trip).
  useEffect(() => {
    setServerUrl(value);
  }, [value]);

  // Clean up ObjectURLs to avoid leaks.
  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  const handleFile = async (file: File) => {
    setError(null);
    // Optimistic preview before the upload lands.
    if (localPreview) URL.revokeObjectURL(localPreview);
    const objectUrl = URL.createObjectURL(file);
    setLocalPreview(objectUrl);
    if (!csrfToken) {
      const msg = "CSRF token eksik. Sayfayı yenileyin.";
      setError(msg);
      onError?.(msg);
      return;
    }
    setUploading(true);
    try {
      const result = await uploadMedia(file, { csrfToken });
      setServerUrl(result.url);
      onUpload(result.url);
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Görsel yüklenemedi.";
      setError(msg);
      // Roll back the local preview so the operator sees the failure state.
      URL.revokeObjectURL(objectUrl);
      setLocalPreview(null);
      onError?.(msg);
    } finally {
      setUploading(false);
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void handleFile(file);
    // Reset the input so picking the same file again still fires onChange.
    e.target.value = "";
  };

  const onClear = () => {
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(null);
    setError(null);
    setServerUrl(null);
    onUpload(null);
    // Reset native input so the same file can be picked again.
    if (inputRef.current) inputRef.current.value = "";
  };

  // Display priority: optimistic local preview > uploaded server URL > value.
  const display = localPreview ?? serverUrl ?? value;
  const hasImage = Boolean(display);
  const isUploadInFlight = uploading;

  return (
    <div className="flex flex-col gap-2">
      <div
        className={
          "relative w-full max-w-xs overflow-hidden rounded-lg border border-dashed border-border bg-background " +
          aspectClassName
        }
      >
        {hasImage ? (
          // Use plain <img> for object-URL previews (next/image would need
          // a domain whitelist and we can't predict cloud URLs in V1).
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={display as string}
            alt={alt}
            className={
              "h-full w-full object-cover transition-opacity " +
              (isUploadInFlight ? "opacity-60" : "opacity-100")
            }
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted">
            <div className="flex flex-col items-center gap-1 text-xs">
              <ImagePlus className="h-6 w-6" aria-hidden />
              <span>Görsel seçilmedi</span>
            </div>
          </div>
        )}
        {isUploadInFlight ? (
          <div
            className="absolute inset-0 flex items-center justify-center bg-text/30"
            aria-hidden
          >
            <Loader2 className="h-6 w-6 animate-spin text-primary-foreground" />
          </div>
        ) : null}
        {hasImage && !isUploadInFlight ? (
          <button
            type="button"
            onClick={onClear}
            aria-label="Görseli kaldır"
            className="absolute right-2 top-2 inline-flex items-center justify-center rounded-full bg-text/70 p-1.5 text-primary-foreground transition hover:bg-text"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="text-xs text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <label
          htmlFor={inputId}
          className={
            "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition hover:bg-background " +
            (isUploadInFlight ? "pointer-events-none opacity-60" : "")
          }
        >
          <ImagePlus className="h-3.5 w-3.5" />
          {hasImage ? "Değiştir" : "Görsel seç"}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/*"
          onChange={onPick}
          disabled={isUploadInFlight}
          className="sr-only"
        />
        {isUploadInFlight ? (
          <span className="inline-flex items-center gap-1 text-xs italic text-muted">
            <Loader2 className="h-3 w-3 animate-spin" />
            Yükleniyor…
          </span>
        ) : localPreview ? (
          <span className="text-xs italic text-muted">Yüklenmiş önizleme</span>
        ) : serverUrl ?? value ? (
          <span className="text-xs italic text-muted">Mevcut görsel</span>
        ) : null}
      </div>
      <p className="text-[10px] text-muted">
        JPG / PNG / WEBP · maks. 5 MB. Yükleme multipart üzerinden
        /api/v1/admin/media/upload endpoint&apos;ine gider.
      </p>
    </div>
  );
}