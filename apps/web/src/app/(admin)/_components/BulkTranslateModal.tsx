"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Database,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";

import { LocaleBadge } from "./LocaleBadge";
import {
  fetchItemsByMenu,
  translateMenuCategory,
  translateMenuItem,
} from "@/lib/api-admin";
import type {
  AdminLocaleCode,
  AdminMenu,
  AITranslateEntityRow,
  AITranslateMenuEntityResponse,
} from "@/types/admin";

interface BulkTranslateModalProps {
  open: boolean;
  onClose: () => void;
  menu: AdminMenu;
  /** CSRF token forwarded to POST /api/v1/admin/translate/menu-{item|category}/{id}/. */
  csrfToken: string | null;
  /** Pre-fetched list of category ids for this menu (server-passed). */
  categoryIds: number[];
  /** Whether to include categories in step 1 selector. */
  includeCategories?: boolean;
}

type EntityFilter = "all" | "items" | "categories";
type Step = "locales" | "source" | "preview" | "running" | "done";

interface RunStats {
  totalTargets: number;
  completed: number;
  cacheHits: number;
  apiCalls: number;
  errors: number;
}

/**
 * BulkTranslateModal — Sprint 9B.
 *
 * 4-step wizard for translating every item (and optionally category)
 * in a menu into one or more target locales.
 *
 * Step 1: pick target locales (multi-select pill row).
 * Step 2: pick source locale + entity filter (all/items/categories).
 * Step 3: preview step — runs the first 3 entities and shows the
 *         result rows so the operator sees "this would generate N new
 *         translations and M cache hits".
 * Step 4: confirm → progress indicator → success screen.
 *
 * Backend shape (D-023): each per-locale call returns
 * {translations: [{locale, translated_name, translated_description,
 *   cached, provider, model}], ai_provider}. Cache + provider info is
 * rolled up into the success screen.
 *
 * Polling-free: the bulk run is small enough (V1 menu cap is ~100 items)
 * to run sequentially in a single promise.all — no SSE needed (matches
 * the out-of-scope note: polling UI yeterli, SSE V2 backlog).
 */
