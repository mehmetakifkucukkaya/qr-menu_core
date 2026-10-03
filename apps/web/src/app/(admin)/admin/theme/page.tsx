import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Palette } from "lucide-react";

import { AdminErrorState } from "@/app/(admin)/_components/ErrorState";
import { ThemeForm } from "./ThemeForm";
import {
  fetchCurrentTheme,
  fetchCurrentUser,
  AdminApiError,
} from "@/lib/api-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function readCookieHeader(): string {
  return cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

/**
 * /admin/theme — theme / brand palette editor.
 *
 * V1 fields: primary / secondary / accent / background / text colors,
 * font family, layout variant. The backend ThemeConfigViewSet only
 * supports update by id, so on first run we render a guided "create"
 * flow that POSTs a new ThemeConfig (the backend doesn't auto-create
 * one for the org on first PATCH).
 */
export default async function ThemeSettingsPage() {
  const cookieHeader = readCookieHeader();

  try {
    await fetchCurrentUser({ internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
      redirect("/login?next=/admin/theme");
    }
    throw err;
  }

  let theme;
  let themeError: string | null = null;
  try {
    theme = await fetchCurrentTheme({ internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError) {
      themeError = err.message;
    } else {
      throw err;
    }
  }

  const csrfToken = cookies().get("qr_csrftoken")?.value ?? null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex items-end gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Palette className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Ayarlar
          </p>
          <h1 className="font-heading text-2xl font-bold text-text">
            Tema ayarları
          </h1>
          <p className="mt-1 text-sm text-muted">
            Renk paleti, yazı tipi ve yerleşim varyantı. Müşteri sayfası
            bu değerleri CSS değişkenlerine bağlar.
          </p>
        </div>
      </header>

      {themeError ? (
        <AdminErrorState
          title="Tema bilgisi alınamadı"
          message={themeError}
          code="theme.fetch_failed"
        />
      ) : (
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
          <ThemeForm theme={theme ?? null} csrfToken={csrfToken} />
        </div>
      )}
    </div>
  );
}
