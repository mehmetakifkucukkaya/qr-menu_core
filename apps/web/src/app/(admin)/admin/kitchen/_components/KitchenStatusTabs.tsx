"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { KitchenStatusFilter } from "@/lib/api-admin";

interface KitchenStatusTabsProps {
  counts: Record<KitchenStatusFilter, number>;
}

/**
 * Kitchen status filter tabs — `Pending` / `Confirmed` / `Preparing` / `All`.
 *
 * Tabs drive the `?status=` query param; the page re-renders server-side
 * with the filtered ticket list. Each tab shows a live count badge so the
 * operator can see where work is piling up without opening each list.
 */
export function KitchenStatusTabs({ counts }: KitchenStatusTabsProps) {
  const router = useRouter();
  const params = useSearchParams();
  const active = (params.get("status") ?? "pending") as KitchenStatusFilter;

  const tabs: Array<{ value: KitchenStatusFilter; label: string }> = [
    { value: "pending", label: "Beklemede" },
    { value: "confirmed", label: "Onaylandı" },
    { value: "preparing", label: "Hazırlanıyor" },
    { value: "all", label: "Tümü" },
  ];

  function setStatus(next: KitchenStatusFilter) {
    const url = new URL(window.location.href);
    if (next === "pending") {
      url.searchParams.delete("status");
    } else {
      url.searchParams.set("status", next);
    }
    router.push(url.pathname + (url.search || ""));
  }

  return (
    <div
      role="tablist"
      aria-label="Sipariş durum filtresi"
      className="flex flex-wrap gap-2"
    >
      {tabs.map((t) => {
        const isActive = active === t.value || (t.value === "pending" && active === undefined);
        const count = counts[t.value] ?? 0;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => setStatus(t.value)}
            className={
              isActive
                ? "inline-flex items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-white shadow-sm"
                : "inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-sm text-text hover:border-primary/40"
            }
          >
            {t.label}
            <span
              className={
                isActive
                  ? "rounded-full bg-white/20 px-2 py-0.5 text-xs"
                  : "rounded-full bg-muted/15 px-2 py-0.5 text-xs text-muted"
              }
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
