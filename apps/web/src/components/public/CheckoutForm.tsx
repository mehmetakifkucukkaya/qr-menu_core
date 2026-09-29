"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Receipt, CheckCircle2, Banknote } from "lucide-react";
import { useCartStore } from "@/lib/cart-store";
import { createOrder, OrdersApiError } from "@/lib/api-orders";
import { formatPrice } from "@/lib/format";
import { useFeatureFlag } from "@/lib/feature-flags";
import { UpgradeBanner } from "@/components/billing/UpgradeBanner";
import { useFeatureFlags } from "@/lib/feature-flags";
import { LoyaltyRedemptionCheckbox } from "@/app/(public)/account/_components/LoyaltyRedemptionCheckbox";
import type { PublicLoyaltySettings } from "@/types/account";

interface CheckoutFormProps {
  open: boolean;
  onClose: () => void;
  businessSlug: string;
  currency: string;
  /** Sprint 10B — pre-fetched customer profile (null when guest). */
  customerProfile?: {
    id: number;
    full_name: string;
    phone: string;
    email: string;
  } | null;
  /** Sprint 10B — pre-fetched loyalty summary (null = no balance / disabled). */
  customerLoyalty?: {
    balance: number;
    settings: PublicLoyaltySettings | null;
  } | null;
}

/**
 * CheckoutForm — customer info modal.
 *
 * Fields:
 *   - name (required)
 *   - phone (required, very lenient — backend checks digit count >= 7)
 *   - table number (optional, prefilled from `?table=N` URL query)
 *   - notes (optional, general order note)
 *
 * Submission:
 *   - Calls `createOrder()` which posts to /api/v1/public/orders/
 *   - On success: clears the cart, closes the drawer, redirects to
 *     `/m/{slug}/order-confirmation/{orderNumber}` so the customer can
 *     see the live status (V1 polls every 15s).
 *   - On failure: surfaces the error inline (throttle, unavailable item,
 *     validation). The cart is NOT cleared.
 */
