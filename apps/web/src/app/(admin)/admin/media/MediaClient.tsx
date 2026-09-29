"use client";

import { useCallback, useState } from "react";

import { MediaGallery } from "@/components/admin/MediaGallery";
import { MediaUploader } from "@/components/admin/MediaUploader";
import type { MediaAsset } from "@/types/media";

interface MediaClientProps {
  csrfToken: string | null;
  /** Server-prefetched assets (image kind only, V1). */
  initialAssets: MediaAsset[];
  /** When false, hides the uploader (e.g. for an embed-only flow). */
  showUploader?: boolean;
}

/**
 * MediaClient — client wrapper for the `/admin/media` page.
 *
 * Owns the local asset list so an upload triggers an immediate gallery
 * refresh (no second round-trip needed). The page-level header keeps
 * the initial server-prefetched count as a "Toplam X medya" badge — we
 * don't try to live-bind that number (it would flicker on every upload).
 */
export function MediaClient({
  csrfToken,
  initialAssets,
  showUploader = true,
}: MediaClientProps) {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploadComplete = useCallback(() => {
    // Re-fetch the gallery so the new tile appears. We avoid mutating
    // local state directly because the server response is the source
    // of truth (thumbnail_url, width/height etc.).
    setRefreshKey((k) => k + 1);
  }, []);

  const handleDelete = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {showUploader ? (
        <section
          aria-label="Yeni medya yükle"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 className="mb-3 font-heading text-base font-semibold text-text">
            Yeni görsel yükle
          </h2>
          <MediaUploader
            kind="image"
            csrfToken={csrfToken}
            maxSizeMB={5}
            onUploadComplete={handleUploadComplete}
          />
        </section>
      ) : null}

      <section
        aria-label="Mevcut medya"
        className="rounded-xl border border-border bg-surface p-4 shadow-sm"
      >
        <h2 className="mb-3 font-heading text-base font-semibold text-text">
          Mevcut medya
        </h2>
        <MediaGallery
          kind="image"
          csrfToken={csrfToken}
          initialAssets={initialAssets}
          refreshKey={refreshKey}
          onDelete={handleDelete}
        />
      </section>
    </div>
  );
}