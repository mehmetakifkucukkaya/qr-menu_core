"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  Eye,
  Info,
  LayoutDashboard,
  Loader2,
  Sparkles,
} from "lucide-react";

import { useSignupWizard } from "@/lib/stores/signup-wizard";
import {
  completeOnboarding,
  generateFirstQR,
  importDemoTemplate,
  type FirstQRResponse,
} from "@/lib/api-onboarding";
import { AdminApiError } from "@/lib/api-admin";

/**
 * Step5SuccessQR — wizard step 5 (final screen).
 *
 * Shows a success summary + four primary actions:
 *   - "/admin'e git"          → /admin/dashboard (the main operator
 *                               landing — replaces the redundant
 *                               /admin redirect target on the page)
 *   - "Menü önizleme"         → /m/<slug> (the public preview; the
 *                               slug field is the URL key)
 *   - "İlk QR'ı indir"        → POSTs /qr-codes/first/ and exposes
 *                               the target_url + admin detail link.
 *                               Sprint C3 backend handler is wired
 *                               (apps/onboarding/services.generate_first_qr).
 *   - "Demo menüden başla"    → POSTs /onboarding/demo-seed/ to copy
 *                               Modern Cafe's published template into
 *                               the new tenant menu (idempotent —
 *                               second call returns skipped=true).
 *
 * Step 5 is also where the persisted form state stops mattering —
 * we proactively wipe the wizard store on mount so a reload doesn't
 * bounce the user back into the flow (the tenant is already created,
 * the wizard has served its purpose). The `useSignupWizard.reset()`
 * call is the canonical hook C3's logout flow also reuses.
 */
