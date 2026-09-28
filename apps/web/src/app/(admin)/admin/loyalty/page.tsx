import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Award, Power } from "lucide-react";

import { AdminErrorState } from "@/app/(admin)/_components/ErrorState";
import { AdminEmptyState } from "@/app/(admin)/_components/EmptyState";
import {
  fetchCurrentUser,
  fetchLoyaltySettings,
  AdminApiError,
} from "@/lib/api-admin";
import { LoyaltySettingsForm } from "./LoyaltySettingsForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_NEXT = "/admin/loyalty";

function readCookieHeader(): string {
  return cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

/**
 * /admin/loyalty — org-level loyalty configuration (Sprint 10C).
 *
 * The 10A backend lazy-creates the settings row on first GET, so a
 * null response is unlikely in practice (it would imply the org has no
 * IsOrganizationMember principal — already blocked by middleware).
 * We still render the "Lütfen aktifleştirin" empty state defensively
 * to handle future backend changes.
 *
 * Spec drift: the brief asked for PUT to return the updated object; we
 * rely on `router.refresh()` after the PUT so the form re-renders with
 * fresh server-rendered props.
 */
export default async function LoyaltySettingsPage() {
  const cookieHeader = readCookieHeader();

  try {
    await fetchCurrentUser({ internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
      redirect("/login?next=" + DEFAULT_NEXT);
    }
    throw err;
  }

  let settings = null;
  let loadError: string | null = null;
  try {
    settings = await fetchLoyaltySettings({ internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError) {
      loadError = err.message;
    } else {
      throw err;
    }
  }

  const csrfToken = cookies().get("qr_csrftoken")?.value ?? null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex items-end gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Award className="h-5 w-5" aria-hidden />
        </span>
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Ayarlar
          </p>
          <h1 className="font-heading text-2xl font-bold text-text">
            Sadakat Ayarları
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Müşterilerinizin puan kazanma ve harcama kuralları. Değişiklikler
            yeni siparişlerde anında geçerli olur.
          </p>
        </div>
        {settings ? (
          <span
            className={
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold " +
              (settings.is_enabled
                ? "bg-primary/10 text-primary"
                : "bg-muted/20 text-muted")
            }
          >
            <Power className="h-3 w-3" aria-hidden />
            {settings.is_enabled ? "Aktif" : "Pasif"}
          </span>
        ) : null}
      </header>

      {loadError ? (
        <AdminErrorState
          title="Sadakat ayarları yüklenemedi"
          message={loadError}
          code="admin.loyalty.settings_fetch_failed"
        />
      ) : settings === null ? (
        <AdminEmptyState
          icon={<Award className="h-8 w-8" aria-hidden />}
          title="Sadakat ayarları henüz tanımlı değil"
          message="Lütfen aktifleştirin — aşağıdaki formla ilk ayarları kaydedin."
          action={
            <a
              href="#loyalty-form"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              Şimdi aktifleştir
            </a>
          }
        />
      ) : (
        <div
          id="loyalty-form"
          className="rounded-xl border border-border bg-surface p-6 shadow-sm"
        >
          <LoyaltySettingsForm initial={settings} csrfToken={csrfToken} />
        </div>
      )}
    </div>
  );
}
