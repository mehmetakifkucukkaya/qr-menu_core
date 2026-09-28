"use client";

/**
 * CustomerHydrator — Sprint 10B (D-025).
 *
 * Mounts inside the dashboard and lands the server-fetched profile +
 * loyalty into the zustand store. Client children then read via
 * selectors without doing their own fetch.
 */

import { useEffect } from "react";

import { useCustomerStore } from "@/lib/customer-store";
import type {
  CustomerLoyaltySummary,
  CustomerProfile,
} from "@/types/account";

interface CustomerHydratorProps {
  profile: CustomerProfile;
  loyalty: CustomerLoyaltySummary | null;
}

export function CustomerHydrator({ profile, loyalty }: CustomerHydratorProps) {
  const hydrate = useCustomerStore((s) => s.hydrate);
  useEffect(() => {
    hydrate({ profile, loyalty });
  }, [hydrate, profile, loyalty]);
  return null;
}
