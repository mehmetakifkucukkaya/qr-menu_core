import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  Banknote,
  ChevronRight,
  CreditCard,
  Gauge,
  Layers,
} from "lucide-react";

import { AdminErrorState } from "@/app/(admin)/_components/ErrorState";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import {
  AdminApiError,
  fetchCurrentUser,
  fetchLimits,
  fetchPlanSettings,
  fetchUsage,
} from "@/lib/api-admin";
import type { PlanUsageMetricKey } from "@/types/admin";
import { PLAN_LABEL, PLAN_USAGE_LABEL } from "@/types/admin";

import { LimitComparisonTable } from "./LimitComparisonTable";
import { PlanCard } from "./PlanCard";
import { PlanSettingsForm } from "./PlanSettingsForm";
import { ResetUsageButton } from "./ResetUsageButton";
import { UpgradePreviewButton } from "./UpgradePreviewButton";
import { UsageProgressBar } from "./UsageProgressBar";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_NEXT = "/admin/billing";
const USAGE_DISPLAY_ORDER: PlanUsageMetricKey[] = [
  "views",
  "scans",
  "ai_pdf_imports",
  "ai_translate_ops",
  "ai_description_ops",
];

function readCookieHeader(): string {
  return cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

function formatPeriodTR(year: number, month: number): string {
  const monthNames = [
    "Ocak",
    "Şubat",
    "Mart",
    "Nisan",
    "Mayıs",
    "Haziran",
    "Temmuz",
    "Ağustos",
    "Eylül",
    "Ekim",
    "Kasım",
    "Aralık",
  ];
  return `${monthNames[month - 1] ?? month} ${year}`;
}

/**
 * /admin/billing — Plan & Limitler (Sprint B2).
 *
 * Layout:
 *   1. Header — title + active-plan badge
 *   2. Section A — `<PlanCard>` + `<PlanSettingsForm>` (edit plan/features/notes)
 *   3. Section B — 5 `<UsageProgressBar>` rows (views/scans/3 AI metrics)
 *   4. Section C — `<LimitComparisonTable>` (4-tier grid)
 *   5. Section D — `<UpgradePreviewButton>` (dropdown + Önizle → modal)
 *   6. Section E — `<ResetUsageButton>` (superuser only, conditional render)
 *
 * All four backend calls (plan / usage / limits / user) are made in
 * parallel from the RSC layer; the page degrades gracefully per-section
 * if any one call fails so a transient backend error doesn't blank the
 * whole screen.
 */
export default async function BillingPage() {
  const cookieHeader = readCookieHeader();

  // 1. Auth — defence-in-depth redirect (parent layout already verified,
  // but a stale cookie could still slip through).
  try {
    await fetchCurrentUser({ internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
      redirect("/login?next=" + DEFAULT_NEXT);
    }
    throw err;
  }

  // 2. Parallel fetch — plan settings, usage, limits, current user (for superuser flag).
  const [planResult, usageResult, limitsResult, userResult] = await Promise.allSettled([
    fetchPlanSettings({ internal: true, cookieHeader }),
    fetchUsage({ internal: true, cookieHeader }),
    fetchLimits({ internal: true, cookieHeader }),
    fetchCurrentUser({ internal: true, cookieHeader }),
  ]);

  const plan = planResult.status === "fulfilled" ? planResult.value : null;
  const usage = usageResult.status === "fulfilled" ? usageResult.value : null;
  const matrix = limitsResult.status === "fulfilled" ? limitsResult.value : null;
  const isSuperuser =
    userResult.status === "fulfilled" ? userResult.value.is_superuser : false;

  const csrfToken = cookies().get("qr_csrftoken")?.value ?? null;

  const fatalError =
    !plan && !matrix && !usage
      ? "Plan, kullanım ve limit verileri hiçbir uçtan alınamadı."
      : null;

  if (fatalError) {
    return (
      <Container size="lg">
        <AdminErrorState
          title="Plan & Limitler yüklenemedi"
          message={fatalError}
          code="admin.billing.fatal_load"
        />
      </Container>
    );
  }

  const activePlanLabel = plan ? PLAN_LABEL[plan.active_plan] : "—";

  return (
    <Container size="lg" as="div" className="flex flex-col gap-6">
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-end gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CreditCard className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Yönetim
            </p>
            <h1 className="font-heading text-2xl font-bold text-text">
              Plan & Limitler
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              İşletmenizin aktif paketini, özellik bayraklarını ve aylık
              kullanım sayaçlarını yönetin.
            </p>
          </div>
        </div>
        {plan ? (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
            <ChevronRight className="h-3 w-3" aria-hidden />
            Aktif plan: {activePlanLabel}
          </span>
        ) : null}
      </header>

      {/* ─── Section A: Active plan + edit form ─────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Banknote className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <CardTitle>Aktif paket & özellikler</CardTitle>
              <CardDescription>
                Plan değişikliği veya tek tek özellik bayrağı override&apos;ı.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        {plan ? (
          <div className="flex flex-col gap-5">
            <PlanCard plan={plan.active_plan} isActive />
            <PlanSettingsForm initial={plan} csrfToken={csrfToken} />
          </div>
        ) : (
          <AdminErrorState
            title="Plan ayarları yüklenemedi"
            message="Plan veya özellik bilgisi alınamadı."
            code="admin.billing.plan"
          />
        )}
      </Card>

      {/* ─── Section B: Usage progress ──────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Gauge className="h-4 w-4" aria-hidden />
            </span>
            <div className="flex-1">
              <CardTitle>Aylık kullanım</CardTitle>
              <CardDescription>
                {usage
                  ? `${formatPeriodTR(usage.period_year, usage.period_month)} dönemi`
                  : "Dönem yüklenemedi"}
                {" "}— sayaçlar her ayın başında sıfırlanır.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        {usage ? (
          <div className="flex flex-col gap-5">
            {USAGE_DISPLAY_ORDER.map((key) => (
              <UsageProgressBar
                key={key}
                label={PLAN_USAGE_LABEL[key]}
                value={usage.metrics[key]}
              />
            ))}
          </div>
        ) : (
          <AdminErrorState
            title="Kullanım verileri yüklenemedi"
            message="Aylık sayaçlar alınamadı."
            code="admin.billing.usage"
          />
        )}
      </Card>

      {/* ─── Section C: Limit comparison ───────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Layers className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <CardTitle>Plan karşılaştırması</CardTitle>
              <CardDescription>
                Dört paketin limit ve özellik kapsamı yan yana.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        {matrix ? (
          <LimitComparisonTable matrix={matrix} />
        ) : (
          <AdminErrorState
            title="Limit matrisi yüklenemedi"
            message="Paket karşılaştırma verileri alınamadı."
            code="admin.billing.limits"
          />
        )}
      </Card>

      {/* ─── Section D: Upgrade preview ────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CreditCard className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <CardTitle>Yükseltme önizleme</CardTitle>
              <CardDescription>
                Hedef paketi seçip özellik ve limit değişikliklerini
                görüntüleyin. Gerçek değişiklik yukarıdaki formla yapılır.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <UpgradePreviewButton csrfToken={csrfToken} />
      </Card>

      {/* ─── Section E: Reset usage (superuser only) ───────────────── */}
      {isSuperuser ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Süper kullanıcı araçları</CardTitle>
              <CardDescription>
                Demo oturumları için aylık sayaçları sıfırlayın. Bu işlem
                geri alınamaz.
              </CardDescription>
            </div>
          </CardHeader>

          <ResetUsageButton csrfToken={csrfToken} />
        </Card>
      ) : null}
    </Container>
  );
}