export function CheckoutForm({
  open,
  onClose,
  businessSlug,
  currency,
  customerProfile,
  customerLoyalty,
}: CheckoutFormProps) {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const tableNumber = useCartStore((s) => s.tableNumber);
  const setTableNumber = useCartStore((s) => s.setTableNumber);
  const clear = useCartStore((s) => s.clear);
  const totalAmount = useCartStore((s) => s.totalAmount());

  // Sprint B3b — payment feature flag. When the tenant doesn't have
  // payments_enabled on (PRO and below), the modal shows an Upgrade-
  // Banner at the top + a "cash-only" confirmation box so the customer
  // knows the order will be settled at the till rather than online.
  // The flag is read through the provider mounted by MenuViewClient;
  // CheckoutForm must be rendered inside that subtree.
  const paymentsEnabled = useFeatureFlag("payments_enabled");
  const settings = useFeatureFlags();
  /** Sprint B3b — cash-only confirmation. The customer must tick this
   *  before submitting an order on a tenant without payments_enabled —
   *  keeps the legal acknowledgement explicit and prevents accidental
   *  "I thought I was paying online" complaints. */
  const [cashOnlyConfirmed, setCashOnlyConfirmed] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  /** Sprint 10B — selected loyalty redemption (0 = none). */
  const [loyaltyRedeem, setLoyaltyRedeem] = useState({
    enabled: false,
    points: 0,
    discountAmount: "0.00",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  // Pre-fill table number from ?table= once, when the modal first opens.
  // Also pre-fill name + phone from the customer profile (Sprint 10B).
  useEffect(() => {
    if (!open) return;
    if (typeof window !== "undefined" && !tableNumber) {
      const params = new URLSearchParams(window.location.search);
      const fromQuery = params.get("table");
      if (fromQuery) setTableNumber(fromQuery);
    }
    if (customerProfile) {
      // Only set on first open (avoid clobbering the user's typing).
      setName((cur) => (cur ? cur : customerProfile.full_name ?? ""));
      setPhone((cur) => (cur ? cur : customerProfile.phone ?? ""));
    }
    // Reset loyalty toggle when (re-)opening so a previous session's
    // selection doesn't silently apply to a new draft.
    setLoyaltyRedeem({ enabled: false, points: 0, discountAmount: "0.00" });
    // Sprint B3b — also reset the cash-only acknowledgement so the
    // customer re-confirms every new order (the previous order's tick
    // box shouldn't silently carry over).
    setCashOnlyConfirmed(false);
    queueMicrotask(() => nameRef.current?.focus());
  }, [open, tableNumber, setTableNumber, customerProfile]);

  // Escape closes (unless a submit is in flight).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || items.length === 0) return;
    // Sprint B3b — gate submission on the cash-only acknowledgement
    // when payments_enabled is off. The customer must explicitly
    // confirm they understand the order will be settled at the till.
    if (!paymentsEnabled && !cashOnlyConfirmed) {
      setError("Lütfen kapıda nakit ödeme onayını işaretleyin.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const loyaltyPoints =
        loyaltyRedeem.enabled && loyaltyRedeem.points > 0
          ? loyaltyRedeem.points
          : undefined;
      const payload: Parameters<typeof createOrder>[0] = {
        organization_slug: businessSlug,
        table_number: tableNumber || undefined,
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        notes: notes.trim() || undefined,
        items: items.map((i) => ({
          menu_item_id: i.menuItemId,
          quantity: i.quantity,
          notes: i.notes?.trim() || undefined,
        })),
        ...(loyaltyPoints ? { loyalty_points_to_redeem: loyaltyPoints } : {}),
      };

      const result = await createOrder(payload);

      // Successful order — wipe cart, close drawer + modal, redirect.
      clear();
      onClose();
      router.push(
        `/m/${businessSlug}/order-confirmation/${result.order_number}`,
      );
    } catch (err) {
      let message = "Sipariş oluşturulamadı.";
      if (err instanceof OrdersApiError) {
        message = err.message || message;
        // Surface per-field errors if the backend sent them.
        if (err.details && typeof err.details === "object") {
          const firstField = Object.keys(err.details)[0];
          if (firstField) {
            const v = (err.details as Record<string, unknown>)[firstField];
            if (Array.isArray(v) && v[0]) message = String(v[0]);
          }
        }
      } else if (err instanceof Error) {
        message = err.message;
      }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const cur = items[0]?.currency ?? currency;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-text/40 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={() => !submitting && onClose()}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-floating sm:max-w-md sm:rounded-2xl"
        style={{ animation: "slideup 0.22s ease-out" }}
      >
        <header className="flex items-center justify-between gap-2 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" aria-hidden />
            <h2
              id="checkout-title"
              className="font-heading text-base font-bold text-text sm:text-lg"
            >
              Sipariş Onayı
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Kapat"
            className="touch-target inline-flex items-center justify-center rounded-full p-2 text-muted hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {/* Sprint B3b — payment feature flag. When payments_enabled
              is off, surface the UpgradeBanner (Sprint 12A Card +
              IconButton — inline variant) + a "cash-only" confirmation
              box. With payments on, this section renders nothing and
              the order flow proceeds as before; the Sprint 11A payment
              step (when it lands) owns the rest of the payment UX. */}
          {!paymentsEnabled ? (
            <div className="mb-4 space-y-3">
              <UpgradeBanner
                feature="payments_enabled"
                targetPlan="ops"
                settings={settings}
                variant="inline"
              />
              <label
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-900 transition hover:bg-amber-100/70 focus-within:ring-2 focus-within:ring-amber-600 motion-reduce:transition-none dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/60"
              >
                <input
                  type="checkbox"
                  checked={cashOnlyConfirmed}
                  onChange={(e) => setCashOnlyConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-amber-300 text-amber-600 focus:ring-amber-600"
                  aria-describedby="cash-only-hint"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Banknote
                      className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300"
                      aria-hidden
                    />
                    Kapıda nakit ödeme
                  </span>
                  <span
                    id="cash-only-hint"
                    className="mt-0.5 block text-[11px] leading-snug text-amber-800 dark:text-amber-200"
                  >
                    Bu işletme online ödeme almıyor — siparişinizi
                    teslim alırken kasada nakit olarak ödeyeceksiniz.
                    Onaylıyor musunuz?
                  </span>
                </span>
              </label>
            </div>
          ) : null}

          {/* Order summary */}
          <section
            aria-label="Sipariş özeti"
            className="mb-4 rounded-lg border border-border bg-background p-3"
          >
            <ul className="space-y-1.5 text-sm">
              {items.map((i) => (
                <li
                  key={i.menuItemId}
                  className="flex items-baseline justify-between gap-2"
                >
                  <span className="min-w-0 truncate text-text">
                    {i.quantity} × {i.name}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-text">
                    {formatPrice(
                      (Number.parseFloat(i.price) * i.quantity).toFixed(2),
                      i.currency,
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-baseline justify-between border-t border-border pt-2">
              <span className="text-xs uppercase tracking-wider text-muted">
                Toplam
              </span>
              <span className="font-heading text-lg font-bold text-primary tabular-nums">
                {formatPrice(totalAmount.toFixed(2), cur)}
              </span>
            </div>
            {loyaltyRedeem.enabled && Number.parseFloat(loyaltyRedeem.discountAmount) > 0 ? (
              <div className="mt-2 flex items-baseline justify-between rounded-md bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800">
                <span className="font-semibold">
                  Sadakat indirimi ({loyaltyRedeem.points} puan)
                </span>
                <span className="tabular-nums">
                  −{formatPrice(loyaltyRedeem.discountAmount, cur)}
                </span>
              </div>
            ) : null}
            <p className="mt-1 text-[10px] italic text-muted">
              Toplam tutar işletme tarafından onaylanır; nihai tutar
              sipariş onayında görüntülenir.
            </p>
          </section>

          {/* Sprint 10B — Loyalty redemption island. Hidden when
              either the customer isn't logged in or loyalty is not
              configured / below threshold (the checkbox renders its
              own muted state internally). */}
          {customerLoyalty?.settings && customerProfile ? (
            <div className="mb-4">
              <LoyaltyRedemptionCheckbox
                balance={customerLoyalty.balance}
                settings={customerLoyalty.settings}
                currency={cur}
                onChange={setLoyaltyRedeem}
              />
            </div>
          ) : null}

          {/* Sprint 10B — authenticated customer badge */}
          {customerProfile ? (
            <div className="mb-4 flex items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <span className="font-medium">
                {customerProfile.email}
              </span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                Üye
              </span>
            </div>
          ) : null}

          {/* Fields */}
          <div className="space-y-3">
            <Field
              label="Ad Soyad"
              required
              value={name}
              onChange={setName}
              ref={nameRef}
              placeholder="Mehmet Yılmaz"
              autoComplete="name"
            />
            <Field
              label="Telefon"
              required
              type="tel"
              value={phone}
              onChange={setPhone}
              placeholder="+90 532 555 0123"
              autoComplete="tel"
              hint="İşletme siparişiniz için sizi arayabilir."
            />
            <Field
              label="Masa No"
              value={tableNumber}
              onChange={setTableNumber}
              placeholder="örn. 4"
              hint="İsterseniz boş bırakabilirsiniz."
            />
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="checkout-notes"
                className="text-sm font-medium text-text"
              >
                Sipariş Notu
              </label>
              <textarea
                id="checkout-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Genel notlar (opsiyonel)"
                className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {error ? (
            <p
              role="alert"
              className="mt-3 rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-xs font-medium text-accent"
            >
              {error}
            </p>
          ) : null}
        </div>

        <footer className="sticky bottom-0 flex gap-2 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-full border border-border bg-surface px-4 py-3 text-sm font-semibold text-text transition hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={
              submitting ||
              items.length === 0 ||
              !name.trim() ||
              !phone.trim() ||
              (!paymentsEnabled && !cashOnlyConfirmed)
            }
            className="flex-[2] inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              "Gönderiliyor…"
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                {paymentsEnabled ? "Onayla" : "Siparişi Onayla"}
              </>
            )}
          </button>
        </footer>
      </form>

      <style>{`
        @keyframes slideup {
          from { transform: translateY(16px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}

const Field = (
  props: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    required?: boolean;
    type?: "text" | "tel";
    placeholder?: string;
    autoComplete?: string;
    hint?: string;
  } & { ref?: React.Ref<HTMLInputElement> },
) => {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text">
        {props.label}
        {props.required ? (
          <span aria-hidden className="ml-0.5 text-accent">
            *
          </span>
        ) : null}
      </label>
      <input
        ref={props.ref}
        id={id}
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        required={props.required}
        placeholder={props.placeholder}
        autoComplete={props.autoComplete}
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {props.hint ? (
        <p className="text-[11px] text-muted">{props.hint}</p>
      ) : null}
    </div>
  );
};

// Local useId shim removed — useId is imported at the top of the file.