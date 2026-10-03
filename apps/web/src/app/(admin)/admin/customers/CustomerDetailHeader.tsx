import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Award,
  Calendar,
  Hash,
  Mail,
  Phone,
  Plus,
  Receipt,
  ShoppingBag,
  User,
  Wallet,
} from "lucide-react";

import { OrderStatusBadge } from "@/app/(admin)/admin/orders/OrderStatusBadge";
import { formatPrice } from "@/lib/format";
import type { CustomerAdminDetail, LoyaltyTransactionAdmin } from "@/types/admin";
import { LoyaltyAdjustDialog } from "./LoyaltyAdjustDialog";

interface CustomerDetailHeaderProps {
  detail: CustomerAdminDetail;
  csrfToken: string | null;
}

const TX_TYPE_LABEL: Record<LoyaltyTransactionAdmin["type"], string> = {
  earn: "Kazanım",
  redeem: "Harcama",
  expire: "Süresi doldu",
  adjust: "Manuel düzeltme",
  reverse: "Geri alındı",
};

const TX_TYPE_TONE: Record<LoyaltyTransactionAdmin["type"], string> = {
  earn: "bg-success-soft text-success ring-success/25",
  redeem: "bg-blue-100 text-blue-800 ring-blue-200",
  expire: "bg-muted/20 text-muted ring-muted/30",
  adjust: "bg-warning-soft text-warning ring-warning/25",
  reverse: "bg-danger-soft text-danger ring-danger/25",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "az önce";
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} gün önce`;
  const months = Math.floor(days / 30);
  return `${months} ay önce`;
}

function isActiveDerived(lastLoginAt: string | null | undefined): boolean {
  if (!lastLoginAt) return false;
  // 180 gün = "aktif" kabul ediyoruz; backend is_active henüz
  // customer serializer'ında yok (10C spec drift).
  const ageMs = Date.now() - new Date(lastLoginAt).getTime();
  return ageMs < 180 * 24 * 60 * 60 * 1000;
}

/**
 * CustomerDetailHeader — server-rendered profile + loyalty + orders +
 * transactions for the admin customer detail page.
 *
 * Mounts `<LoyaltyAdjustDialog>` as a client island. The dialog listens
 * for `window.dispatchEvent(new CustomEvent('loyalty-adjust:open', { detail: { id } }))`
 * — the 'Manuel Puan Ekle/Çıkar' button below fires that event without
 * needing a client component wrapper.
 */
export function CustomerDetailHeader({
  detail,
  csrfToken,
}: CustomerDetailHeaderProps) {
  const { customer, loyalty } = detail;
  const active = customer.is_active ?? isActiveDerived(customer.last_login_at);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <Link
        href="/admin/customers"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted transition hover:text-text"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Müşteri listesine dön
      </Link>

      {/* Profile + balance hero */}
      <header className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
              <User className="h-3 w-3" aria-hidden />
              Müşteri
            </p>
            <h1 className="mt-1 font-heading text-2xl font-bold text-text">
              {customer.full_name || customer.email}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" aria-hidden />
                {customer.email}
              </span>
              {customer.phone ? (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" aria-hidden />
                  {customer.phone}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" aria-hidden />
                Kayıt: {formatDateTime(customer.created_at)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5" aria-hidden />
                Son giriş:{" "}
                {customer.last_login_at
                  ? `${formatDateTime(customer.last_login_at)} (${formatRelative(customer.last_login_at)})`
                  : "henüz yok"}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span
              className={
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold " +
                (active
                  ? "bg-success-soft text-success"
                  : "bg-muted/20 text-muted")
              }
            >
              <span
                className={
                  "h-2 w-2 rounded-full " + (active ? "bg-success" : "bg-muted")
                }
                aria-hidden
              />
              {active ? "Aktif" : "Pasif"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Wallet className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted">
                Toplam sadakat bakiyesi
              </p>
              <p className="font-heading text-2xl font-bold text-primary tabular-nums">
                {loyalty.loyalty_balance} puan
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("loyalty-adjust:open", {
                    detail: { id: customer.id },
                  }),
                );
              }
            }}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Manuel Puan Ekle/Çıkar
          </button>
        </div>

        {/* Per-org breakdown — V1 has only the operator's own org, so
            the table is usually a single row. When V2 multi-tenant
            ships, the backend will populate this list fully. */}
        {loyalty.balance_by_org.length > 0 ? (
          <div className="rounded-md border border-border bg-background">
            <table className="w-full table-auto border-collapse text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">İşletme</th>
                  <th className="px-3 py-2 text-right font-medium">Bakiye</th>
                </tr>
              </thead>
              <tbody>
                {loyalty.balance_by_org.map((row) => (
                  <tr
                    key={row.organization_id}
                    className="border-t border-border text-text"
                  >
                    <td className="px-3 py-2">{row.organization_name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.balance} puan
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </header>

      {/* Recent orders */}
      <section
        aria-label="Son siparişler"
        className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="flex items-center gap-2 font-heading text-base font-bold text-text">
            <ShoppingBag className="h-4 w-4 text-muted" aria-hidden />
            Son Siparişler
            <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold text-muted tabular-nums">
              {loyalty.recent_orders.length}
            </span>
          </h2>
          <span className="text-xs text-muted">en fazla 10 son</span>
        </header>
        {loyalty.recent_orders.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm italic text-muted">
            Bu müşterinin henüz siparişi yok.
          </p>
        ) : (
          <table className="w-full table-auto border-collapse text-left text-sm">
            <thead className="bg-background text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-5 py-2 font-medium">Sipariş No</th>
                <th className="px-5 py-2 font-medium">Durum</th>
                <th className="px-5 py-2 text-right font-medium">Tutar</th>
                <th className="px-5 py-2 font-medium">Tarih</th>
              </tr>
            </thead>
            <tbody>
              {loyalty.recent_orders.map((o) => (
                <tr key={o.id} className="border-t border-border">
                  <td className="px-5 py-2.5">
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-primary hover:underline"
                    >
                      <Hash className="h-3 w-3" aria-hidden />
                      {o.order_number}
                    </Link>
                  </td>
                  <td className="px-5 py-2.5">
                    <OrderStatusBadge status={o.status} />
                  </td>
                  <td className="px-5 py-2.5 text-right font-semibold tabular-nums">
                    {formatPrice(o.total_amount, o.currency)}
                  </td>
                  <td className="px-5 py-2.5 text-xs text-muted">
                    {formatDateTime(o.placed_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Recent loyalty transactions */}
      <section
        aria-label="Son sadakat hareketleri"
        className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="flex items-center gap-2 font-heading text-base font-bold text-text">
            <Receipt className="h-4 w-4 text-muted" aria-hidden />
            Son Sadakat Hareketleri
            <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold text-muted tabular-nums">
              {loyalty.recent_transactions.length}
            </span>
          </h2>
          <span className="text-xs text-muted">en fazla 20 son</span>
        </header>
        {loyalty.recent_transactions.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm italic text-muted">
            Henüz sadakat hareketi yok.
          </p>
        ) : (
          <table className="w-full table-auto border-collapse text-left text-sm">
            <thead className="bg-background text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-5 py-2 font-medium">Tarih</th>
                <th className="px-5 py-2 font-medium">Tip</th>
                <th className="px-5 py-2 text-right font-medium">Puan</th>
                <th className="px-5 py-2 font-medium">Sipariş</th>
                <th className="px-5 py-2 font-medium">Not</th>
              </tr>
            </thead>
            <tbody>
              {loyalty.recent_transactions.map((tx) => (
                <tr key={tx.id} className="border-t border-border text-text">
                  <td className="px-5 py-2.5 text-xs text-muted">
                    {formatDateTime(tx.created_at)}
                  </td>
                  <td className="px-5 py-2.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${TX_TYPE_TONE[tx.type]}`}
                    >
                      <Award className="mr-1 h-3 w-3" aria-hidden />
                      {TX_TYPE_LABEL[tx.type]}
                    </span>
                  </td>
                  <td
                    className={
                      "px-5 py-2.5 text-right font-semibold tabular-nums " +
                      (tx.points >= 0 ? "text-success" : "text-danger")
                    }
                  >
                    {tx.points >= 0 ? "+" : ""}
                    {tx.points}
                  </td>
                  <td className="px-5 py-2.5">
                    {tx.order ? (
                      <Link
                        href={`/admin/orders/${tx.order}`}
                        className="font-mono text-xs font-semibold text-primary hover:underline"
                      >
                        #{tx.order}
                      </Link>
                    ) : (
                      <span className="italic text-muted">—</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 max-w-[18rem] truncate text-xs text-muted">
                    {tx.note || (
                      <span className="italic">notsuz</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <LoyaltyAdjustDialog
        customerId={customer.id}
        customerName={customer.full_name || customer.email}
        currentBalance={loyalty.loyalty_balance}
        csrfToken={csrfToken}
      />
    </div>
  );
}