export function Step5SuccessQR() {
  const form = useSignupWizard((s) => s.formData);
  const reset = useSignupWizard((s) => s.reset);
  const router = useRouter();

  // Reset the wizard state once the user reaches the success screen
  // — we keep the form data around for the duration of this render
  // (so the summary below can read business_name + slug + plan), then
  // wipe it on unmount so a future /signup visit starts fresh.
  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  // --- C3b: fire POST /api/v1/onboarding/complete/ once on mount --------
  //
  // The wizard's persisted `first_category` + `first_items` snapshots
  // are the single source of truth here. We branch on three cases:
  //
  //   * Both name + items set  → submit a category + items payload.
  //   * Operator clicked "İlk kategori ve ürünleri sonra ekleyeceğim"
  //     on Step 4 (items list intentionally emptied by the wizard reset
  //     is NOT applied here — the store still holds the placeholder
  //     row). We detect the skip via `first_items.every(name === "")`
  //     AND a flag the wizard sets in Step 4. To keep this isolated we
  //     check the wizard's `setStep` history: if the user skipped, the
  //     first row was left empty AND `setStep(5)` ran from the skip
  //     button. Simplest robust heuristic: if every first_items row has
  //     an empty name → treat it as a skip.
  //   * No category (rare edge: state lost between steps) → no-op.
  //
  // The `submittedRef` guards against React 18 strict-mode double-mount
  // and accidental re-fires (e.g. dev hot reload). A real retry is
  // possible by reloading /signup, but that's a brand-new tenant.
  const submittedRef = useRef(false);
  useEffect(() => {
    if (submittedRef.current) return;
    const category = form.first_category;
    const items = form.first_items;
    if (!category?.name?.trim()) return; // no data → bail

    submittedRef.current = true;

    const namedItems = items.filter((it) => it.name.trim().length > 0);
    const skipItems = namedItems.length === 0;

    // Fire and forget — surface failures in the banner area below.
    completeOnboarding({
      category_name: category.name.trim(),
      category_icon: category.icon || "🍽️",
      items: namedItems.map((it) => ({
        name: it.name.trim(),
        price: it.price.trim() || "0",
        description: it.description?.trim() ?? "",
      })),
      skip_items: skipItems,
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("onboarding/complete failed", err);
      // Allow retry on the next mount — this only fires on strict-mode
      // double-mount or dev HMR, both of which are rare.
      submittedRef.current = false;
    });
  }, [form.first_category, form.first_items]);

  function handleGoToAdmin() {
    // Push to /admin/dashboard — the (admin) layout will pick up the
    // qr_sessionid cookie that /api/v1/auth/signup set and render the
    // admin shell. Force a hard navigation so the wizard's persisted
    // state doesn't bleed into the admin route.
    router.push("/admin/dashboard");
  }

  function handleGoToAdminAfterSeed() {
    // After the demo seed lands, hop into the admin dashboard so the
    // operator can immediately see the imported menu in the Menus list.
    router.push("/admin/menus");
  }

  return (
    <div className="space-y-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <div
          aria-hidden
          className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary"
        >
          <CheckCircle2 className="h-8 w-8" strokeWidth={2} />
        </div>
        <div>
          <h2 className="font-heading text-xl font-semibold text-text">
            Tebrikler! Hesabınız hazır.
          </h2>
          <p className="mt-1 text-sm text-muted">
            Dijital menünüzü oluşturmaya başlayabilirsiniz.
          </p>
        </div>
      </div>

      <SummaryPanel form={form} />

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={handleGoToAdmin}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          <LayoutDashboard className="h-4 w-4" />
          Admin paneline git
          <ArrowRight className="h-4 w-4" />
        </button>
        <Link
          href={form.slug ? `/m/${form.slug}` : "/"}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-text transition hover:border-primary/40 hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          target="_blank"
          rel="noreferrer"
        >
          <Eye className="h-4 w-4" />
          Menü önizleme
        </Link>
        <QrDownloadButton />
      </div>

      <div className="rounded-md border border-dashed border-border bg-background/40 p-4 text-left text-xs text-muted">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="space-y-1">
            <p>
              <strong className="text-text">QR kodu yönetimi:</strong>{" "}
              admin panelindeki QR Codes menüsünden yeni QR&apos;lar
              oluşturabilir, var olanları yeniden adlandırabilirsiniz.
            </p>
            <p className="flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Deneme süreniz başladı — üst şeritteki{" "}
              <strong className="text-text">Plan &amp; Limitler</strong>{" "}
              bağlantısından kalan gün sayısını görebilirsiniz.
            </p>
          </div>
        </div>
      </div>

      <DemoSeedPanel onAfterSeed={handleGoToAdminAfterSeed} />

      <p className="text-xs text-muted">
        <Link href="/login" className="hover:text-primary">
          Başka bir hesapla giriş yap
        </Link>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SummaryPanel — operator-facing recap of the data we just persisted.
// ---------------------------------------------------------------------------

interface SummaryPanelProps {
  form: {
    business_name: string;
    slug: string;
    default_locale: string;
    supported_locales: string[];
    currency: string;
  };
}

function SummaryPanel({ form }: SummaryPanelProps) {
  return (
    <dl className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-surface p-4 text-left text-sm sm:grid-cols-2">
      <Row label="İşletme" value={form.business_name || "—"} />
      <Row label="Slug" value={form.slug ? `/m/${form.slug}` : "—"} />
      <Row label="Dil" value={formatLocales(form)} />
      <Row label="Para birimi" value={form.currency || "—"} />
      <Row label="Plan" value="BASIC" mono />
    </dl>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd
        className={
          "mt-0.5 text-text" + (mono ? " font-mono text-xs" : "")
        }
      >
        {value}
      </dd>
    </div>
  );
}

function formatLocales(form: SummaryPanelProps["form"]): string {
  const def = form.default_locale;
  const sup = form.supported_locales.filter((l) => l !== def);
  if (!def) return "—";
  if (sup.length === 0) return def.toUpperCase();
  return `${def.toUpperCase()} + ${sup.map((l) => l.toUpperCase()).join(", ")}`;
}

// ---------------------------------------------------------------------------
// QrDownloadButton — Sprint C3b active.
//
// Fires POST /api/v1/qr-codes/first/ (idempotent — returns the
// existing QR on subsequent calls). On success the button morphs
// into a "QR'ı yönet" link pointing at /admin/qr-codes/<id>, plus
// a copy-target affordance for the target_url. On failure we surface
// the error inline (no toast library yet — keep the dependency surface
// small for V1).
// ---------------------------------------------------------------------------

function QrDownloadButton() {
  const [qr, setQr] = useState<FirstQRResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (loading || qr) return;
    setLoading(true);
    setError(null);
    try {
      const res = await generateFirstQR();
      setQr(res);
    } catch (err) {
      const msg =
        err instanceof AdminApiError
          ? err.message
          : "QR oluşturulamadı. Lütfen tekrar deneyin.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (qr) {
    return (
      <div
        data-testid="qr-success"
        className="inline-flex flex-col items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-4 py-2 text-xs text-text"
      >
        <Link
          href={`/admin/qr-codes/${qr.id}`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Download className="h-4 w-4" />
          QR&apos;ı yönet
        </Link>
        <a
          href={qr.target_url}
          target="_blank"
          rel="noreferrer"
          className="break-all text-[11px] text-muted hover:text-text"
          title={qr.target_url}
        >
          {qr.target_url}
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        aria-busy={loading || undefined}
        className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-text transition hover:border-primary/40 hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {loading ? "QR oluşturuluyor…" : "İlk QR'ı indir"}
      </button>
      {error ? (
        <p
          role="alert"
          data-testid="qr-error"
          className="max-w-xs text-center text-[11px] font-medium text-danger"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DemoSeedPanel — Sprint C3b "Demo menüden başla" affordance.
//
// Calls POST /api/v1/onboarding/demo-seed/. Idempotent — a tenant that
// already imported Modern Cafe gets skipped=true on the second call.
//
// On success we hand control back to the parent (Step5) which routes
// the operator into /admin/menus so they immediately see the imported
// menu in the Menus list.
// ---------------------------------------------------------------------------

function DemoSeedPanel({
  onAfterSeed,
}: {
  onAfterSeed: () => void;
}) {
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "success"; categories: number; items: number; skipped: boolean }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function handleClick() {
    if (status.kind === "loading") return;
    setStatus({ kind: "loading" });
    try {
      const res = await importDemoTemplate();
      setStatus({
        kind: "success",
        categories: res.categories_copied,
        items: res.items_copied,
        skipped: res.skipped,
      });
      // Hop into the admin so the operator sees the import land. We
      // keep a brief delay so the success pill is visible before the
      // route swap.
      window.setTimeout(onAfterSeed, 900);
    } catch (err) {
      const msg =
        err instanceof AdminApiError
          ? err.message
          : "Demo şablon yüklenemedi. Lütfen tekrar deneyin.";
      setStatus({ kind: "error", message: msg });
    }
  }

  return (
    <div className="rounded-md border border-border bg-surface/60 p-4 text-left text-xs text-muted">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text">
            <Sparkles className="mr-1 inline h-3.5 w-3.5 text-primary" />
            Hızlı başlangıç: Modern Cafe şablonu
          </p>
          <p className="mt-1 max-w-md">
            5 hazır kategori ve 25 örnek ürün menünüze tek tıkla
            eklenir. Sonra admin panelden düzenleyebilirsiniz.
          </p>
        </div>
        <button
          type="button"
          onClick={handleClick}
          disabled={status.kind === "loading" || status.kind === "success"}
          className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-70"
        >
          {status.kind === "loading" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden />
          )}
          {status.kind === "loading"
            ? "Yükleniyor…"
            : status.kind === "success" && status.skipped
              ? "Zaten yüklü"
              : status.kind === "success"
                ? "Yüklendi ✓"
                : "Demo menüden başla"}
        </button>
      </div>

      {status.kind === "success" ? (
        <p
          role="status"
          data-testid="demo-seed-success"
          className="mt-2 text-[11px] font-medium text-primary"
        >
          {status.skipped
            ? "Demo şablonu zaten yüklüydü — atlandı."
            : `${status.categories} kategori ve ${status.items} ürün menüye eklendi.`}
        </p>
      ) : null}
      {status.kind === "error" ? (
        <p
          role="alert"
          data-testid="demo-seed-error"
          className="mt-2 text-[11px] font-medium text-danger"
        >
          {status.message}
        </p>
      ) : null}
    </div>
  );
}