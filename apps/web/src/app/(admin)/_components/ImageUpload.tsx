"use client";

import clsx from "clsx";
import {
  AlertCircle,
  CheckCircle2,
  ImageOff,
  ImagePlus,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type DragEvent } from "react";

import { buttonStyles } from "@/components/ui/Button";
import { SmartImage } from "@/components/ui/SmartImage";
import { uploadMedia as uploadOriginal } from "@/lib/api-admin";
import { uploadMedia as uploadProcessed } from "@/lib/api-media";
import {
  MEDIA_ALLOWED_IMAGE_MIME,
  MEDIA_MAX_BYTES,
  formatMediaSize,
} from "@/types/media";

interface ImageUploadProps {
  /** Current image URL (from the backend), or null when there is none. */
  value: string | null;
  /**
   * Called with the uploaded server URL after a successful upload. The parent
   * form writes it into its state and PATCHes it on the next save. Called with
   * `null` when the user removes the image.
   */
  onUpload: (serverUrl: string | null) => void;
  /** Alt text for the preview. */
  alt?: string;
  /** Aspect ratio of the preview (default square, like the menu's dish cards). */
  aspectClassName?: string;
  /** Width cap of the frame (default `max-w-xs`). */
  widthClassName?: string;
  /** CSRF token — required for the multipart POST. */
  csrfToken: string | null;
  /** Surface a user-visible error to the parent form as well. */
  onError?: (message: string) => void;
  /**
   * `true`: send the file through the processing pipeline — EXIF-rotated,
   * resized to fit 1920 × 1080, a 400 px thumbnail is made and the file shows
   * up in the media library. The right choice for photos of dishes: a phone
   * photo is 3–5 MB and is otherwise sent to every customer as is.
   * `false` (default): the file is stored untouched — what a logo with a
   * transparent background needs (processing flattens transparency to black).
   */
  processed?: boolean;
  /** Title of the empty drop zone. */
  emptyTitle?: string;
  /** What "Kaydet" does with the change; shown after an upload / removal. */
  saveHint?: string;
}

type Phase = "idle" | "uploading" | "processing";

/** "5 MB" — `formatMediaSize` would print "5.00 MB". */
const MAX_SIZE_LABEL = `${Math.round(MEDIA_MAX_BYTES / (1024 * 1024))} MB`;

/**
 * ImageUpload — an OPTIONAL image field: drop zone → preview → replace / remove.
 *
 * - Pick a file or drag one onto the zone (on a phone the OS offers camera,
 *   gallery and files). Only JPG, PNG and WEBP are accepted — listing exactly
 *   those also makes iPhones convert HEIC photos to JPEG on the way in.
 * - The type and the 5 MB limit are checked BEFORE uploading, with a plain
 *   Turkish message, instead of waiting for the server to refuse the file.
 * - While uploading the local file is previewed with a progress bar; once the
 *   upload is done the preview switches to the file the SERVER now serves, so
 *   an image that cannot actually be loaded shows up here and not on the public
 *   menu first.
 * - Nothing is required: leaving the zone empty is a valid state, and removing
 *   a photo returns the dish to a text-only card.
 *
 * The parent form decides when the change is saved (`onUpload`), so this never
 * touches the item itself.
 */
