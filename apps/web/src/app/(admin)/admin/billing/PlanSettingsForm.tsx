"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";

import { FeatureFlagList } from "./FeatureFlagList";
import {
  AdminApiError,
  updatePlanSettings,
} from "@/lib/api-admin";
import type { FeatureKey, Plan, PlanSettings } from "@/types/admin";
import { PLAN_LABEL } from "@/types/admin";

interface PlanSettingsFormProps {
  initial: PlanSettings;
  csrfToken: string | null;
}

interface FieldShellProps {
  label: string;
  htmlFor?: string;
  helpText?: string;
  children: React.ReactNode;
}

/**
 * Tiny label/helpText wrapper around arbitrary form controls. The
 * existing `<FormField>` primitive is input-only, so we inline the
 * label+control+help pattern for selects / textareas / compound widgets.
 * Kept local to the billing feature; promote to `_components/` if other
 * pages need it.
 */
function FieldShell({ label, htmlFor, helpText, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium text-text"
      >
        {label}
      </label>
      {children}
      {helpText ? (
        <p className="text-xs text-muted">{helpText}</p>
      ) : null}
    </div>
  );
}

/**
 * PlanSettingsForm — Sprint B2.
 *
 * Editable surface for `PUT /api/v1/admin/billing/plan/`. Three parts:
 *   1. Plan dropdown — switches the active tier. The backend "snaps" the
 *      feature booleans to the new tier's defaults on save; the UI
 *      previews this by overwriting the pending toggles when the user
 *      changes the plan.
 *   2. Feature flag toggles — per-flag overrides. See `<FeatureFlagList>`
 *      in editable mode.
 *   3. Billing notes textarea — operator-visible note (coupon, manual
 *      override reason, etc).
 *
 * On submit: PUT to /api/v1/admin/billing/plan/ with only the dirty
 * fields, then `router.refresh()` so the parent server component
 * re-renders with the updated snapshot.
 */
export function PlanSettingsForm({ initial, csrfToken }: PlanSettingsFormProps) {
  const router = useRouter();

  const [activePlan, setActivePlan] = useState<Plan>(initial.active_plan);
  const [featureState, setFeatureState] = useState<Record<FeatureKey, boolean>>(
    () => ({ ...(initial.features as Record<FeatureKey, boolean>) }),
  );
  const [notes, setNotes] = useState<string>(initial.billing_notes);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const isDirty =
    activePlan !== initial.active_plan ||
    notes !== initial.billing_notes ||
    (Object.keys(featureState) as FeatureKey[]).some(
      (k) => featureState[k] !== initial.features[k],
    );

  const reset = () => {
    setActivePlan(initial.active_plan);
    setFeatureState({ ...(initial.features as Record<FeatureKey, boolean>) });
    setNotes(initial.billing_notes);
    setError(null);
    setSaved(false);
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!csrfToken) {
      setError("CSRF token eksik — lütfen sayfayı yenileyin.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      // Build the features dict — only include flags the user actually
      // toggled so the backend treats omitted keys as "keep current".
      const features: Partial<Record<FeatureKey, boolean>> = {};
      (Object.keys(featureState) as FeatureKey[]).forEach((k) => {
        if (featureState[k] !== initial.features[k]) {
          features[k] = featureState[k];
        }
      });

      await updatePlanSettings(
        {
          active_plan: activePlan !== initial.active_plan ? activePlan : undefined,
          features: Object.keys(features).length > 0 ? features : undefined,
          billing_notes: notes !== initial.billing_notes ? notes : undefined,
        },
        csrfToken,
      );
      setSaved(true);
      router.refresh();
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Beklenmeyen bir hata oluştu.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-5"
      aria-describedby={error ? "plan-settings-error" : undefined}
    >
      <FieldShell
        label="Aktif paket"
        htmlFor="active-plan"
        helpText="Paket değiştiğinde özellik bayrakları yeni paketin varsayılanlarına döner."
      >
        <select
          id="active-plan"
          value={activePlan}
          onChange={(e) => setActivePlan(e.target.value as Plan)}
          className="block w-full rounded-xl border border-input bg-surface px-3.5 py-2.5 text-base sm:text-sm text-text shadow-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
        >
          {(Object.keys(PLAN_LABEL) as Plan[]).map((p) => (
            <option key={p} value={p}>
              {PLAN_LABEL[p]}
            </option>
          ))}
        </select>
      </FieldShell>

      <FieldShell
        label="Özellik bayrakları"
        helpText="Plan OPS dahil — bayrakları manuel olarak açıp kapatabilirsiniz."
      >
        <FeatureFlagList
          features={featureState}
          onToggle={(key, value) =>
            setFeatureState((prev) => ({ ...prev, [key]: value }))
          }
          editable
        />
      </FieldShell>

      <FieldShell
        label="Notlar"
        htmlFor="billing-notes"
        helpText="Operatöre görünür serbest metin (kupon, manuel müdahale, vb.)."
      >
        <textarea
          id="billing-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="block w-full rounded-xl border border-input bg-surface px-3.5 py-2.5 text-base sm:text-sm text-text shadow-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
          placeholder="Örn. Lansmana özel %20 indirim aktif."
        />
      </FieldShell>

      {error ? (
        <div
          id="plan-settings-error"
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}
      {saved ? (
        <div
          role="status"
          className="rounded-md border border-success/30 bg-success-soft px-4 py-3 text-sm text-success"
        >
          Plan ayarları kaydedildi.
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={reset}
          disabled={submitting || !isDirty}
          className="text-sm font-medium text-muted transition hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
        >
          Değişiklikleri geri al
        </button>
        <button
          type="submit"
          disabled={submitting || !isDirty}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Kaydediliyor…
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Kaydet
            </>
          )}
        </button>
      </div>
    </form>
  );
}