import { cookies } from "next/headers";

import {
  AdminErrorState,
} from "@/app/(admin)/_components/ErrorState";
import { AdminEmptyState } from "@/app/(admin)/_components/EmptyState";
import {
  fetchCurrentUser,
  AdminApiError,
} from "@/lib/api-admin";
import { listMedia } from "@/lib/api-media";
import { redirect } from "next/navigation";
import { ImageIcon } from "lucide-react";

import { MediaClient } from "./MediaClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CSRF_COOKIE = "qr_csrftoken";
const DEFAULT_NEXT = "/admin/media";

function readCookieHeader(): string {
  return cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

/**
 * /admin/media — tenant-scoped media library (Sprint E2 / D-033).
 *
 * Server component shell:
 *   1. Auth check (defence-in-depth — middleware already guards the
 *      `/admin` prefix).
 *   2. Prefetch the first page of image assets server-side so the
 *      gallery renders instantly. The client takes over for refresh /
 *      delete operations.
 *   3. Hand the assets + CSRF token to `<MediaClient />` which owns
 *      the MediaUploader + MediaGallery pair.
 *
 * The page header surfaces the total count as a small "Toplam X medya"
 * badge so the operator has a sense of library size at a glance.
 */
export default async function MediaLibraryPage() {
  const cookieHeader = readCookieHeader();
  const csrfToken = cookies().get(CSRF_COOKIE)?.value ?? null;

  try {
    await fetchCurrentUser({ internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
      redirect("/login?next=" + DEFAULT_NEXT);
    }
    throw err;
  }

  let initialAssets: Awaited<ReturnType<typeof listMedia>> = [];
  let initialError: string | null = null;
  try {
    initialAssets = await listMedia({
      kind: "image",
      fetchOptions: { internal: true, cookieHeader },
    });
  } catch (err) {
    if (err instanceof AdminApiError) {
      initialError = err.message;
    } else if (err instanceof Error) {
      initialError = err.message;
    } else {
      initialError = "Medya listesi yüklenemedi.";
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"
          >
            <ImageIcon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-heading text-2xl font-bold text-text">
              Medya Kütüphanesi
            </h1>
            <p className="text-sm text-muted">
              Tenant&apos;ınıza ait tüm görselleri yönetin. Yeni dosyalar
              otomatik olarak Pillow ile yeniden boyutlandırılır ve küçük
              resim üretilir.
            </p>
          </div>
        </div>
        <span
          data-testid="media-page-count"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted"
        >
          Toplam {initialAssets.length} medya
        </span>
      </header>

      {initialError ? (
        <AdminErrorState
          title="Medya listesi yüklenemedi"
          message={initialError}
        />
      ) : null}

      {!initialError && initialAssets.length === 0 ? (
        <AdminEmptyState
          title="Henüz medya yok"
          message="İlk görselinizi yükleyerek başlayın. Yüklenen tüm dosyalar sadece sizin tenant'ınızda görünür."
          icon={<ImageIcon className="h-7 w-7" />}
        />
      ) : null}

      <MediaClient
        csrfToken={csrfToken}
        initialAssets={initialAssets}
        showUploader
      />
    </div>
  );
}