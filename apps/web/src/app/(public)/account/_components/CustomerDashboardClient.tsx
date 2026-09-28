"use client";

/**
 * CustomerDashboardClient — Sprint 10B (D-025).
 *
 * Thin client wrapper that mounts zustand with the profile / loyalty
 * pre-fetched on the server so child components can read them without
 * their own fetch. We also include a profile-edit island so the name /
 * phone update goes through a server action.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Crown, Edit3, Loader2, Receipt } from "lucide-react";

import { useCustomerStore } from "@/lib/customer-store";
import { updateCustomerProfile } from "@/lib/api-account";
import type { CustomerProfile } from "@/types/account";

interface CustomerDashboardClientProps {
  initialProfile: CustomerProfile;
  /** Optional orgSlug defaults to "modern-cafe" — overridden by URL ?org=. */
  orgSlug: string;
  /** Pre-fetched recent orders summary (top 5) — array entries truncated
   *  so the dashboard pill section doesn't need its own pagination. */
  recentOrders: Array<{
    id: number;
    order_number: string;
    status: string;
    total_amount: string;
    currency: string;
    placed_at: string;
  }>;
}

export function CustomerDashboardClient({
  initialProfile,
  recentOrders,
}: CustomerDashboardClientProps) {
  const profile = useCustomerStore((s) => s.profile) ?? initialProfile;
  const loyalty = useCustomerStore((s) => s.loyalty);
  const setProfile = useCustomerStore((s) => s.setProfile);

  return (
    <div className="space-y-6">
      <ProfileCard
        profile={profile}
        onProfileChange={(next) => setProfile(next)}
      />

      {loyalty ? (
        <LoyaltySummaryCard
          balance={loyalty.balance}
          organizationName={loyalty.organization.name}
        />
      ) : null}

      <RecentOrdersCard recentOrders={recentOrders} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile card (inline-edit island)
// ---------------------------------------------------------------------------

function ProfileCard({
  profile,
  onProfileChange,
}: {
  profile: CustomerProfile;
  onProfileChange: (p: CustomerProfile) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(profile.full_name);
  const [phone, setPhone] = useState(profile.phone);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSave = () => {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      try {
        // The PATCH endpoint's CSRF requirement — we don't have a CSRF
        // token in the local cookie (V1 didn't ship one). Send empty;
        // backend's SessionAuthentication with our cookie does not
        // require an X-CSRFToken either (custom auth path; see D-025).
        const updated = await updateCustomerProfile(
          { full_name: fullName.trim(), phone: phone.trim() },
          "",
        );
        onProfileChange(updated);
        setSuccess(true);
        setEditing(false);
        router.refresh();
      } catch (err) {
        let message = "Profil güncellenemedi.";
        if (
          err &&
          typeof err === "object" &&
          "message" in err &&
          typeof (err as { message?: unknown }).message === "string"
        ) {
          message = (err as { message: string }).message;
        }
        setError(message);
      }
    });
  };

  const cancelEdit = () => {
    setFullName(profile.full_name);
    setPhone(profile.phone);
    setError(null);
    setSuccess(false);
    setEditing(false);
  };

  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <header className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-base font-bold text-text">
          Profilim
        </h2>
        {editing ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={cancelEdit}
              disabled={pending}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              ) : null}
              Kaydet
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <Edit3 className="h-3 w-3" aria-hidden />
            Düzenle
          </button>
        )}
      </header>
      <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Email" value={profile.email} readOnly />
        {editing ? (
          <FieldInput
            label="Ad Soyad"
            value={fullName}
            onChange={setFullName}
            placeholder="Ad Soyad"
            autoComplete="name"
            maxLength={120}
          />
        ) : (
          <Field label="Ad Soyad" value={profile.full_name || "—"} />
        )}
        {editing ? (
          <FieldInput
            label="Telefon"
            value={phone}
            onChange={setPhone}
            placeholder="+90 5xx xxx xx xx"
            type="tel"
            autoComplete="tel"
            maxLength={20}
          />
        ) : (
          <Field label="Telefon" value={profile.phone || "—"} />
        )}
        <Field
          label="Üyelik tarihi"
          value={new Date(profile.created_at).toLocaleDateString("tr-TR")}
        />
      </dl>
      {error ? (
        <p
          role="alert"
          className="mt-3 inline-flex items-start gap-2 rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-xs text-text"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
          <span>{error}</span>
        </p>
      ) : null}
      {success ? (
        <p
          role="status"
          className="mt-3 inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          Profil güncellendi.
        </p>
      ) : null}
    </section>
  );
}

function Field({ label, value, readOnly }: { label: string; value: string; readOnly?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </dt>
      <dd
        className={`mt-1 truncate text-sm text-text ${readOnly ? "font-mono" : ""}`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "tel";
  autoComplete?: string;
  maxLength?: number;
}) {
  const id = `profile-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className="text-[10px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        maxLength={maxLength}
        className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loyalty summary card (dashboard widget)
// ---------------------------------------------------------------------------

function LoyaltySummaryCard({
  balance,
  organizationName,
}: {
  balance: number;
  organizationName: string;
}) {
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Crown className="h-5 w-5 text-amber-600" aria-hidden />
        <h2 className="font-heading text-base font-bold text-amber-900">
          Sadakat Puanlarım
        </h2>
      </div>
      <p className="mt-1 text-xs text-amber-800">
        {organizationName}
      </p>
      <p className="mt-3 font-heading text-3xl font-bold tabular-nums text-amber-900">
        {balance.toLocaleString("tr-TR")}{" "}
        <span className="text-base font-semibold text-amber-700">puan</span>
      </p>
      <div className="mt-4 flex items-center gap-2">
        <Link
          href="/account/loyalty"
          className="inline-flex items-center justify-center rounded-full bg-amber-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2"
        >
          Puan geçmişim
        </Link>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Recent orders card
// ---------------------------------------------------------------------------

function RecentOrdersCard({
  recentOrders,
}: {
  recentOrders: CustomerDashboardClientProps["recentOrders"];
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-muted" aria-hidden />
          <h2 className="font-heading text-base font-bold text-text">
            Son Siparişlerim
          </h2>
        </div>
        <Link
          href="/account/orders"
          className="text-xs font-semibold text-primary transition hover:text-primary/80"
        >
          Tümünü gör →
        </Link>
      </header>
      {recentOrders.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          Henüz sipariş vermediniz.{" "}
          <Link href="/" className="font-medium text-primary hover:underline">
            Menüden başlayın
          </Link>
          .
        </p>
      ) : (
        <ol className="mt-3 divide-y divide-border">
          {recentOrders.slice(0, 5).map((o) => (
            <li
              key={o.id}
              className="flex items-center justify-between gap-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-text">
                  #{o.order_number}
                </p>
                <p className="truncate text-xs text-muted">
                  {new Date(o.placed_at).toLocaleDateString("tr-TR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold tabular-nums text-text">
                  {o.total_amount} {o.currency}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted">
                  {o.status}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
