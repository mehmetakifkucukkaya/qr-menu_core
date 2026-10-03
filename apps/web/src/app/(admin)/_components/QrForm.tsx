"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";

import { FormField } from "@/app/(admin)/_components/FormField";
import {
  createQRCode,
  updateQRCode,
  type CreateQRPayload,
  type UpdateQRPayload,
} from "@/lib/api-admin";
import type {
  AdminQRCode,
  AdminMenu,
  Branch,
  Organization,
} from "@/types/admin";

interface QrFormProps {
  /** Existing QR when editing — omit (or pass undefined) when creating. */
  qr?: AdminQRCode;
  /** Required for both modes — create uses it as organization_id FK. */
  organization: Organization;
  /** Menu and branch lookup lists. */
  menus: AdminMenu[];
  branches: Branch[];
  /** CSRF token (admin PATCH/POST requires X-CSRFToken). */
  csrfToken: string | null;
}

/**
 * QrForm — controlled client form for creating + editing a QR code.
 *
 * Two modes:
 *
 * - **Create** (`qr` undefined): full payload with label, menu, branch
 *   (optional), table_number (optional). organization_id is taken from
 *   the prop. Branch is "None" (org-wide menu) by default — the user
 *   either picks one or leaves it empty.
 *
 * - **Edit** (`qr` provided): only `label` and `is_active` are mutable.
 *   Branch / menu / target_url are read-only after creation — changing
 *   them would silently invalidate already-printed QR codes. We surface
 *   this constraint in the edit-page header instead of greying out
 *   fields.
 */
export function QrForm({
  qr,
  organization,
  menus,
  branches,
  csrfToken,
}: QrFormProps) {
  const router = useRouter();
  const isEdit = Boolean(qr);

  // Form state.
  const [label, setLabel] = useState(qr?.label ?? "");
  const [menuId, setMenuId] = useState<string>(
    qr?.menu?.id ? String(qr.menu.id) : "",
  );
  const [branchId, setBranchId] = useState<string>(
    qr?.branch?.id ? String(qr.branch.id) : "",
  );
  const [tableNumber, setTableNumber] = useState(qr?.table_number ?? "");
  const [isActive, setIsActive] = useState(qr?.is_active ?? true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!csrfToken) {
      setError("CSRF token eksik. Sayfayı yenileyin.");
      return;
    }
    if (!label.trim()) {
      setError("Etiket zorunludur.");
      return;
    }
    if (!isEdit) {
      if (!menuId) {
        setError("Menü seçilmelidir.");
        return;
      }
    }
    setSubmitting(true);
    try {
      if (isEdit && qr) {
        const payload: UpdateQRPayload = {
          label: label.trim(),
          // Edit page only exposes label + active, but we forward
          // table_number when present so the form is round-trippable.
          table_number: tableNumber.trim(),
          is_active: isActive,
        };
        await updateQRCode(qr.id, payload, { csrfToken });
        router.push(`/admin/qr-codes/${qr.id}`);
        router.refresh();
      } else {
        const payload: CreateQRPayload = {
          organization_id: organization.id,
          menu_id: Number.parseInt(menuId, 10),
          // Empty string "" → leave branch_id undefined (org-wide menu).
          branch_id: branchId ? Number.parseInt(branchId, 10) : null,
          label: label.trim(),
          table_number: tableNumber.trim(),
          is_active: isActive,
        };
        const created = await createQRCode(payload, { csrfToken });
        // Push to detail so the operator sees the freshly-rendered PNG.
        router.push(`/admin/qr-codes/${created.id}`);
        router.refresh();
      }
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "QR kod kaydedilemedi.";
      setError(msg);
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-text"
        >
          {error}
        </div>
      ) : null}

      <FormField
        label="Etiket"
        name="label"
        value={label}
        onChange={setLabel}
        placeholder="Örnek: Kasa Önü, Bahçe Masa 4"
        required
        hint="QR kodun operatör tarafında görünen adı. Müşterilere gösterilmez."
        disabled={submitting}
      />

      {/* Menu + Branch selects: only on create. After creation the FKs
          are locked — see QrForm jsdoc. */}
      {!isEdit ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="menu_id" className="text-sm font-medium text-text">
              Menü
              <span aria-hidden className="ml-0.5 text-danger">
                *
              </span>
            </label>
            <select
              id="menu_id"
              name="menu_id"
              value={menuId}
              onChange={(e) => setMenuId(e.target.value)}
              required
              disabled={submitting || menus.length === 0}
              className="rounded-xl border border-input bg-surface px-3.5 py-2.5 text-base sm:text-sm text-text focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">
                {menus.length === 0 ? "Henüz menü yok" : "Bir menü seçin"}
              </option>
              {menus.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.is_active ? "" : " (pasif)"}
                </option>
              ))}
            </select>
            {menus.length === 0 ? (
              <p className="text-xs text-muted">
                Önce{" "}
                <a
                  href="/admin/menus/new"
                  className="font-medium text-primary hover:underline"
                >
                  bir menü oluşturmalısınız
                </a>
                .
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="branch_id" className="text-sm font-medium text-text">
              Şube <span className="text-xs text-muted">(opsiyonel)</span>
            </label>
            <select
              id="branch_id"
              name="branch_id"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              disabled={submitting}
              className="rounded-xl border border-input bg-surface px-3.5 py-2.5 text-base sm:text-sm text-text focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">Tüm işletme (şube yok)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.is_active ? "" : " (pasif)"}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted">
              Boş bırakırsanız QR işletme genelinde geçerli olur; birden
              fazla şubeniz varsa her şube için ayrı QR oluşturmanız önerilir.
            </p>
          </div>
        </>
      ) : null}

      <FormField
        label="Masa numarası"
        name="table_number"
        value={tableNumber}
        onChange={setTableNumber}
        placeholder="Örnek: 4, S-12"
        hint="Operasyonel takip için (opsiyonel). Müşterilere gösterilmez."
        disabled={submitting}
      />

      <label className="inline-flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          disabled={submitting}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
        />
        <span className="text-sm font-medium text-text">QR kod yayında</span>
        <span className="text-xs text-muted">
          (Pasifse indirme bağlantısı çalışmaz)
        </span>
      </label>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={submitting}
          className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
        >
          Vazgeç
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Kaydediliyor…
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {isEdit ? "Değişiklikleri kaydet" : "QR kodu oluştur"}
            </>
          )}
        </button>
      </div>
    </form>
  );
}
