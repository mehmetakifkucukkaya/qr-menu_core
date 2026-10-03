"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Award, CheckCircle2, Loader2, RotateCcw, Save } from "lucide-react";

import { FormField } from "@/app/(admin)/_components/FormField";
import { updateLoyaltySettings } from "@/lib/api-admin";
import type { LoyaltySettingsAdmin } from "@/types/admin";

interface LoyaltySettingsFormProps {
  initial: LoyaltySettingsAdmin;
  csrfToken: string | null;
}

/**
 * LoyaltySettingsForm — controlled client form for the per-org loyalty
 * configuration.
 *
 * Mirrors `apps.account.serializers.AdminLoyaltySettingsSerializer`:
 *   - is_enabled (boolean)
 *   - points_per_currency_unit (decimal string, must be > 0)
 *   - redemption_rate (decimal string, must be > 0)
 *   - min_points_to_redeem (int, must be >= 1)
 *   - points_expiry_days (int or null; null = never expire)
 *
 * Live preview: "100 TL sipariş = X puan" and "500 puan = Y TL indirim".
 * Dirty state surfaces a "Değişiklikleri geri al" button that resets
 * the form back to the server-rendered snapshot.
 */
export function LoyaltySettingsForm({ initial, csrfToken }: LoyaltySettingsFormProps) {
  const router = useRouter();

  const [isEnabled, setIsEnabled] = useState<boolean>(initial.is_enabled);
  const [pointsPerUnit, setPointsPerUnit] = useState<string>(
    initial.points_per_currency_unit,
  );
  const [redemptionRate, setRedemptionRate] = useState<string>(
    initial.redemption_rate,
  );
  const [minPoints, setMinPoints] = useState<string>(
    String(initial.min_points_to_redeem),
  );
  const [expiryDays, setExpiryDays] = useState<string>(
    initial.points_expiry_days === null ? "" : String(initial.points_expiry_days),
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const reset = () => {
    setIsEnabled(initial.is_enabled);
    setPointsPerUnit(initial.points_per_currency_unit);
    setRedemptionRate(initial.redemption_rate);
    setMinPoints(String(initial.min_points_to_redeem));
    setExpiryDays(
      initial.points_expiry_days === null
        ? ""
        : String(initial.points_expiry_days),
    );
    setError(null);
    setSaved(false);
  };

  // ---- Validation -------------------------------------------------------
  const parsedPointsPerUnit = Number.parseFloat(pointsPerUnit);
  const parsedRedemptionRate = Number.parseFloat(redemptionRate);
  const parsedMinPoints = Number.parseInt(minPoints, 10);
  const parsedExpiry =
    expiryDays.trim() === "" ? null : Number.parseInt(expiryDays, 10);

  const validationErrors: string[] = [];
  if (!Number.isFinite(parsedPointsPerUnit) || parsedPointsPerUnit <= 0) {
    validationErrors.push("Puan oranı sıfırdan büyük olmalı.");
  }
  if (!Number.isFinite(parsedRedemptionRate) || parsedRedemptionRate <= 0) {
    validationErrors.push("Harcama oranı sıfırdan büyük olmalı.");
  }
  if (!Number.isInteger(parsedMinPoints) || parsedMinPoints < 1) {
    validationErrors.push("Minimum harcama eşiği en az 1 olmalı.");
  }
  if (expiryDays.trim() !== "" && (!Number.isInteger(parsedExpiry) || (parsedExpiry ?? 0) < 1)) {
    validationErrors.push("Geçerlilik süresi 1 veya daha büyük olmalı (boş = hiç).");
  }

  const isValid = validationErrors.length === 0;

  // ---- Preview helpers --------------------------------------------------
  const previewPoints = Number.isFinite(parsedPointsPerUnit)
    ? Math.round(100 * parsedPointsPerUnit)
    : 0;
  const previewDiscount = Number.isFinite(parsedRedemptionRate)
    ? (500 * parsedRedemptionRate).toFixed(2)
    : "0.00";

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (!csrfToken) {
      setError("CSRF token eksik. Sayfayı yenileyin.");
      return;
    }
    if (!isValid) {
      setError(validationErrors[0]);
      return;
    }

    setSubmitting(true);
    try {
      await updateLoyaltySettings(
        {
          is_enabled: isEnabled,
          points_per_currency_unit: parsedPointsPerUnit.toFixed(4),
          redemption_rate: parsedRedemptionRate.toFixed(4),
          min_points_to_redeem: parsedMinPoints,
          points_expiry_days: parsedExpiry,
        },
        csrfToken,
      );
      setSaved(true);
      router.refresh();
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Sadakat ayarları kaydedilemedi.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-text"
        >
          {error}
        </div>
      ) : null}
      {saved ? (
        <div
          role="status"
          className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-text"
        >
          <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
          Ayarlar kaydedildi.
        </div>
      ) : null}

      {/* is_enabled toggle */}
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-text">Sadakat programı</span>
          <span className="text-xs text-muted">
            Müşteriler puan kazanabilsin ve harcayabilsin.
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isEnabled}
          onClick={() => setIsEnabled((v) => !v)}
          disabled={submitting}
          className={
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 " +
            (isEnabled ? "bg-primary" : "bg-muted/40")
          }
        >
          <span
            className={
              "inline-block h-5 w-5 transform rounded-full bg-surface shadow transition " +
              (isEnabled ? "translate-x-5" : "translate-x-0.5")
            }
          />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          label="Puan oranı (TL başına)"
          name="points_per_currency_unit"
          type="number"
          value={pointsPerUnit}
          onChange={setPointsPerUnit}
          hint='Varsayılan: 1.0000. "1 TL = 1 puan" için 1.00 girin.'
          disabled={submitting}
        />
        <FormField
          label="Harcama oranı (puan başına TL)"
          name="redemption_rate"
          type="number"
          value={redemptionRate}
          onChange={setRedemptionRate}
          hint="Varsayılan: 0.10. 1 puan = 0.10 TL için 0.10 girin."
          disabled={submitting}
        />
        <FormField
          label="Minimum harcama eşiği (puan)"
          name="min_points_to_redeem"
          type="number"
          value={minPoints}
          onChange={setMinPoints}
          hint="Müşteri yalnız bu kadar puana ulaştığında harcayabilir."
          disabled={submitting}
        />
        <FormField
          label="Puan geçerlilik süresi (gün)"
          name="points_expiry_days"
          type="number"
          value={expiryDays}
          onChange={setExpiryDays}
          hint="Boş bırakırsanız puanlar süresiz geçerlidir."
          disabled={submitting}
        />
      </div>

      {/* Live preview */}
      <aside className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
        <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
          <Award className="h-3.5 w-3.5" aria-hidden />
          Canlı Önizleme
        </p>
        <ul className="space-y-1 text-sm text-text">
          <li>
            100 TL sipariş →
            <span className="ml-1 font-semibold text-primary">
              {previewPoints} puan
            </span>
          </li>
          <li>
            500 puan →
            <span className="ml-1 font-semibold text-primary">
              {previewDiscount} TL indirim
            </span>
          </li>
          {parsedMinPoints >= 1 ? (
            <li className="text-xs text-muted">
              Müşteriler minimum <b>{parsedMinPoints}</b> puana ulaştığında
              harcama yapabilir.
            </li>
          ) : null}
        </ul>
      </aside>

      {!isValid && (parsedPointsPerUnit || parsedRedemptionRate || parsedMinPoints) ? (
        <ul
          role="alert"
          className="space-y-1 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger"
        >
          {validationErrors.map((e) => (
            <li key={e}>• {e}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={reset}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text transition hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          Geri al
        </button>
        <button
          type="submit"
          disabled={submitting || !isValid}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Kaydediliyor…
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Değişiklikleri kaydet
            </>
          )}
        </button>
      </div>
    </form>
  );
}
