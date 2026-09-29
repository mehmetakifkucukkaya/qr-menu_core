"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, X } from "lucide-react";

import type {
  FeatureDelta,
  ResourceDelta,
  UpgradePreview,
} from "@/types/admin";
import { FEATURE_LABEL, PLAN_LIMIT_LABEL } from "@/types/admin";

interface UpgradePreviewModalProps {
  open: boolean;
  /** Preview payload from `POST /api/v1/admin/billing/limits/preview-upgrade/`.
   *  When null we render a generic loading message instead of empty rows. */
  preview: UpgradePreview | null;
  /** True while the parent form is fetching the preview. */
  loading: boolean;
  /** Optional error string from the preview fetch. */
  error?: string | null;
  /** Called when the user dismisses the modal. */
  onClose: () => void;
}

/**
 * UpgradePreviewModal — Sprint B2.
 *
 * Renders the diff between the operator's current plan and a target
 * tier. Two tables:
 *   - Feature flag deltas (added / removed flags)
 *   - Resource limit deltas (old → new value, "Sınırsız" for null)
 *
 * Built on the native <dialog> element so we get backdrop + ESC for free.
 * We deliberately use the same primitive as `<ConfirmDialog>` so the
 * admin shell stays consistent — a future 12C `<Modal>` primitive will
 * unify both.
 */
export function UpgradePreviewModal({
  open,
  preview,
  loading,
  error,
  onClose,
}: UpgradePreviewModalProps) {
  const ref = useRef<HTMLDialogElement | null>(null);

  // Sync `open` ↔ native dialog imperative API.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  // ESC handler — native <dialog> fires the `cancel` event.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener("cancel", handler);
    return () => el.removeEventListener("cancel", handler);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="upgrade-preview-title"
      className="rounded-xl border border-border p-0 backdrop:bg-text/40 max-w-2xl w-full"
    >
      <div className="flex max-h-[85vh] flex-col">
        <header className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Yükseltme önizleme
            </p>
            <h2
              id="upgrade-preview-title"
              className="font-heading text-lg font-bold text-text"
            >
              {preview
                ? `${preview.current_tier.label} → ${preview.target_tier.label}`
                : "Yükseltme önizlemesi"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="rounded-md p-1 text-muted transition hover:bg-background hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <p className="text-sm text-muted">Önizleme hesaplanıyor…</p>
          ) : error ? (
            <div
              role="alert"
              className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
            >
              {error}
            </div>
          ) : !preview ? (
            <p className="text-sm text-muted">Önizleme bulunamadı.</p>
          ) : (
            <PreviewBody preview={preview} />
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border bg-background/40 px-6 py-3">
          <p className="text-xs text-muted">
            Önizleme — gerçek plan değişikliği yukarıdaki formdaki
            &quot;Kaydet&quot; ile tetiklenir.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition hover:bg-background"
          >
            Kapat
          </button>
        </footer>
      </div>
    </dialog>
  );
}

interface PreviewBodyProps {
  preview: UpgradePreview;
}

function PreviewBody({ preview }: PreviewBodyProps) {
  const noChanges =
    preview.feature_deltas.length === 0 && preview.resource_deltas.length === 0;

  if (noChanges) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Bu plana geçiş mevcut özellik veya limit kümesini değiştirmiyor.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DeltaSection
        title="Özellik bayrakları"
        emptyMessage="Özellik bayrağı değişmiyor."
      >
        {preview.feature_deltas.map((d) => (
          <FeatureDeltaRow key={d.feature} delta={d} />
        ))}
      </DeltaSection>

      <DeltaSection
        title="Limitler"
        emptyMessage="Limit değişmiyor."
      >
        {preview.resource_deltas.map((d) => (
          <ResourceDeltaRow key={d.resource} delta={d} />
        ))}
      </DeltaSection>
    </div>
  );
}

interface DeltaSectionProps {
  title: string;
  emptyMessage: string;
  children: React.ReactNode;
}

function DeltaSection({ title, emptyMessage, children }: DeltaSectionProps) {
  const items = Array.isArray(children) ? children : [children];
  // `children` is always an array of <FeatureDeltaRow> or <ResourceDeltaRow>;
  // if the parent passes nothing, we render the empty message.
  const isEmpty =
    items.length === 0 ||
    (items.length === 1 && (items[0] as { key?: string | null })?.key === null);
  return (
    <section>
      <h4 className="mb-2 font-heading text-sm font-semibold text-text">
        {title}
      </h4>
      {isEmpty ? (
        <p className="text-xs text-muted">{emptyMessage}</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-surface">
          {children}
        </ul>
      )}
    </section>
  );
}

function FeatureDeltaRow({ delta }: { delta: FeatureDelta }) {
  const isUp = delta.direction === "up";
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <span className="text-text">{FEATURE_LABEL[delta.feature]}</span>
      <span className="flex items-center gap-2 font-mono text-xs">
        <span
          className={
            delta.before
              ? "rounded bg-emerald-100 px-2 py-0.5 text-emerald-700"
              : "rounded bg-muted/30 px-2 py-0.5 text-muted"
          }
        >
          {delta.before ? "Açık" : "Kapalı"}
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-muted" aria-hidden />
        <span
          className={
            delta.after
              ? "rounded bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700"
              : "rounded bg-muted/30 px-2 py-0.5 text-muted"
          }
        >
          {delta.after ? "Açık" : "Kapalı"}
        </span>
        <span
          className={
            "ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase " +
            (isUp
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-700")
          }
        >
          {isUp ? "Eklendi" : "Kaldırıldı"}
        </span>
      </span>
    </li>
  );
}

function ResourceDeltaRow({ delta }: { delta: ResourceDelta }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <span className="text-text">{PLAN_LIMIT_LABEL[delta.resource]}</span>
      <span className="flex items-center gap-2 font-mono text-xs tabular-nums">
        <LimitCell value={delta.before} />
        <ArrowRight className="h-3.5 w-3.5 text-muted" aria-hidden />
        <LimitCell value={delta.after} emphasize />
      </span>
    </li>
  );
}

function LimitCell({
  value,
  emphasize = false,
}: {
  value: number | null;
  emphasize?: boolean;
}) {
  const display = value === null ? "Sınırsız" : value.toLocaleString("tr-TR");
  return (
    <span
      className={
        emphasize
          ? "rounded bg-primary/10 px-2 py-0.5 font-semibold text-primary"
          : "rounded bg-muted/20 px-2 py-0.5 text-text"
      }
    >
      {display}
    </span>
  );
}