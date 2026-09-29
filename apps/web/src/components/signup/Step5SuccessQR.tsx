"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  Eye,
  Info,
  LayoutDashboard,
  Sparkles,
} from "lucide-react";

import { useSignupWizard } from "@/lib/stores/signup-wizard";

/**
 * Step5SuccessQR — wizard step 5 (final screen).
 *
 * Shows a success summary + three primary actions:
 *   - "/admin'e git"       → /admin/dashboard (the main operator
 *                            landing — replaces the redundant
 *                            /admin redirect target on the page)
 *   - "Menü önizleme"      → /m/<slug> (the public preview; the
 *                            slug field is the URL key)
 *   - "İlk QR'ı indir"     → disabled with a tooltip (Sprint C3 will
 *                            wire this to the QR-generation flow)
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

  function handleGoToAdmin() {
    // Push to /admin/dashboard — the (admin) layout will pick up the
    // qr_sessionid cookie that /api/v1/auth/signup set and render the
    // admin shell. Force a hard navigation so the wizard's persisted
    // state doesn't bleed into the admin route.
    router.push("/admin/dashboard");
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
        <QrDownloadButton disabled />
      </div>

      <div className="rounded-md border border-dashed border-border bg-background/40 p-4 text-left text-xs text-muted">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="space-y-1">
            <p>
              <strong className="text-text">İlk QR kodu oluşturma:</strong>{" "}
              admin panelinden QR Codes menüsüne giderek dilediğiniz
              zaman indirebilirsiniz.
            </p>
            <p className="flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Sprint C3&apos;te demo seed (Modern Cafe şablonu) ve
              TrialBanner da aktif olacak.
            </p>
          </div>
        </div>
      </div>

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
// QrDownloadButton — disabled stub. Sprint C3 will swap the onClick for
// the QR-generation endpoint and remove the disabled + tooltip pair.
// ---------------------------------------------------------------------------

function QrDownloadButton({ disabled }: { disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      title="Şimdilik admin panelden QR oluşturabilirsiniz — Sprint C3'te aktif olacak"
      aria-label="İlk QR kodu indir (Sprint C3&apos;te aktif olacak)"
      className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-md border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-muted opacity-60"
    >
      <Download className="h-4 w-4" />
      İlk QR&apos;ı indir
    </button>
  );
}