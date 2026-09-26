"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, X } from "lucide-react";

interface ImageUploadProps {
  /** Current image URL (from backend). */
  value: string | null;
  /** Called when the user picks or clears an image.
   *  Receives a File when the user picked one (so the parent can upload
   *  via multipart/form-data), or `null` when they cleared it. */
  onChange: (next: { file: File | null; preview: string | null }) => void;
  /** Optional alt text for the preview. */
  alt?: string;
  /** Optional fixed aspect class (default "aspect-square"). */
  aspectClassName?: string;
}

/**
 * ImageUpload — file picker + preview + remove button.
 *
 * V1 limitation (D-011): image storage is local MEDIA_ROOT; cloud storage
 * (S3/R2) lands in Sprint 5. For now this component:
 *   - Accepts the current image URL via `value` (read-only preview).
 *   - Lets the user pick a new File — stored locally as an ObjectURL
 *     so the parent can preview it before committing.
 *   - The actual upload happens when the parent form POSTs the File as
 *     `multipart/form-data`. The admin API client (`api-admin.ts`) uses
 *     JSON; the parent form is responsible for sending the multipart
 *     payload (see MenuItemForm for how this is wired).
 *
 * Why not just upload immediately?
 *   - We want the operator to see the preview before committing.
 *   - Image upload is best-effort in V1 — the form should succeed even
 *     if the image upload fails (e.g. unsupported MIME type).
 */
export function ImageUpload({
  value,
  onChange,
  alt = "Görsel önizleme",
  aspectClassName = "aspect-square",
}: ImageUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // Clean up ObjectURLs to avoid leaks.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Revoke the previous preview before swapping.
    if (preview) URL.revokeObjectURL(preview);
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    onChange({ file, preview: objectUrl });
    // Reset the input so picking the same file again still fires onChange.
    e.target.value = "";
  };

  const onClear = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    onChange({ file: null, preview: null });
  };

  const display = preview ?? value;

  return (
    <div className="flex flex-col gap-2">
      <div
        className={
          "relative w-full max-w-xs overflow-hidden rounded-lg border border-dashed border-border bg-background " +
          aspectClassName
        }
      >
        {display ? (
          // Use plain <img> for object-URL previews (next/image would need
          // a domain whitelist and we can't predict cloud URLs in V1).
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={display}
            alt={alt}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted">
            <div className="flex flex-col items-center gap-1 text-xs">
              <ImagePlus className="h-6 w-6" aria-hidden />
              <span>Görsel seçilmedi</span>
            </div>
          </div>
        )}
        {display ? (
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

      <div className="flex items-center gap-2">
        <label
          htmlFor={inputId}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition hover:bg-background"
        >
          <ImagePlus className="h-3.5 w-3.5" />
          {display ? "Değiştir" : "Görsel seç"}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/*"
          onChange={onPick}
          className="sr-only"
        />
        {preview ? (
          <span className="text-xs italic text-muted">
            Kaydedilmemiş önizleme
          </span>
        ) : value ? (
          <span className="text-xs italic text-muted">Mevcut görsel</span>
        ) : null}
      </div>
      <p className="text-[10px] text-muted">
        V1'de görsel kaydetme multipart upload ile çalışır (Sprint 5'te cloud
        storage'a geçilecek — D-011).
      </p>
    </div>
  );
}
