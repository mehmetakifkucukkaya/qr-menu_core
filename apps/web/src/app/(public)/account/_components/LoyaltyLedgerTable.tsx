/**
 * LoyaltyLedgerTable — Sprint 10B (D-025).
 *
 * Server component that renders the customer's loyalty transaction
 * ledger at one organization. Earn rows render green and positive;
 * redeem / expire / adjust-down rows render red and negative. The
 * `reverse` type — used when an earned row is reversed (order cancelled
 * after earn) — looks like a neutral adjustment.
 */

import type {
  LoyaltyTransaction,
  PublicLoyaltySettings,
} from "@/types/account";

interface LoyaltyLedgerTableProps {
  transactions: LoyaltyTransaction[];
  settings: Pick<PublicLoyaltySettings, "points_per_currency_unit">;
  /** When true, render the empty-state call-out instead of the table. */
  isEmpty: boolean;
}

const TYPE_LABEL: Record<LoyaltyTransaction["type"], string> = {
  earn: "Kazanç",
  redeem: "Harcama",
  expire: "Süre doldu",
  adjust: "Düzeltme",
  reverse: "İade",
};

export function LoyaltyLedgerTable({
  transactions,
  isEmpty,
}: LoyaltyLedgerTableProps) {
  if (isEmpty) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-10 text-center">
        <p className="font-heading text-base font-semibold text-text">
          Henüz işlem yok
        </p>
        <p className="mt-1 text-sm text-muted">
          Siparişleriniz tamamlandığında puan kazanmaya başlayacaksınız.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-background text-xs uppercase tracking-wider text-muted">
          <tr>
            <th scope="col" className="px-4 py-3 text-left font-semibold">
              Tarih
            </th>
            <th scope="col" className="px-4 py-3 text-left font-semibold">
              İşlem
            </th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">
              Puan
            </th>
            <th scope="col" className="px-4 py-3 text-left font-semibold">
              Açıklama
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {transactions.map((txn) => (
            <tr key={txn.id} className="hover:bg-background/50">
              <td className="whitespace-nowrap px-4 py-3 text-text">
                {new Date(txn.created_at).toLocaleDateString("tr-TR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </td>
              <td className="px-4 py-3">
                <TypeChip type={txn.type} />
              </td>
              <td
                className={`whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums ${
                  txn.points > 0
                    ? "text-success"
                    : txn.points < 0
                      ? "text-danger"
                      : "text-text"
                }`}
              >
                {txn.points > 0 ? "+" : ""}
                {txn.points.toLocaleString("tr-TR")}
              </td>
              <td className="px-4 py-3 text-xs text-muted">
                {txn.note || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TypeChip({ type }: { type: LoyaltyTransaction["type"] }) {
  const tone =
    type === "earn"
      ? "bg-success-soft text-success ring-success/25"
      : type === "redeem"
        ? "bg-danger-soft text-danger ring-danger/20"
        : type === "expire"
          ? "bg-orange-100 text-orange-800 ring-orange-200"
          : type === "adjust"
            ? "bg-blue-100 text-blue-800 ring-blue-200"
            : "bg-surface-low text-text ring-border";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${tone}`}
    >
      {TYPE_LABEL[type]}
    </span>
  );
}
