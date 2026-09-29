"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

import {
  AdminApiError,
  previewUpgrade,
} from "@/lib/api-admin";
import type { Plan, UpgradePreview } from "@/types/admin";
import { PLAN_LABEL } from "@/types/admin";

import { UpgradePreviewModal } from "./UpgradePreviewModal";

interface UpgradePreviewButtonProps {
  /** CSRF token — required for the POST. */
  csrfToken: string | null;
}

/**
 * UpgradePreviewButton — Sprint B2.
 *
 * Owns the preview-upgrade flow:
 *   1. User picks a target plan from the dropdown.
 *   2. POST /api/v1/admin/billing/limits/preview-upgrade/
 *   3. Modal opens with feature + resource deltas.
 *
 * Kept as a single client component so the parent server component
 * doesn't need to manage any preview-related state.
 */
export function UpgradePreviewButton({ csrfToken }: UpgradePreviewButtonProps) {
  const [target, setTarget] = useState<Plan>("pro");
  const [preview, setPreview] = useState<UpgradePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const handlePreview = async () => {
    if (!csrfToken) {
      setError("CSRF token eksik — lütfen sayfayı yenileyin.");
      return;
    }
    setLoading(true);
    setError(null);
    setPreview(null);
    setModalOpen(true);
    try {
      const result = await previewUpgrade({ target_plan: target }, csrfToken);
      setPreview(result);
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Önizleme alınamadı.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="flex flex-1 flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          Hedef plan
        </span>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value as Plan)}
          className="block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {(Object.keys(PLAN_LABEL) as Plan[]).map((p) => (
            <option key={p} value={p}>
              {PLAN_LABEL[p]}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={handlePreview}
        disabled={loading}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Önizleniyor…
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Önizle
          </>
        )}
      </button>

      <UpgradePreviewModal
        open={modalOpen}
        preview={preview}
        loading={loading}
        error={error}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}