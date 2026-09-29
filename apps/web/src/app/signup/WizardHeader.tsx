"use client";

import { StepIndicator } from "@/components/signup/StepIndicator";
import { ProgressBar } from "@/components/signup/ProgressBar";
import { useSignupWizard } from "@/lib/stores/signup-wizard";

/**
 * WizardHeader — client wrapper that pairs the step indicator +
 * progress bar, both of which read `currentStep` from the wizard
 * store. Kept separate from the server shell so the indicator
 * updates instantly when the user advances steps without re-rendering
 * the surrounding card.
 */
export function WizardHeader() {
  const step = useSignupWizard((s) => s.currentStep);
  return (
    <div className="space-y-4 px-1 pt-1">
      <StepIndicator currentStep={step} />
      <ProgressBar currentStep={step} />
    </div>
  );
}