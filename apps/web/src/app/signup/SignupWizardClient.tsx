"use client";

import { useSignupWizard } from "@/lib/stores/signup-wizard";

/**
 * SignupWizardClient — Sprint C2.
 *
 * Thin client wrapper that reads `currentStep` from the wizard store
 * and renders the matching step component. Lives apart from the
 * server shell so cookies + redirect stay on the server side and
 * only this branch hydrates.
 *
 * Each case returns a small inline placeholder while the matching
 * step component lands in commits C2.4 / C2.5 / C2.6 — once all five
 * real components exist, the placeholders are swapped for imports.
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
      // Real component lands in Sprint C2.4 — Step1BusinessInfo.
      return <StepPlaceholder number={1} title="İşletme bilgileri" />;
    case 2:
      // Real component lands in Sprint C2.5 — Step2LocaleCurrency.
      return <StepPlaceholder number={2} title="Dil ve para birimi" />;
    case 3:
      // Real component lands in Sprint C2.5 — Step3FirstCategory.
      return <StepPlaceholder number={3} title="İlk kategori" />;
    case 4:
      // Real component lands in Sprint C2.5 — Step4FirstItems.
      return <StepPlaceholder number={4} title="İlk ürünler" />;
    case 5:
      // Real component lands in Sprint C2.6 — Step5SuccessQR.
      return <StepPlaceholder number={5} title="Hazır!" />;
    default:
      return <StepPlaceholder number={1} title="İşletme bilgileri" />;
  }
}