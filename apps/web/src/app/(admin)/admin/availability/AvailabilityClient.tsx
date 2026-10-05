"use client";

import { useState } from "react";
import clsx from "clsx";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { setItemAvailability } from "@/lib/api-admin";
import { formatPrice } from "@/lib/format";

export interface AvailabilityItem {
  id: number;
  name: string;
  price: string;
  currency: string;
  isAvailable: boolean;
}

export interface AvailabilityGroup {
  categoryId: number;
  categoryName: string;
  items: AvailabilityItem[];
}

interface AvailabilityClientProps {
  groups: AvailabilityGroup[];
  csrfToken: string | null;
}

/** One toggle per dish. The change is optimistic-free: the row flips when the server confirms. */
export function AvailabilityClient({ groups: initialGroups, csrfToken }: AvailabilityClientProps) {
  const [groups, setGroups] = useState(initialGroups);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (item: AvailabilityItem) => {
    if (!csrfToken) {
      setError("Oturum bilgisi eksik. Sayfayı yenileyin.");
      return;
    }
    setError(null);
    setBusyId(item.id);
    try {
      const result = await setItemAvailability(item.id, !item.isAvailable, { csrfToken });
      setGroups((prev) =>
        prev.map((group) => ({
          ...group,
          items: group.items.map((it) =>
            it.id === item.id ? { ...it, isAvailable: result.is_available } : it,
          ),
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ürün durumu değiştirilemedi.");
    } finally {
      setBusyId(null);
    }
  };

  if (groups.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border-strong bg-surface-low px-4 py-8 text-center text-sm text-muted">
        Menüde henüz ürün yok.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {error ? (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {error}
        </div>
      ) : null}

      {groups.map((group) => (
        <section key={group.categoryId} aria-label={group.categoryName}>
          <h2 className="mb-2 px-1 font-heading text-base font-semibold text-text">{group.categoryName}</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
            {group.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className={clsx("truncate text-sm font-medium", item.isAvailable ? "text-text" : "text-muted line-through")}>
                    {item.name}
                  </p>
                  <p className="text-xs text-muted">{formatPrice(item.price, item.currency)}</p>
                </div>
                <Badge tone={item.isAvailable ? "success" : "danger"}>
                  {item.isAvailable ? "Mevcut" : "Tükendi"}
                </Badge>
                <Button
                  size="sm"
                  variant={item.isAvailable ? "danger-soft" : "soft"}
                  loading={busyId === item.id}
                  onClick={() => toggle(item)}
                  aria-label={`${item.name}: ${item.isAvailable ? "tükendi yap" : "mevcut yap"}`}
                >
                  {item.isAvailable ? "Tükendi yap" : "Mevcut yap"}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
