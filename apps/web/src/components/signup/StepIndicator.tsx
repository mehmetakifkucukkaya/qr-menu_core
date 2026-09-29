"use client";

import { Check } from "lucide-react";
import clsx from "clsx";

import type { WizardStep } from "@/lib/stores/signup-wizard";

/**
 * StepIndicator — Sprint 12A-style visual breadcrumb for the 5-step
 * self-serve wizard. Completed steps render a green check, the
 * current step a blue dot, and pending steps a muted outline number.
 *
 * Pure presentational — no state, no handlers. The parent wizard
 * page reads `currentStep` from the zustand store and passes it
 * down; the indicator renders accordingly.
 */

interface Step {
  number: WizardStep;
  label: string;
}

const STEPS: readonly Step[] = [
  { number: 1, label: "İşletme" },
  { number: 2, label: "Dil / Para" },
  { number: 3, label: "Kategori" },
  { number: 4, label: "Ürünler" },
  { number: 5, label: "Hazır" },
] as const;

interface StepIndicatorProps {
  currentStep: WizardStep;
  /** When true, every step up to and including currentStep renders as
   *  completed (used by Step 5 where the whole flow is done). */
  allComplete?: boolean;
}

export function StepIndicator({ currentStep, allComplete = false }: StepIndicatorProps) {
  return (
    <ol
      aria-label="Kayıt adımları"
      className="flex w-full items-center justify-between gap-1 sm:gap-2"
    >
      {STEPS.map((step, index) => {
        const isCompleted = allComplete || step.number < currentStep;
        const isCurrent = !allComplete && step.number === currentStep;
        const isLast = index === STEPS.length - 1;

        return (
          <li
            key={step.number}
            className="flex flex-1 items-center"
            aria-current={isCurrent ? "step" : undefined}
          >
            <div className="flex flex-col items-center gap-1.5">
              <div
                aria-hidden
                className={clsx(
                  "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  isCompleted && "bg-primary text-primary-foreground",
                  isCurrent &&
                    "border-2 border-primary bg-surface text-primary",
                  !isCompleted &&
                    !isCurrent &&
                    "border border-border bg-surface text-muted",
                )}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" strokeWidth={3} />
                ) : (
                  step.number
                )}
              </div>
              <span
                className={clsx(
                  "hidden text-[11px] font-medium sm:block",
                  isCurrent ? "text-primary" : "text-muted",
                  isCompleted && "text-text",
                )}
              >
                {step.label}
              </span>
            </div>
            {!isLast ? (
              <div
                aria-hidden
                className={clsx(
                  "mx-1 h-px flex-1 sm:mx-2",
                  isCompleted ? "bg-primary" : "bg-border",
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}