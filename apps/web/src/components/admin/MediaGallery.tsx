"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  Film,
  Filter,
  Image as ImageIcon,
  Loader2,
  Music,
  RefreshCw,
  Trash2,
} from "lucide-react";
import clsx from "clsx";

import { ConfirmDialog } from "@/app/(admin)/_components/ConfirmDialog";
import { IconButton } from "@/components/ui/IconButton";
import { AdminEmptyState } from "@/app/(admin)/_components/EmptyState";
import {
  deleteMedia,
  listMedia,
  AdminApiError,
} from "@/lib/api-media";
import {
  formatMediaSize,
  type MediaAsset,
  type MediaKind,
} from "@/types/media";

type FilterKind = "all" | MediaKind;

interface MediaGalleryProps {
  /** Optional kind filter — restricts the gallery to a single kind
   *  (e.g. 'image'). When undefined, the gallery defaults to 'image'
   *  (the only kind V1 backend accepts). */
  kind?: MediaKind;
  /** CSRF token — required by `deleteMedia`. */
  csrfToken: string | null;
  /** Click handler — when supplied, tiles render a "Kullan" button
   *  and notify the parent with the selected asset (useful for
   *  embedding into a form picker). */
  onSelect?: (asset: MediaAsset) => void;
  /** Optional delete callback — fires after a successful soft-delete
   *  so the parent can refresh its own state. */
  onDelete?: (id: number) => void;
  /** Optional refetch trigger — bumps to re-fetch. */
  refreshKey?: number;
  /** Optional initial assets (server-prefetched). When supplied the
   *  gallery skips the first GET and renders immediately. */
  initialAssets?: MediaAsset[];
}

const FILTER_OPTIONS: Array<{ value: FilterKind; label: string; icon: typeof ImageIcon }> = [
  { value: "image", label: "Görseller", icon: ImageIcon },
  { value: "video", label: "Videolar", icon: Film },
  { value: "audio", label: "Sesler", icon: Music },
];

function kindBadgeLabel(kind: MediaKind): string {
  switch (kind) {
    case "image":
      return "Görsel";
    case "video":
      return "Video";
    case "audio":
      return "Ses";
    case "file":
      return "Dosya";
  }
}

/**
 * MediaGallery — Sprint E2 (D-033).
 *
 * Lazy-loaded grid view of the tenant's MediaAsset rows. Defaults to
 * the 'image' kind (the only kind V1 accepts); a kind filter row at
 * the top swaps the filter so V2 can layer in video / audio without
 * a new page.
 *
 * Selection (optional): when `onSelect` is provided each tile shows
 * a "Kullan" button. Click → callback. This is the "pick from gallery"
 * flow that will replace the inline `ImageUpload` picker in Sprint E3.
 *
 * Delete (optional): when `onDelete` is provided each tile renders a
 * trash icon → ConfirmDialog → soft-delete → parent notification.
 *
 * Lazy load: when the page becomes visible (IntersectionObserver) we
 * fetch the first page. Manual refresh via the header refresh icon.
 */
