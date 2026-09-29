"use client";

/**
 * Signup-wizard store — Sprint C2.
 *
 * Zustand store + `persist` middleware backing the 5-step self-serve
 * signup wizard. State survives a full-page reload so a user can
 * leave the tab, come back, and resume where they left off (Step 2+
 * after Step 1's server-side tenant creation, etc.).
 *
 * The store deliberately holds both the Step 1 payload (so we can show
 * a confirmation summary on Step 5) AND the Steps 3-4 inputs the
 * C3 backend endpoints will consume. C2 only ships Step 1 to the
 * server; Steps 3-4 inputs are kept locally so the user doesn't have
 * to re-enter data once C3 lands.
 *
 * `partialize` keeps the cookie tiny: we only persist the fields the
 * user actually typed. Function refs (setters) and `currentStep` are
 * intentionally excluded — the wizard always starts at step 1 on a
 * fresh tab and the user re-clicks forward.
 *
 * `reset()` is the single entry point for "wipe everything" — used by
 * the logout flow in Sprint C3 (and useful in tests).
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type {
  AuthCurrency,
  AuthLocaleCode,
} from "@/lib/api-auth";

/** Step 3 — first category draft (consumed by C3 onboarding/complete/). */
export interface FirstCategoryDraft {
  name: string;
  /** Emoji shortcut — e.g. "☕", "🍕". C3 also accepts a URL. */
  icon: string;
  /** Sort order, default 0. */
  order: number;
}

/** Step 4 — first menu item draft. Price stored as a string so the
 *  user can type "12,50" without losing the trailing zero; the C3
 *  serializer is responsible for parsing. */
export interface FirstItemDraft {
  name: string;
  price: string;
  description: string;
}

export type WizardStep = 1 | 2 | 3 | 4 | 5;

/** Shape of the wizard's persisted user data. */
export interface SignupWizardFormData {
  // Step 1 — submitted to POST /api/v1/auth/signup/.
  email: string;
  password: string;
  full_name: string;
  business_name: string;
  slug: string;

  // Step 2 — locale + currency.
  default_locale: AuthLocaleCode;
  supported_locales: AuthLocaleCode[];
  currency: AuthCurrency;

  // Step 3 — first category (C3 will POST these).
  first_category: FirstCategoryDraft;

  // Step 4 — first menu items (C3 will POST these).
  first_items: FirstItemDraft[];
}

/** Hard cap mirrors the backend SignupSerializer (max 8 supported locales). */
export const MAX_SUPPORTED_LOCALES = 8;

interface SignupWizardState {
  currentStep: WizardStep;
  formData: SignupWizardFormData;

  setStep: (step: WizardStep) => void;
  /** Patch one or more top-level formData fields (shallow merge). */
  updateForm: (patch: Partial<SignupWizardFormData>) => void;
  /** Patch the nested first_category object without losing the rest. */
  updateCategory: (patch: Partial<FirstCategoryDraft>) => void;
  /** Append a blank FirstItemDraft to the end of first_items. */
  addItem: () => void;
  /** Update a single item by index (no-op when out of range). */
  updateItem: (index: number, patch: Partial<FirstItemDraft>) => void;
  /** Remove an item by index. */
  removeItem: (index: number) => void;
  /** Wipe everything — used by logout / "start over" flows. */
  reset: () => void;
}

const DEFAULT_FORM_DATA: SignupWizardFormData = {
  email: "",
  password: "",
  full_name: "",
  business_name: "",
  slug: "",
  default_locale: "tr",
  supported_locales: ["tr", "en"],
  currency: "TRY",
  first_category: { name: "", icon: "🍽️", order: 0 },
  first_items: [{ name: "", price: "", description: "" }],
};

export const useSignupWizard = create<SignupWizardState>()(
  persist(
    (set) => ({
      currentStep: 1,
      formData: DEFAULT_FORM_DATA,

      setStep: (step) => set({ currentStep: step }),

      updateForm: (patch) =>
        set((s) => ({ formData: { ...s.formData, ...patch } })),

      updateCategory: (patch) =>
        set((s) => ({
          formData: {
            ...s.formData,
            first_category: { ...s.formData.first_category, ...patch },
          },
        })),

      addItem: () =>
        set((s) => ({
          formData: {
            ...s.formData,
            first_items: [
              ...s.formData.first_items,
              { name: "", price: "", description: "" },
            ],
          },
        })),

      updateItem: (index, patch) =>
        set((s) => {
          if (index < 0 || index >= s.formData.first_items.length) return s;
          const next = s.formData.first_items.slice();
          next[index] = { ...next[index], ...patch };
          return { formData: { ...s.formData, first_items: next } };
        }),

      removeItem: (index) =>
        set((s) => {
          if (index < 0 || index >= s.formData.first_items.length) return s;
          const next = s.formData.first_items.slice();
          next.splice(index, 1);
          return { formData: { ...s.formData, first_items: next } };
        }),

      reset: () => set({ currentStep: 1, formData: DEFAULT_FORM_DATA }),
    }),
    {
      name: "qr-menu-signup-wizard",
      // Only persist user-typed values; skip transient UI state
      // (currentStep) and function refs (setters).
      partialize: (state) => ({ formData: state.formData }),
    },
  ),
);