export function ImageUpload({
  value,
  onUpload,
  alt = "Görsel önizleme",
  aspectClassName = "aspect-square",
  widthClassName = "max-w-xs",
  csrfToken,
  onError,
  processed = false,
  emptyTitle = "Fotoğraf ekle",
  saveHint = "Kaydet'e bastığınızda uygulanır.",
}: ImageUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(value);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // Follow the parent when it hands in a new value (e.g. after a save).
  useEffect(() => {
    setServerUrl(value);
  }, [value]);

  // Free the object URL when it is replaced or the component goes away.
  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  const busy = phase !== "idle";
  const display = localPreview ?? serverUrl;
  const hasImage = Boolean(display);

  const fail = (message: string) => {
    setError(message);
    setNotice(null);
    onError?.(message);
  };

  const handleFile = async (file: File) => {
    setError(null);
    setNotice(null);

    if (!(MEDIA_ALLOWED_IMAGE_MIME as readonly string[]).includes(file.type)) {
      fail("Yalnızca JPG, PNG veya WEBP fotoğraf yükleyebilirsiniz.");
      return;
    }
    if (file.size > MEDIA_MAX_BYTES) {
      fail(
        `Bu fotoğraf ${formatMediaSize(file.size)}; en fazla ${MAX_SIZE_LABEL} olabilir. Daha küçük bir fotoğraf seçin.`,
      );
      return;
    }
    if (!csrfToken) {
      fail("Oturum doğrulaması eksik. Sayfayı yenileyip tekrar deneyin.");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setLocalPreview(objectUrl);
    setPhase("uploading");
    setProgress(0);

    try {
      let url: string;
      if (processed) {
        const asset = await uploadProcessed(file, {
          csrfToken,
          onProgress: ({ loaded, total }) => {
            const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
            setProgress(pct);
            // The bytes are on the server; what is left is resizing them.
            if (pct >= 100) setPhase("processing");
          },
        });
        url = asset.public_url;
      } else {
        url = (await uploadOriginal(file, { csrfToken })).url;
      }
      // Show the file the server now serves, not the local copy.
      setLocalPreview(null);
      setServerUrl(url);
      onUpload(url);
      setNotice(`Fotoğraf yüklendi. ${saveHint}`);
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Fotoğraf yüklenemedi.";
      setLocalPreview(null);
      fail(message);
    } finally {
      setPhase("idle");
    }
  };

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void handleFile(file);
    // Reset so picking the same file again still fires onChange.
    event.target.value = "";
  };

  const onClear = () => {
    setLocalPreview(null);
    setServerUrl(null);
    setError(null);
    setNotice(`Fotoğraf kaldırıldı. ${saveHint}`);
    onUpload(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!busy) setDragging(true);
  };
  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragEnter={onDragOver}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={clsx(
          "relative w-full overflow-hidden rounded-2xl transition-colors duration-200",
          "has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-primary has-[input:focus-visible]:ring-offset-2",
          widthClassName,
          aspectClassName,
          hasImage
            ? "bg-surface-low ring-1 ring-black/5"
            : clsx(
                "border-2 border-dashed",
                dragging
                  ? "border-primary bg-primary-soft"
                  : "border-input bg-surface-low hover:border-muted",
              ),
        )}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={MEDIA_ALLOWED_IMAGE_MIME.join(",")}
          onChange={onPick}
          disabled={busy}
          className="sr-only"
        />

        {hasImage ? (
          <SmartImage
            src={display}
            alt={alt}
            loading="eager"
            wrapperClassName="h-full w-full"
            className={clsx("transition-opacity", busy && "opacity-60")}
            fallback={
              <div className="flex flex-col items-center gap-2 px-4 text-center text-sm text-muted">
                <ImageOff className="h-7 w-7 text-outline" aria-hidden />
                <span>Fotoğraf görüntülenemiyor. Değiştirip yeniden yükleyin.</span>
              </div>
            }
          />
        ) : (
          <label
            htmlFor={inputId}
            className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2 p-4 text-center"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
              <ImagePlus className="h-6 w-6" aria-hidden />
            </span>
            <span className="text-sm font-semibold text-text">{emptyTitle}</span>
            <span className="text-xs text-muted">
              Sürükleyip bırakın veya dokunup seçin
            </span>
            <span className="text-xs text-outline">
              JPG, PNG veya WEBP · en fazla {MAX_SIZE_LABEL}
            </span>
          </label>
        )}

        {dragging ? (
          <div
            aria-hidden
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-primary/95 text-sm font-semibold text-primary-foreground"
          >
            <ImagePlus className="h-7 w-7" />
            Bırakın
          </div>
        ) : null}

        {busy ? (
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-black/65 to-transparent p-3 pt-10 text-white">
            <span className="flex items-center gap-1.5 text-xs font-semibold">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {phase === "processing"
                ? "Fotoğraf hazırlanıyor…"
                : processed
                  ? `Yükleniyor… %${progress}`
                  : "Yükleniyor…"}
            </span>
            {processed ? (
              <span
                role="progressbar"
                aria-label="Yükleme ilerlemesi"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                className="h-1.5 overflow-hidden rounded-full bg-white/30"
              >
                <span
                  className="block h-full rounded-full bg-white transition-[width] duration-200"
                  style={{ width: `${progress}%` }}
                />
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {hasImage && !busy ? (
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor={inputId}
            className={buttonStyles({
              variant: "outline",
              size: "sm",
              className: "cursor-pointer",
            })}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Değiştir
          </label>
          <button
            type="button"
            onClick={onClear}
            aria-label="Fotoğrafı kaldır"
            className={buttonStyles({ variant: "danger-soft", size: "sm" })}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Kaldır
          </button>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="flex max-w-xs items-start gap-1.5 text-sm font-medium text-danger"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : notice ? (
        <p
          role="status"
          className="flex max-w-xs items-start gap-1.5 text-sm text-success"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{notice}</span>
        </p>
      ) : null}
    </div>
  );
}
