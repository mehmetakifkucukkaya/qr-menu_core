"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  ImagePlus,
  Loader2,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import clsx from "clsx";

import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import {
  uploadMedia,
  AdminApiError,
  type UploadMediaProgress,
} from "@/lib/api-media";
import {
  MEDIA_ALLOWED_IMAGE_MIME,
  MEDIA_MAX_BYTES,
  formatMediaSize,
  type MediaAsset,
  type MediaKind,
} from "@/types/media";

type UploadStatus =
  | { phase: "idle" }
  | { phase: "uploading"; progress: number; filename: string }
  | { phase: "success"; asset: MediaAsset }
  | { phase: "error"; message: string };

interface MediaUploaderProps {
  /** Kind filter — V1 backend only accepts 'image'. Kept in the prop
   *  signature so the contract is ready for video/audio in V2. */
  kind: MediaKind;
  /** CSRF token — required for the multipart POST. The admin layout
   *  pre-reads `qr_csrftoken` from cookies and passes it down. */
  csrfToken: string | null;
  /** Optional alt text — stored on MediaAsset.alt_text. */
  altText?: string;
  /** Per-file size cap (defaults to backend's 5 MB ceiling). */
  maxSizeMB?: number;
  /** Called after a single asset has been uploaded successfully. The
   *  parent can stash the asset in its own state and re-render the
   *  gallery below. */
  onUploadComplete: (asset: MediaAsset) => void;
  /** Optional renderer for the preview row — lets the caller drop in
   *  their own copy ("Yüklendi: file.jpg"). */
  renderPreview?: (asset: MediaAsset) => React.ReactNode;
}

interface PendingFile {
  file: File;
  previewUrl: string;
  status: UploadStatus;
}

const DEFAULT_MAX_SIZE_MB = Math.round(MEDIA_MAX_BYTES / (1024 * 1024));

function progressPercent(progress: UploadMediaProgress): number {
  if (!progress.total) return 0;
  return Math.min(100, Math.round((progress.loaded / progress.total) * 100));
}

/**
 * MediaUploader — Sprint E2 (D-033).
 *
 * Multi-file drag-drop + click-to-browse uploader for the new
 * MediaAsset pipeline. Validates MIME + size client-side (mirrors the
 * backend guards so the user gets instant feedback) and shows a per-file
 * progress bar wired to XMLHttpRequest's `upload.onprogress` event.
 *
 * On success the asset is bubbled up via `onUploadComplete` so the
 * surrounding page (the gallery, or a parent form) can keep its own
 * state in sync. On failure the row turns red with the backend's
 * structured error message.
 *
 * Dark mode: relies on Tailwind surface/border/text tokens — no
 * bespoke dark-mode overrides.
 * Reduced motion: progress bar transition uses `motion-reduce:` so the
 * width animation respects `prefers-reduced-motion`.
 */