export function MediaGallery({
  kind,
  csrfToken,
  onSelect,
  onDelete,
  refreshKey,
  initialAssets,
}: MediaGalleryProps) {
  const [filter, setFilter] = useState<FilterKind>(kind ?? "image");
  const [assets, setAssets] = useState<MediaAsset[]>(initialAssets ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<MediaAsset | null>(null);
  const [deleting, setDeleting] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const filterGroupId = useId();

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const kindParam = filter === "all" ? undefined : filter;
      const rows = await listMedia({ kind: kindParam });
      setAssets(rows);
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Medya listesi yüklenemedi.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  // Lazy load — only fetch the moment the gallery scrolls into view.
  useEffect(() => {
    if (initialAssets && initialAssets.length > 0) return;
    const node = sentinelRef.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          obs.disconnect();
          void fetchAssets();
        }
      },
      { rootMargin: "120px" },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [fetchAssets, initialAssets]);

  // Refresh when the parent bumps `refreshKey` or the filter changes
  // (after the first mount).
  useEffect(() => {
    if (initialAssets && initialAssets.length > 0) return;
    void fetchAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, refreshKey]);

  const handleDelete = async () => {
    if (!confirming) return;
    if (!csrfToken) {
      setError("CSRF token eksik. Sayfayı yenileyin.");
      setConfirming(null);
      return;
    }
    setDeleting(true);
    try {
      await deleteMedia(confirming.id, { fetchOptions: { csrfToken } });
      setAssets((rows) => rows.filter((r) => r.id !== confirming.id));
      onDelete?.(confirming.id);
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Silme başarısız.";
      setError(message);
    } finally {
      setDeleting(false);
      setConfirming(null);
    }
  };

  const showEmpty = !loading && assets.length === 0 && !error;

  const filterButtons = useMemo(
    () => [
      { value: "all" as const, label: "Tümü", icon: Filter },
      ...FILTER_OPTIONS,
    ],
    [],
  );

  return (
    <section
      aria-label="Medya galerisi"
      data-testid="media-gallery"
      className="flex flex-col gap-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="radiogroup"
          aria-label="Medya türü filtresi"
          id={filterGroupId}
          className="inline-flex flex-wrap items-center gap-1 rounded-full border border-border bg-surface p-1"
        >
          {filterButtons.map((opt) => {
            const Icon = opt.icon;
            const active = filter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setFilter(opt.value)}
                data-testid={`media-gallery-filter-${opt.value}`}
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted hover:bg-background hover:text-text",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {opt.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted" data-testid="media-gallery-count">
            {loading ? "Yükleniyor…" : `${assets.length} medya`}
          </span>
          <IconButton
            ariaLabel="Listeyi yenile"
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={() => void fetchAssets()}
            variant="outline"
            size="sm"
          />
        </div>
      </header>

      {error ? (
        <p
          role="alert"
          data-testid="media-gallery-error"
          className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      {loading && assets.length === 0 ? (
        <div
          data-testid="media-gallery-loading"
          className="flex items-center justify-center rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-sm text-muted"
        >
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          Medya yükleniyor…
        </div>
      ) : null}

      {showEmpty ? (
        <AdminEmptyState
          title="Henüz medya yüklenmedi"
          message="Yukarıdaki alana görsel sürükleyin ya da “Dosya seç” düğmesini kullanın."
          icon={<ImageIcon className="h-7 w-7" />}
        />
      ) : null}

      {!loading && assets.length > 0 ? (
        <ul
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          data-testid="media-gallery-grid"
        >
          {assets.map((asset) => (
            <li
              key={asset.id}
              data-testid="media-gallery-tile"
              data-asset-id={asset.id}
              className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition hover:shadow-md"
            >
              <div className="relative aspect-square bg-background">
                {asset.thumbnail_url || asset.public_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={asset.thumbnail_url || asset.public_url}
                    alt={asset.alt_text || asset.original_filename}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted">
                    <ImageIcon className="h-8 w-8" aria-hidden />
                  </div>
                )}
                <span className="absolute left-2 top-2 rounded-full bg-text/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
                  {kindBadgeLabel(asset.kind)}
                </span>
              </div>
              <div className="flex flex-col gap-1 p-2 text-xs">
                <p
                  className="truncate font-medium text-text"
                  title={asset.original_filename}
                >
                  {asset.original_filename}
                </p>
                <p className="text-muted">
                  {formatMediaSize(asset.size_bytes)}
                  {asset.width && asset.height
                    ? ` · ${asset.width}×${asset.height}`
                    : ""}
                </p>
              </div>
              <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                {onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect(asset)}
                    aria-label={`Kullan: ${asset.original_filename}`}
                    data-testid="media-gallery-select"
                    className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
                  >
                    <Check className="h-3 w-3" aria-hidden />
                    Kullan
                  </button>
                ) : null}
                {onDelete || csrfToken ? (
                  <IconButton
                    ariaLabel={`Sil: ${asset.original_filename}`}
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => setConfirming(asset)}
                    variant="destructive"
                    size="sm"
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div ref={sentinelRef} aria-hidden className="h-px w-full" />

      <ConfirmDialog
        open={Boolean(confirming)}
        title="Medyayı sil"
        description={
          confirming
            ? `${confirming.original_filename} listeden kaldırılacak. Bu işlem geri alınamaz.`
            : ""
        }
        confirmLabel="Evet, sil"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirming(null)}
      />
    </section>
  );
}

// Re-export so the admin page (and tests) can branch on the error type
// without reaching into the api-media module a second time.
export { AdminApiError };