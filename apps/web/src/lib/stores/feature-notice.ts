"use client";

/**
 * Feature-notice store — the "this is not in your plan" channel.
 *
 * The backend answers HTTP 403 with `billing.feature_disabled` when the
 * tenant's plan does not carry the module it just asked for (the "Sipariş +
 * mutfak" module, online payment, AI translation, ...). Until now that
 * answer was only ever visible where it happened: a line of text inside the
 * form that triggered it, or — on the kitchen screen — a "connection lost"
 * strip that sent the cook to the wrong problem.
 *
 * This store is the meeting point, the same way `limit-notice` is for the
 * 402 ("your plan is too small"): any write that gets a 403 records the
 * notice here, and the admin shell renders it with a "Yükselt" call to
 * action.
 *
 * Why a store and not a prop: the 403 can be raised by an action on any
 * page and the banner lives in the shell, above the page. A store reaches
 * both without threading a callback through every component.
 *
 * The notice is deliberately *not* persisted: it describes what just
 * happened in this session. A reload starts clean.
 */

import { create } from "zustand";

export interface FeatureNotice {
  /** The flag the plan does not carry ("orders_enabled"). */
  feature: string;
  /** The same flag in Turkish — the server sends it, so the client keeps
   *  no second copy of the flag names and cannot drift from them. */
  featureLabel: string;
  /** The server's own sentence (Turkish). */
  message: string;
  /** When the notice was raised. */
  raisedAt: number;
}

interface FeatureNoticeState {
  notice: FeatureNotice | null;
  /** Record a 403 the API returned. */
  raise: (notice: Omit<FeatureNotice, "raisedAt">) => void;
  /** Dismiss the banner (the operator acknowledged it). */
  dismiss: () => void;
}

export const useFeatureNoticeStore = create<FeatureNoticeState>()((set) => ({
  notice: null,
  raise: (notice) => set({ notice: { ...notice, raisedAt: Date.now() } }),
  dismiss: () => set({ notice: null }),
}));
