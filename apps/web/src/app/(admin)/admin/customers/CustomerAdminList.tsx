import Link from "next/link";
import { Search, X } from "lucide-react";

import { FormField } from "@/app/(admin)/_components/FormField";
import type { CustomerAdminSummary } from "@/types/admin";

interface CustomerAdminListProps {
  customers: CustomerAdminSummary[];
  /** Total count returned by the backend (V1 caps at 200, so the
   *  caller should treat this as 'all customers at this org'). */
  count: number;
  /** Currently applied search query (echoed back into the input). */
  searchQuery: string;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * CustomerAdminList — server component, renders the 10A backend's
 * `GET /api/v1/account/admin/customers/` rows.
 *
 * __spec_drift__: total_orders + last_order_at columns are absent on
 * the 10A serializer (they were in the 10C brief). We omit them
 * rather than render empty placeholders. If the backend ships them
 * later, add two new <th>/<td> columns.
 */
export function CustomerAdminList({
  customers,
  count,
  searchQuery,
}: CustomerAdminListProps) {
  return (
    <div className="flex flex-col gap-4">
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-3 shadow-sm"
        aria-label="Müşteri arama"
      >
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted">
          <Search className="h-3.5 w-3.5" aria-hidden />
          Arama
        </div>
        <div className="min-w-[16rem] flex-1">
          <FormField
            label=""
            name="search"
            type="search"
            value={searchQuery}
            onChange={() => {
              /* uncontrolled — server reads via FormData */
            }}
            placeholder="E-posta, ad veya telefon ile ara"
          />
        </div>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary"
        >
          Ara
        </button>
        {searchQuery ? (
          <Link
            href="/admin/customers"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <X className="h-3 w-3" aria-hidden />
            Temizle
          </Link>
        ) : null}
      </form>

      <div className="flex items-center justify-between rounded-md bg-background px-3 py-1.5 text-xs text-muted">
        <span>
          <b className="text-text">{count}</b> müşteri listeleniyor
          {searchQuery ? (
            <>
              {" "}
              · <i>&quot;{searchQuery}&quot;</i> için sonuçlar
            </>
          ) : null}
        </span>
      </div>

      <section
        aria-label="Müşteri listesi"
        className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
      >
        <table className="table-stack w-full table-auto border-collapse text-left">
          <thead className="bg-background text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">E-posta</th>
              <th className="px-4 py-2 font-medium">Ad Soyad</th>
              <th className="px-4 py-2 font-medium">Telefon</th>
              <th className="px-4 py-2 text-center font-medium">Puan</th>
              <th className="px-4 py-2 font-medium">Son Giriş</th>
              <th className="px-4 py-2 font-medium">Kayıt</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr
                key={c.id}
                className="border-t border-border text-sm text-text transition hover:bg-primary/5"
              >
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/customers/${c.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {c.email}
                  </Link>
                  {!c.is_active ? (
                    <span className="ml-2 inline-flex items-center rounded-full bg-muted/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                      Pasif
                    </span>
                  ) : null}
                </td>
                <td data-label="Ad Soyad" className="px-4 py-2.5">{c.full_name || "—"}</td>
                <td data-label="Telefon" className="px-4 py-2.5">
                  {c.phone ? (
                    <span className="tabular-nums">{c.phone}</span>
                  ) : (
                    <span className="italic text-muted">—</span>
                  )}
                </td>
                <td data-label="Puan" className="px-4 py-2.5 text-center">
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
                    {c.loyalty_balance}
                  </span>
                </td>
                <td data-label="Son Giriş" className="px-4 py-2.5 text-xs text-muted">
                  {formatDateTime(c.last_login_at)}
                </td>
                <td data-label="Kayıt" className="px-4 py-2.5 text-xs text-muted">
                  {formatDateTime(c.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="rounded-md border border-dashed border-border bg-background px-3 py-2 text-center text-xs text-muted">
        Liste en fazla 200 müşteriyi gösterir. Bir satıra tıklayarak detay
        sayfasına gidebilir, puan ayarlaması yapabilirsiniz.
      </p>
    </div>
  );
}