export function BulkTranslateModal({
  open,
  onClose,
  menu,
  csrfToken,
  categoryIds,
  includeCategories = true,
}: BulkTranslateModalProps) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const [step, setStep] = useState<Step>("locales");
  const [targetLocales, setTargetLocales] = useState<AdminLocaleCode[]>([]);
  const [sourceLocale, setSourceLocale] =
    useState<AdminLocaleCode>(menu.default_locale);
  const [entityFilter, setEntityFilter] = useState<EntityFilter>(
    includeCategories ? "all" : "items",
  );
  const [itemIds, setItemIds] = useState<number[]>([]);
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState<RunStats>({
    totalTargets: 0,
    completed: 0,
    cacheHits: 0,
    apiCalls: 0,
    errors: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<
    Array<{ id: number; name: string; rows: AITranslateEntityRow[] }>
  >([]);

  // Sync dialog open state with native <dialog>.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // Reset on open.
      setStep("locales");
      setTargetLocales([]);
      setSourceLocale(menu.default_locale);
      setEntityFilter(includeCategories ? "all" : "items");
      setItemIds([]);
      setRunning(false);
      setRunProgress({
        totalTargets: 0,
        completed: 0,
        cacheHits: 0,
        apiCalls: 0,
        errors: 0,
      });
      setError(null);
      setPreview([]);
    } else if (!open && el.open) {
      el.close();
    }
  }, [open, menu.default_locale, includeCategories]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: Event) => {
      e.preventDefault();
      if (!running) onClose();
    };
    el.addEventListener("cancel", handler);
    return () => el.removeEventListener("cancel", handler);
  }, [onClose, running]);

  const otherLocales = useMemo<AdminLocaleCode[]>(
    () => menu.supported_locales.filter((l) => l !== sourceLocale),
    [menu.supported_locales, sourceLocale],
  );

  const toggleTarget = (locale: AdminLocaleCode) => {
    setTargetLocales((prev) =>
      prev.includes(locale)
        ? prev.filter((l) => l !== locale)
        : [...prev, locale],
    );
  };

  // Step 3 — load items + run preview for first 3 entities.
  const loadPreview = useCallback(async () => {
    if (!csrfToken) {
      setError("CSRF token eksik. Sayfayı yenileyin.");
      return;
    }
    setError(null);
    try {
      let targetEntities: Array<{ id: number; name: string; kind: "item" | "category" }> = [];
      if (entityFilter === "items" || entityFilter === "all") {
        const items = await fetchItemsByMenu(menu.id, {
          internal: false,
        });
        targetEntities = targetEntities.concat(
          items.map((i) => ({ id: i.id, name: i.name, kind: "item" as const })),
        );
      }
      if (entityFilter === "categories" || entityFilter === "all") {
        targetEntities = targetEntities.concat(
          categoryIds.map((id) => ({
            id,
            name: `#${id}`,
            kind: "category" as const,
          })),
        );
      }
      const sample = targetEntities.slice(0, 3);
      const results: Array<{
        id: number;
        name: string;
        rows: AITranslateEntityRow[];
      }> = [];
      for (const ent of sample) {
        try {
          const response = await translateOne(ent, sourceLocale, targetLocales, csrfToken);
          results.push({
            id: ent.id,
            name: ent.name,
            rows: response.translations,
          });
        } catch {
          results.push({ id: ent.id, name: ent.name, rows: [] });
        }
      }
      setPreview(results);
      setStep("preview");
    } catch (err) {
      setError(extractError(err));
    }
  }, [csrfToken, entityFilter, categoryIds, menu.id, sourceLocale, targetLocales]);

  // Step 4 — run the full bulk operation.
  const runBulk = useCallback(async () => {
    if (!csrfToken) {
      setError("CSRF token eksik. Sayfayı yenileyin.");
      return;
    }
    setError(null);
    setRunning(true);
    setStep("running");
    let targetEntities: Array<{ id: number; name: string; kind: "item" | "category" }> = [];
    try {
      if (entityFilter === "items" || entityFilter === "all") {
        const items = await fetchItemsByMenu(menu.id, {
          internal: false,
        });
        targetEntities = targetEntities.concat(
          items.map((i) => ({ id: i.id, name: i.name, kind: "item" as const })),
        );
      }
      if (entityFilter === "categories" || entityFilter === "all") {
        targetEntities = targetEntities.concat(
          categoryIds.map((id) => ({
            id,
            name: `#${id}`,
            kind: "category" as const,
          })),
        );
      }
      const total = targetEntities.length * targetLocales.length;
      setRunProgress({
        totalTargets: total,
        completed: 0,
        cacheHits: 0,
        apiCalls: 0,
        errors: 0,
      });
      for (const ent of targetEntities) {
        try {
          const response = await translateOne(
            ent,
            sourceLocale,
            targetLocales,
            csrfToken,
          );
          for (const row of response.translations) {
            setRunProgress((prev) => ({
              ...prev,
              completed: prev.completed + 1,
              cacheHits: prev.cacheHits + (row.cached ? 1 : 0),
              apiCalls: prev.apiCalls + (row.cached ? 0 : 1),
            }));
          }
        } catch (err) {
          setRunProgress((prev) => ({
            ...prev,
            completed: prev.completed + targetLocales.length,
            errors: prev.errors + 1,
          }));
          // bubble once for the UI
          setError(extractError(err));
        }
      }
      setStep("done");
    } finally {
      setRunning(false);
    }
  }, [csrfToken, entityFilter, categoryIds, menu.id, sourceLocale, targetLocales]);

  return (
    <dialog
      ref={ref}
      onClose={() => !running && onClose()}
      aria-labelledby="bulk-translate-title"
      className="rounded-xl border border-border bg-surface p-0 shadow-floating backdrop:bg-text/40"
    >
      <div className="flex w-full max-w-2xl flex-col gap-4 p-6">
        <header className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
          >
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="bulk-translate-title"
              className="font-heading text-lg font-bold text-text"
            >
              Toplu Çeviri
            </h2>
            <p className="mt-1 text-sm text-muted">
              {menu.name} menüsündeki içerikleri AI ile toplu olarak çevirin.
            </p>
          </div>
          <button
            type="button"
            onClick={() => !running && onClose()}
            disabled={running}
            aria-label="Kapat"
            className="rounded-md p-1 text-muted transition hover:bg-background hover:text-text disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <Stepper step={step} />

        <div className="min-h-[14rem]">
          {step === "locales" ? (
            <StepLocales
              supported={menu.supported_locales}
              source={sourceLocale}
              selected={targetLocales}
              onToggle={toggleTarget}
              otherLocales={otherLocales}
            />
          ) : null}
          {step === "source" ? (
            <StepSource
              supported={menu.supported_locales}
              source={sourceLocale}
              onSourceChange={setSourceLocale}
              entityFilter={entityFilter}
              onEntityFilterChange={setEntityFilter}
              includeCategories={includeCategories}
            />
          ) : null}
          {step === "preview" ? (
            <StepPreview preview={preview} targetLocales={targetLocales} />
          ) : null}
          {step === "running" ? (
            <StepRunning
              progress={runProgress}
              targetLocales={targetLocales}
            />
          ) : null}
          {step === "done" ? (
            <StepDone
              progress={runProgress}
              targetLocales={targetLocales}
            />
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        ) : null}

        <footer className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setStep(previousStep(step))}
            disabled={step === "locales" || step === "running" || running}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Geri
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => !running && onClose()}
              disabled={running}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition hover:bg-background disabled:opacity-60"
            >
              Kapat
            </button>
            {step === "locales" ? (
              <button
                type="button"
                onClick={() => setStep("source")}
                disabled={targetLocales.length === 0}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
              >
                Devam <ChevronRight className="h-3.5 w-3.5" />
              </button>
            ) : null}
            {step === "source" ? (
              <button
                type="button"
                onClick={() => void loadPreview()}
                disabled={running}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
              >
                Önizle
              </button>
            ) : null}
            {step === "preview" ? (
              <button
                type="button"
                onClick={() => void runBulk()}
                disabled={running}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
              >
                Onayla ve çalıştır
              </button>
            ) : null}
            {step === "done" ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                <Check className="h-3.5 w-3.5" /> Tamam
              </button>
            ) : null}
          </div>
        </footer>
      </div>
    </dialog>
  );
}

