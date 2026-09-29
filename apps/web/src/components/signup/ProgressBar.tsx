"use client";

import clsx from "clsx";

import type { WizardStep } from "@/lib/stores/signup-wizard";

/**
 * ProgressBar — thin horizontal bar above the active step body that
 * fills proportionally as the wizard advances.
 *
 * Width is `currentStep / 5 * 100%`. On the final step (5) we render
 * a fully filled bar in the success colour to signal "you made it".
 */

const TOTAL_STEPS = 5;

interface ProgressBarProps {
  currentStep: WizardStep;
  className?: string;
}

export function ProgressBar({ currentStep, className }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (currentStep / TOTAL_STEPS) * 100));

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={`Adım ${currentStep} / ${TOTAL_STEPS}`}
      className={clsx("h-1.5 w-full overflow-hidden rounded-full bg-border", className)}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}