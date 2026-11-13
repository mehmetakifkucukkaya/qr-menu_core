"use client";

/**
 * Limit-notice store — the "you ran out of something" channel.
 *
 * The backend answers HTTP 402 (`billing.limit_exceeded`) when a tenant
 * is at one of its tier caps: too many menu items, too many languages,
 * the monthly AI allowance spent, the monthly traffic cap reached. Until
 * now that answer was only visible as a line of text inside whichever
 * form happened to trigger it — and on the analytics page it replaced
 * the whole dashboard with a generic error. The operator saw "something
 * went wrong" instead of "your plan is too small, here is what to do".
 *
 * This store is the meeting point: any client-side write that gets a
 * 402 records the notice here, and the admin shell renders it as a
 * banner with a "Yükselt" call to action — the same visual language as
 * the existing `UpgradeBanner`, but for a limit that has actually been
 * reached (as opposed to a feature that is not in the plan yet).
 *
 * Why a store and not a prop: the 402 can be raised by a write on any
 * page (a product form, the theme page, the language setting) and the
 * banner lives in the shell, above the page. A store reaches both
 * without threading a callback through every component.
 *
 * The notice is deliberately *not* persisted: it describes what just
 * happened in this session. A reload starts clean.
 */

import { create } from "zustand";

/** The limit resources the backend knows about (mirrors billing/constants.py). */
export type LimitResource =
  | "items"
  | "categories"
  | "branches"
  | "locales"
  | "monthly_views"
  | "monthly_scans"
  | "ai_pdf_imports"
  | "ai_translate_ops"
  | "ai_description_ops";

export interface LimitNotice {
  /** Which cap was reached. */
  resource: LimitResource | string;
  /** How much the tenant has used. */
  current: number | null;
  /** The cap for the tenant's plan. */
  limit: number | null;
  /** The server's own message (Turkish). */
  message: string;
  /** When the notice was raised — for the "just now" copy. */
  raisedAt: number;
}

interface LimitNoticeState {
  notice: LimitNotice | null;
  /** Record a 402 the API returned. */
  raise: (notice: Omit<LimitNotice, "raisedAt">) => void;
  /** Dismiss the banner (the operator acknowledged it). */
  dismiss: () => void;
}

export const useLimitNoticeStore = create<LimitNoticeState>()((set) => ({
  notice: null,
  raise: (notice) => set({ notice: { ...notice, raisedAt: Date.now() } }),
  dismiss: () => set({ notice: null }),
}));

/**
 * Human labels for the limits — the raw resource name ("ai_translate_ops")
 * means nothing to an operator.
 */
export const LIMIT_LABEL: Record<string, string> = {
  items: "Ürün",
  categories: "Kategori",
  branches: "Şube",
  locales: "Dil",
  monthly_views: "Aylık menü görüntülenmesi",
  monthly_scans: "Aylık QR tarama",
  ai_pdf_imports: "Aylık PDF içe aktarma",
  ai_translate_ops: "Aylık çeviri",
  ai_description_ops: "Aylık açıklama üretimi",
};

/** The label for a resource, falling back to the raw name. */
export function limitLabel(resource: string): string {
  return LIMIT_LABEL[resource] ?? resource;
}
