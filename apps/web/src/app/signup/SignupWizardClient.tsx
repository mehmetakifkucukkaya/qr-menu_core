"use client";

import { useSignupWizard } from "@/lib/stores/signup-wizard";

import { Step1BusinessInfo } from "@/components/signup/Step1BusinessInfo";
import { Step2LocaleCurrency } from "@/components/signup/Step2LocaleCurrency";
import { Step3FirstCategory } from "@/components/signup/Step3FirstCategory";
import { Step4FirstItems } from "@/components/signup/Step4FirstItems";

/**
 * SignupWizardClient — Sprint C2.
 *
 * Thin client wrapper that reads `currentStep` from the wizard store
 * and renders the matching step component. Lives apart from the
 * server shell so cookies + redirect stay on the server side and
 * only this branch hydrates.
 *
 * Step 5 still returns a placeholder — it lands in the next commit
 * along with the success/QR confirmation screen.
 */

function StepPlaceholder({ number, title }: { number: number; title: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-background/40 p-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        Adım {number} / 5
      </p>
      <p className="mt-2 font-heading text-lg font-semibold text-text">{title}</p>
      <p className="mt-1 text-sm text-muted">
        Bu adım bir sonraki commit&apos;te gelecek.
      </p>
    </div>
  );
}

export function SignupWizardClient() {
  const currentStep = useSignupWizard((s) => s.currentStep);

  switch (currentStep) {
    case 1:
      return <Step1BusinessInfo />;
    case 2:
      return <Step2LocaleCurrency />;
    case 3:
      return <Step3FirstCategory />;
    case 4:
      return <Step4FirstItems />;
    case 5:
      // Real component lands in Sprint C2.6 — Step5SuccessQR.
      return <StepPlaceholder number={5} title="Hazır!" />;
    default:
      return <Step1BusinessInfo />;
  }
}