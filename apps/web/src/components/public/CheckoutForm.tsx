"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Receipt, CheckCircle2 } from "lucide-react";
import { useCartStore } from "@/lib/cart-store";
import { createOrder, OrdersApiError } from "@/lib/api-orders";
import { formatPrice } from "@/lib/format";

interface CheckoutFormProps {
  open: boolean;
  onClose: () => void;
  businessSlug: string;
  currency: string;
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
}: CheckoutFormProps) {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const tableNumber = useCartStore((s) => s.tableNumber);
  const setTableNumber = useCartStore((s) => s.setTableNumber);
  const clear = useCartStore((s) => s.clear);
  const totalAmount = useCartStore((s) => s.totalAmount());

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  // Pre-fill table number from ?table= once, when the modal first opens.
  useEffect(() => {
    if (!open) return;
    if (typeof window !== "undefined" && !tableNumber) {
      const params = new URLSearchParams(window.location.search);
      const fromQuery = params.get("table");
      if (fromQuery) setTableNumber(fromQuery);
    }
    queueMicrotask(() => nameRef.current?.focus());
  }, [open, tableNumber, setTableNumber]);

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
    setSubmitting(true);
    setError(null);

    try {
      const payload = {
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
            <p className="mt-1 text-[10px] italic text-muted">
              Toplam tutar işletme tarafından onaylanır; nihai tutar
              sipariş onayında görüntülenir.
            </p>
          </section>

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
            disabled={submitting || items.length === 0 || !name.trim() || !phone.trim()}
            className="flex-[2] inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              "Gönderiliyor…"
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                Onayla
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