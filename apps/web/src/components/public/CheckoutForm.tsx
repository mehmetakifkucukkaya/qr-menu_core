"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Banknote, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";
import { useCartStore } from "@/lib/cart-store";
import { createOrder, OrdersApiError } from "@/lib/api-orders";
import { formatPrice } from "@/lib/format";
import { useFeatureFlag } from "@/lib/feature-flags";
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

const FORM_ID = "checkout-form";

/**
 * CheckoutForm — customer info sheet.
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
 *
 * Layout: a `Sheet` (native modal <dialog>). The <form> lives in the sheet
 * body and the submit button in the sheet footer is tied to it with the HTML
 * `form` attribute, so Enter still submits and the footer stays pinned.
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
  // payments_enabled on (PRO and below), the sheet shows a "cash-only"
  // confirmation box so the customer knows the order will be settled at the
  // till rather than online. The flag is read through the provider mounted by
  // MenuViewClient; CheckoutForm must be rendered inside that subtree.
  const paymentsEnabled = useFeatureFlag("payments_enabled");
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

  const nameId = useId();
  const phoneId = useId();
  const tableId = useId();
  const notesId = useId();

  // Pre-fill table number from ?table= once, when the sheet first opens.
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
    // Focus the name field — but only with a precise pointer. On a phone this
    // would raise the on-screen keyboard over the order summary immediately.
    if (window.matchMedia("(pointer: fine)").matches) {
      queueMicrotask(() => nameRef.current?.focus());
    }
  }, [open, tableNumber, setTableNumber, customerProfile]);

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

      // Successful order — wipe cart, close drawer + sheet, redirect.
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
  const canSubmit =
    !submitting &&
    items.length > 0 &&
    name.trim() !== "" &&
    phone.trim() !== "" &&
    (paymentsEnabled || cashOnlyConfirmed);

  return (
    <Sheet
      open={open}
      onClose={() => {
        if (!submitting) onClose();
      }}
      title="Sipariş Onayı"
      footer={
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="lg"
            onClick={onClose}
            disabled={submitting}
            className="flex-1"
          >
            Vazgeç
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            size="lg"
            loading={submitting}
            disabled={!canSubmit}
            leadingIcon={<CheckCircle2 className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
            className="flex-[2]"
          >
            {submitting
              ? "Gönderiliyor…"
              : paymentsEnabled
                ? "Onayla"
                : "Siparişi Onayla"}
          </Button>
        </div>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-5">
        {/* Sprint B3b — payment feature flag. When payments_enabled is off,
            show the "cash-only" confirmation box. (The owner-facing "upgrade
            your plan" banner used to render here too; customers must never
            see it - ANALYSIS_1 F-15.) */}
        {!paymentsEnabled ? (
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-warning/25 bg-warning-soft p-4 text-warning transition-colors hover:border-warning/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-warning">
            <input
              type="checkbox"
              checked={cashOnlyConfirmed}
              onChange={(e) => setCashOnlyConfirmed(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded-md accent-warning focus-visible:outline-none"
              aria-describedby="cash-only-hint"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <Banknote className="h-4 w-4" aria-hidden />
                Kapıda nakit ödeme
              </span>
              <span
                id="cash-only-hint"
                className="mt-1 block text-[0.8125rem] leading-snug"
              >
                Bu işletme online ödeme almıyor — siparişinizi teslim alırken
                kasada nakit olarak ödeyeceksiniz. Onaylıyor musunuz?
              </span>
            </span>
          </label>
        ) : null}

        {/* Order summary */}
        <section
          aria-label="Sipariş özeti"
          className="rounded-2xl bg-surface-low p-4"
        >
          <ul className="space-y-2 text-sm">
            {items.map((i) => (
              <li
                key={i.menuItemId}
                className="flex items-baseline justify-between gap-3"
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
          <div className="mt-3 flex items-baseline justify-between border-t border-border-strong/70 pt-3">
            <span className="text-sm font-medium text-muted">Toplam</span>
            <span className="font-heading text-2xl font-semibold tabular-nums text-primary">
              {formatPrice(totalAmount.toFixed(2), cur)}
            </span>
          </div>
          {loyaltyRedeem.enabled &&
          Number.parseFloat(loyaltyRedeem.discountAmount) > 0 ? (
            <div className="mt-3 flex items-baseline justify-between rounded-xl bg-success-soft px-3 py-2 text-sm text-success">
              <span className="font-semibold">
                Sadakat indirimi ({loyaltyRedeem.points} puan)
              </span>
              <span className="tabular-nums">
                −{formatPrice(loyaltyRedeem.discountAmount, cur)}
              </span>
            </div>
          ) : null}
          <p className="mt-3 text-xs leading-snug text-muted">
            Toplam tutar işletme tarafından onaylanır; nihai tutar sipariş
            onayında görüntülenir.
          </p>
        </section>

        {/* Sprint 10B — Loyalty redemption island. Hidden when either the
            customer isn't logged in or loyalty is not configured / below
            threshold (the checkbox renders its own muted state internally). */}
        {customerLoyalty?.settings && customerProfile ? (
          <LoyaltyRedemptionCheckbox
            balance={customerLoyalty.balance}
            settings={customerLoyalty.settings}
            currency={cur}
            onChange={setLoyaltyRedeem}
          />
        ) : null}

        {/* Sprint 10B — authenticated customer badge */}
        {customerProfile ? (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-success-soft px-4 py-2.5 text-sm text-success">
            <span className="min-w-0 truncate font-medium">
              {customerProfile.email}
            </span>
            <span className="shrink-0 rounded-pill bg-success/10 px-2.5 py-0.5 text-xs font-semibold">
              Üye
            </span>
          </div>
        ) : null}

        {/* Fields */}
        <div className="space-y-4">
          <Field label="Ad Soyad" htmlFor={nameId} required>
            <Input
              ref={nameRef}
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Mehmet Yılmaz"
              autoComplete="name"
            />
          </Field>
          <Field
            label="Telefon"
            htmlFor={phoneId}
            required
            hint="İşletme siparişiniz için sizi arayabilir."
          >
            <Input
              id={phoneId}
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              placeholder="+90 532 555 0123"
              autoComplete="tel"
            />
          </Field>
          <Field
            label="Masa No"
            htmlFor={tableId}
            hint="İsterseniz boş bırakabilirsiniz."
          >
            <Input
              id={tableId}
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              placeholder="örn. 4"
              inputMode="text"
            />
          </Field>
          <Field label="Sipariş Notu" htmlFor={notesId}>
            <Textarea
              id={notesId}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Genel notlar (opsiyonel)"
            />
          </Field>
        </div>

        {error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </p>
        ) : null}
      </form>
    </Sheet>
  );
}

function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-text">
        {label}
        {required ? (
          <span aria-hidden className="ml-0.5 text-danger">
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