async function translateOne(
  entity: { id: number; kind: "item" | "category" },
  sourceLocale: AdminLocaleCode,
  targetLocales: AdminLocaleCode[],
  csrfToken: string,
): Promise<AITranslateMenuEntityResponse> {
  const payload = {
    source_locale: sourceLocale,
    target_locales: targetLocales,
  };
  return entity.kind === "item"
    ? translateMenuItem(entity.id, payload, csrfToken)
    : translateMenuCategory(entity.id, payload, csrfToken);
}

function extractError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Bilinmeyen hata.";
}

function previousStep(step: Step): Step {
  switch (step) {
    case "source":
      return "locales";
    case "preview":
      return "source";
    case "done":
      return "preview";
    default:
      return "locales";
  }
}

// ---------------------------------------------------------------------------
// Step renderers
// ---------------------------------------------------------------------------
function Stepper({ step }: { step: Step }) {
  const steps: Array<{ key: Step; label: string }> = [
    { key: "locales", label: "Hedef diller" },
    { key: "source", label: "Kaynak" },
    { key: "preview", label: "Önizleme" },
    { key: "running", label: "Çalışıyor" },
    { key: "done", label: "Bitti" },
  ];
  return (
    <ol className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted">
      {steps.map((s, idx) => {
        const reached =
          stepOrder(step) >= stepOrder(s.key) ||
          step === "running" ||
          step === "done";
        return (
          <li key={s.key} className="flex items-center gap-1">
            <span
              className={clsx(
                "rounded-full px-2 py-0.5",
                reached
                  ? "bg-primary/10 font-semibold text-primary"
                  : "bg-muted/10",
              )}
            >
              {idx + 1}. {s.label}
            </span>
            {idx < steps.length - 1 ? (
              <ArrowRight className="h-3 w-3 text-muted/50" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function stepOrder(step: Step): number {
  switch (step) {
    case "locales":
      return 0;
    case "source":
      return 1;
    case "preview":
      return 2;
    case "running":
      return 3;
    case "done":
      return 4;
    default:
      return 0;
  }
}

function StepLocales({
  supported,
  source,
  selected,
  onToggle,
  otherLocales,
}: {
  supported: AdminLocaleCode[];
  source: AdminLocaleCode;
  selected: AdminLocaleCode[];
  onToggle: (locale: AdminLocaleCode) => void;
  otherLocales: AdminLocaleCode[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text">
        Hangi dillere çevirmek istiyorsunuz?
      </p>
      <p className="text-xs text-muted">
        Menü varsayılan dili <span className="font-semibold uppercase">{source}</span>{" "}
        — kaynak olarak kullanılacak.
      </p>
      <div className="flex flex-wrap gap-2">
        {otherLocales.map((loc) => {
          const active = selected.includes(loc);
          return (
            <LocaleBadge
              key={loc}
              locale={loc}
              active={active}
              size="md"
              asButton
              showFlag
              onClick={() => onToggle(loc)}
            />
          );
        })}
      </div>
      {supported.length <= 1 ? (
        <p className="text-xs italic text-muted">
          Bu menüde sadece tek desteklenen dil var — toplu çeviri anlamlı değil.
        </p>
      ) : null}
      <p className="text-[11px] text-muted">
        Seçili: <span className="font-semibold">{selected.length}</span> hedef dil
      </p>
    </div>
  );
}

function StepSource({
  supported,
  source,
  onSourceChange,
  entityFilter,
  onEntityFilterChange,
  includeCategories,
}: {
  supported: AdminLocaleCode[];
  source: AdminLocaleCode;
  onSourceChange: (locale: AdminLocaleCode) => void;
  entityFilter: EntityFilter;
  onEntityFilterChange: (filter: EntityFilter) => void;
  includeCategories: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="bulk-source-locale"
          className="text-sm font-medium text-text"
        >
          Kaynak dil
        </label>
        <select
          id="bulk-source-locale"
          value={source}
          onChange={(e) => onSourceChange(e.target.value as AdminLocaleCode)}
          className="w-48 rounded-xl border border-input bg-surface px-3.5 py-2.5 text-base sm:text-sm text-text focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
        >
          {supported.map((loc) => (
            <option key={loc} value={loc}>
              {loc.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-text">Çevrilecek içerik</span>
        <div className="flex flex-wrap gap-2">
          <FilterPill
            label="Tümü"
            active={entityFilter === "all"}
            onClick={() => onEntityFilterChange("all")}
            disabled={!includeCategories}
          />
          <FilterPill
            label="Sadece ürünler"
            active={entityFilter === "items"}
            onClick={() => onEntityFilterChange("items")}
          />
          {includeCategories ? (
            <FilterPill
              label="Sadece kategoriler"
              active={entityFilter === "categories"}
              onClick={() => onEntityFilterChange("categories")}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
  disabled,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "rounded-full px-3 py-1 text-xs font-semibold transition",
        active
          ? "bg-primary text-primary-foreground"
          : "border border-border bg-surface text-muted hover:text-text",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      {label}
    </button>
  );
}

function StepPreview({
  preview,
  targetLocales,
}: {
  preview: Array<{ id: number; name: string; rows: AITranslateEntityRow[] }>;
  targetLocales: AdminLocaleCode[];
}) {
  if (preview.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border bg-background p-4 text-center text-sm text-muted">
        Önizlenecek içerik bulunamadı.
      </p>
    );
  }
  const totalCacheHits = preview.reduce(
    (acc, row) => acc + row.rows.filter((r) => r.cached).length,
    0,
  );
  const totalRows = preview.reduce((acc, row) => acc + row.rows.length, 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-xs">
        <span className="inline-flex items-center gap-1 font-semibold text-primary">
          <Database className="h-3.5 w-3.5" />
          Önbellek tahmini: {totalCacheHits} / {totalRows}
        </span>
        <span className="text-muted">
          Yeni API call: {totalRows - totalCacheHits}
        </span>
      </div>
      <ul className="divide-y divide-border rounded-md border border-border bg-background">
        {preview.map((row) => (
          <li key={row.id} className="flex flex-col gap-1 px-3 py-2">
            <p className="truncate text-sm font-medium text-text">
              {row.name}
            </p>
            <div className="flex flex-wrap gap-2">
              {row.rows.map((r) => (
                <span
                  key={r.locale}
                  className={clsx(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    r.cached
                      ? "border border-primary/30 bg-primary/5 text-primary"
                      : "border border-danger/30 bg-danger-soft text-danger",
                  )}
                >
                  {r.locale.toUpperCase()}{" "}
                  {r.cached ? "önbellek" : "yeni"}
                </span>
              ))}
              {row.rows.length === 0 ? (
                <span className="text-xs italic text-danger">
                  başarısız
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted">
        Toplam hedef çeviri sayısı: {targetLocales.length} × örneklenen içerik ={" "}
        <span className="font-semibold">
          {preview.length * targetLocales.length}
        </span>
      </p>
    </div>
  );
}

function StepRunning({
  progress,
  targetLocales,
}: {
  progress: RunStats;
  targetLocales: AdminLocaleCode[];
}) {
  const pct =
    progress.totalTargets === 0
      ? 0
      : Math.round((progress.completed / progress.totalTargets) * 100);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text">
        AI çeviriyor… {progress.completed} / {progress.totalTargets} tamamlandı.
      </p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted/20">
        <div
          className="h-full bg-primary transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <Database className="h-3 w-3" /> önbellek: {progress.cacheHits}
        </span>
        <span>API call: {progress.apiCalls}</span>
        {progress.errors > 0 ? (
          <span className="text-danger">hata: {progress.errors}</span>
        ) : null}
        <span>hedef: {targetLocales.join(", ").toUpperCase()}</span>
      </div>
    </div>
  );
}

function StepDone({
  progress,
  targetLocales,
}: {
  progress: RunStats;
  targetLocales: AdminLocaleCode[];
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-primary/30 bg-primary/5 p-6 text-center">
      <Check className="h-8 w-8 text-primary" aria-hidden />
      <p className="text-sm font-semibold text-text">
        Toplu çeviri tamamlandı
      </p>
      <p className="text-xs text-muted">
        {progress.completed} çeviri ({progress.cacheHits} önbellekten,{" "}
        {progress.apiCalls} yeni API call){" "}
        {targetLocales.map((l) => l.toUpperCase()).join(" + ")} için
        işlendi.
      </p>
      {progress.errors > 0 ? (
        <p className="text-xs text-danger">
          {progress.errors} içerik başarısız oldu — detaylar için sayfayı
          yenileyin.
        </p>
      ) : null}
    </div>
  );
}