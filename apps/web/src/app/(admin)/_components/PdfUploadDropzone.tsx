"use client";

import { useId, useRef, useState } from "react";
import { FileUp, Loader2, X } from "lucide-react";

import { uploadPdfImport, AdminApiError } from "@/lib/api-admin";
import type { PdfUploadResponse } from "@/types/admin";

interface PdfUploadDropzoneProps {
  /** CSRF token — required for the multipart POST. */
  csrfToken: string | null;
  /**
   * Called after a successful upload + AI parse. The parent receives
   * the parsed draft summary and decides how to navigate (router.push
   * to the detail page, etc).
   */
  onSuccess: (result: PdfUploadResponse) => void;
}

/** 10 MB — mirrors the backend `PDF_IMPORT_MAX_SIZE_BYTES` constant. */
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_BYTES_LABEL = "10 MB";

/**
 * PdfUploadDropzone — Sprint 7B.
 *
 * Two ways to feed a PDF in:
 *   1. Drag & drop anywhere on the dropzone surface.
 *   2. Click the surface (or "Dosya seç" button) to open the native
 *      file picker fallback.
 *
 * On a successful selection we POST the file as multipart/form-data to
 * `/api/v1/admin/pdf-import/upload/`. The backend handles the AI parse
 * synchronously (OpenAI primary, Anthropic fallback) and returns a
 * `PdfUploadResponse` with the new `draft_id` and the parse stats.
 * We then bubble that up via `onSuccess` so the parent can route to
 * the detail page.
 *
 * Client-side validation mirrors the backend (mime + size) so the user
 * gets instant feedback without a wasted round-trip.
 */
export function PdfUploadDropzone({
  csrfToken,
  onSuccess,
}: PdfUploadDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const dragCounter = useRef(0);

  const reset = () => {
    setPickedFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  /**
   * Validate the picked file (client-side mirror of the backend guard)
   * and stash it. The upload kicks off only when the user clicks the
   * "Yükle ve Analiz Et" button — this lets them swap files without a
   * half-baked request already in flight.
   */
  const acceptFile = (file: File | null | undefined) => {
    if (!file) return;
    setError(null);

    if (file.type !== "application/pdf") {
      setError(
        `Sadece PDF dosyaları kabul edilir (seçilen tip: ${file.type || "bilinmiyor"}).`,
      );
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(
        `Dosya boyutu ${MAX_BYTES_LABEL} sınırını aşıyor (${(file.size / (1024 * 1024)).toFixed(2)} MB).`,
      );
      return;
    }
    setPickedFile(file);
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
    // Required so `drop` fires.
    e.preventDefault();
    e.stopPropagation();
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    acceptFile(file);
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    acceptFile(file);
    // Reset so the same file can be re-selected.
    e.target.value = "";
  };

  const onSubmit = async () => {
    if (!pickedFile) return;
    if (!csrfToken) {
      setError("CSRF token eksik. Sayfayı yenileyin.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const result = await uploadPdfImport(pickedFile, { csrfToken });
      onSuccess(result);
    } catch (err) {
      const message =
        err instanceof AdminApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "PDF yüklenemedi.";
      setError(message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        role="button"
        tabIndex={0}
        aria-label="PDF dosyasını buraya sürükle veya seç"
        onClick={() => {
          if (!uploading) inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !uploading) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-surface px-6 py-10 text-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary " +
          (isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/60 hover:bg-background") +
          (uploading ? " pointer-events-none opacity-60" : "")
        }
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <FileUp className="h-6 w-6" aria-hidden />
        </div>
        <div>
          <p className="font-heading text-base font-semibold text-text">
            {isDragging
              ? "PDF'i buraya bırakın"
              : "PDF dosyasını sürükleyin veya tıklayın"}
          </p>
          <p className="mt-1 text-xs text-muted">
            Maks. {MAX_BYTES_LABEL} · sadece <code className="font-mono">application/pdf</code>
          </p>
        </div>
        <label
          htmlFor={inputId}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition hover:bg-background"
        >
          Dosya seç
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="application/pdf,.pdf"
          onChange={onPick}
          disabled={uploading}
          className="sr-only"
        />
      </div>

      {pickedFile ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-2 text-sm">
          <div className="flex min-w-0 items-center gap-2">
            <FileUp className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="truncate font-medium text-text">
              {pickedFile.name}
            </span>
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted">
              {(pickedFile.size / (1024 * 1024)).toFixed(2)} MB
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSubmit}
              disabled={uploading}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  AI analiz ediyor…
                </>
              ) : (
                <>
                  <FileUp className="h-4 w-4" />
                  Yükle ve Analiz Et
                </>
              )}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={uploading}
              aria-label="Seçimi temizle"
              className="inline-flex items-center justify-center rounded-md border border-border bg-surface p-2 text-muted transition hover:bg-background hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-sm text-accent"
        >
          {error}
        </p>
      ) : null}

      <p className="text-xs text-muted">
        AI sağlayıcı: önce OpenAI <code className="font-mono">gpt-4o</code>, hata
        durumunda Anthropic <code className="font-mono">claude-3-5-sonnet</code>{" "}
        fallback. Parse genelde 5–30 saniye sürer; bu süre boyte sayfayı
        kapatmayın.
      </p>
    </div>
  );
}