export function MediaUploader({
  kind,
  csrfToken,
  altText,
  maxSizeMB = DEFAULT_MAX_SIZE_MB,
  onUploadComplete,
  renderPreview,
}: MediaUploaderProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const dragCounter = useRef(0);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const maxBytes = maxSizeMB * 1024 * 1024;

  // Cleanup ObjectURLs on unmount + when a pending row is cleared.
  useEffect(() => {
    const controllers = abortControllersRef.current;
    return () => {
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      controllers.forEach((ctrl) => ctrl.abort());
    };
    // We intentionally only run cleanup on unmount — re-running this
    // effect on every `pending` change would abort in-flight uploads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validateFile = useCallback(
    (file: File): string | null => {
      if (kind === "image") {
        if (
          !MEDIA_ALLOWED_IMAGE_MIME.includes(
            file.type as (typeof MEDIA_ALLOWED_IMAGE_MIME)[number],
          )
        ) {
          return `Sadece JPG / PNG / WEBP kabul edilir (seçilen tip: ${file.type || "bilinmiyor"}).`;
        }
      }
      if (file.size > maxBytes) {
        return `Dosya boyutu ${maxSizeMB} MB sınırını aşıyor (${formatMediaSize(file.size)}).`;
      }
      return null;
    },
    [kind, maxBytes, maxSizeMB],
  );

  const enqueueFiles = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (!arr.length) return;
      if (!csrfToken) {
        setPending((rows) => [
          ...rows,
          {
            file: arr[0],
            previewUrl: "",
            status: {
              phase: "error",
              message: "CSRF token eksik. Sayfayı yenileyin.",
            },
          },
        ]);
        return;
      }
      const validated: PendingFile[] = [];
      for (const file of arr) {
        const errorMessage = validateFile(file);
        if (errorMessage) {
          validated.push({
            file,
            previewUrl: "",
            status: { phase: "error", message: errorMessage },
          });
          continue;
        }
        const previewUrl = file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : "";
        validated.push({
          file,
          previewUrl,
          status: { phase: "idle" },
        });
      }
      setPending((rows) => [...rows, ...validated]);
      // Kick off uploads sequentially so a multi-file selection
      // doesn't fire N concurrent XHRs against the backend.
      void runQueue(validated);
    },
    // `runQueue` is intentionally not in the dep array — it's defined
    // inline as `async` below and only reads `uploadOne` via closure,
    // both of which are stable across renders. Listing it would cause
    // spurious re-creations of `enqueueFiles` and break memoised
    // consumers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [csrfToken, validateFile],
  );

  // Sequential queue runner — awaits each upload so the progress bars
  // animate one-after-another rather than racing each other.
  const runQueue = async (rows: PendingFile[]) => {
    for (const row of rows) {
      if (row.status.phase !== "idle") continue;
      await uploadOne(row);
    }
  };

  const uploadOne = async (row: PendingFile) => {
    const key = `${row.file.name}-${row.file.size}-${row.file.lastModified}`;
    const controller = new AbortController();
    abortControllersRef.current.set(key, controller);
    setPending((rows) =>
      rows.map((r) =>
        r === row
          ? { ...r, status: { phase: "uploading", progress: 0, filename: row.file.name } }
          : r,
      ),
    );
    try {
      const asset = await uploadMedia(row.file, {
        csrfToken: csrfToken ?? "",
        altText,
        signal: controller.signal,
        onProgress: (p) => {
          setPending((rows) =>
            rows.map((r) =>
              r === row && r.status.phase === "uploading"
                ? {
                    ...r,
                    status: {
                      phase: "uploading",
                      progress: progressPercent(p),
                      filename: row.file.name,
                    },
                  }
                : r,
            ),
          );
        },
      });
      setPending((rows) =>
        rows.map((r) => (r === row ? { ...r, status: { phase: "success", asset } } : r)),
      );
      onUploadComplete(asset);
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Dosya yüklenemedi.";
      setPending((rows) =>
        rows.map((r) =>
          r === row ? { ...r, status: { phase: "error", message } } : r,
        ),
      );
    } finally {
      abortControllersRef.current.delete(key);
    }
  };

  const clearRow = (row: PendingFile) => {
    if (row.previewUrl) URL.revokeObjectURL(row.previewUrl);
    setPending((rows) => rows.filter((r) => r !== row));
  };

  const onDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.items?.length) {
      setIsDragging(true);
    }
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      enqueueFiles(e.dataTransfer.files);
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      enqueueFiles(e.target.files);
    }
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-4" data-testid="media-uploader">
      <Card variant="outline" className="p-0">
        <div
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
          data-testid="media-uploader-dropzone"
          className={clsx(
            "flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
            isDragging
              ? "border-primary bg-primary/5 text-primary"
              : "border-border bg-background text-muted",
          )}
        >
          <UploadCloud
            className={clsx(
              "h-8 w-8 transition-transform motion-reduce:transition-none",
              isDragging ? "scale-110 motion-reduce:scale-100" : "",
            )}
            aria-hidden
          />
          <p className="text-sm font-medium text-text">
            {isDragging
              ? "Dosyaları buraya bırakın"
              : "Görseli sürükleyip bırakın ya da tıklayın"}
          </p>
          <p className="text-xs">
            JPG / PNG / WEBP · maks. {maxSizeMB} MB · birden fazla dosya seçebilirsiniz
          </p>
          <label
            htmlFor={inputId}
            className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            <ImagePlus className="h-4 w-4" aria-hidden />
            Dosya seç
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            multiple
            accept={kind === "image" ? "image/jpeg,image/png,image/webp" : undefined}
            onChange={onPick}
            data-testid="media-uploader-input"
            className="sr-only"
          />
        </div>
      </Card>

      {pending.length > 0 ? (
        <ul
          aria-label="Yükleme kuyruğu"
          data-testid="media-uploader-queue"
          className="flex flex-col gap-2"
        >
          {pending.map((row) => (
            <li
              key={`${row.file.name}-${row.file.lastModified}`}
              data-testid="media-uploader-row"
              data-status={row.status.phase}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background">
                {row.previewUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={row.previewUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImagePlus className="h-5 w-5 text-muted" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">
                  {row.file.name}
                </p>
                <p className="text-xs text-muted">
                  {formatMediaSize(row.file.size)}
                </p>
                {row.status.phase === "uploading" ? (
                  <div
                    className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-background"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={row.status.progress}
                    aria-label={`${row.file.name} yükleme durumu`}
                  >
                    <div
                      className="h-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
                      style={{ width: `${row.status.progress}%` }}
                    />
                  </div>
                ) : null}
                {row.status.phase === "success" ? (
                  renderPreview ? (
                    renderPreview(row.status.asset)
                  ) : (
                    <p className="mt-1 text-xs text-success">
                      Yüklendi — {row.status.asset.original_filename}
                    </p>
                  )
                ) : null}
                {row.status.phase === "error" ? (
                  <p
                    role="alert"
                    className="mt-1 inline-flex items-start gap-1 text-xs text-danger"
                  >
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                    <span>{row.status.message}</span>
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-1">
                {row.status.phase === "uploading" ? (
                  <Loader2
                    className="h-4 w-4 animate-spin text-primary"
                    aria-hidden
                  />
                ) : null}
                {row.status.phase === "error" ? (
                  <IconButton
                    ariaLabel="Yeniden dene"
                    icon={<UploadCloud className="h-4 w-4" />}
                    onClick={() => void uploadOne(row)}
                    variant="outline"
                    size="sm"
                  />
                ) : null}
                <IconButton
                  ariaLabel="Listeden kaldır"
                  icon={
                    row.status.phase === "success" ? (
                      <Trash2 className="h-4 w-4" />
                    ) : (
                      <X className="h-4 w-4" />
                    )
                  }
                  onClick={() => clearRow(row)}
                  variant="ghost"
                  size="sm"
                />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Surface a sensible error message for the parent form when MediaUploader
 * rejects a file before it ever hits the network. Exposed for tests.
 */
export function describeValidationError(file: File, kind: MediaKind, maxSizeMB: number): string | null {
  if (kind === "image") {
    if (
      !MEDIA_ALLOWED_IMAGE_MIME.includes(
        file.type as (typeof MEDIA_ALLOWED_IMAGE_MIME)[number],
      )
    ) {
      return "Yalnızca JPG / PNG / WEBP görselleri kabul edilir.";
    }
  }
  if (file.size > maxSizeMB * 1024 * 1024) {
    return "Dosya boyutu sınırı aşıyor.";
  }
  return null;
}

// Keep AdminApiError re-exported so callers can branch on error codes
// without pulling in the api-media module separately.
export { AdminApiError };