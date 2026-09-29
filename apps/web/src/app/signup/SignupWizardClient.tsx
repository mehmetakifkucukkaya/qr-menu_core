"use client";

import { useSignupWizard } from "@/lib/stores/signup-wizard";

import { Step1BusinessInfo } from "@/components/signup/Step1BusinessInfo";
import { Step2LocaleCurrency } from "@/components/signup/Step2LocaleCurrency";
import { Step3FirstCategory } from "@/components/signup/Step3FirstCategory";
import { Step4FirstItems } from "@/components/signup/Step4FirstItems";
import { Step5SuccessQR } from "@/components/signup/Step5SuccessQR";

/**
 * SignupWizardClient — Sprint C2.
 *
 * Thin client wrapper that reads `currentStep` from the wizard store
 * and renders the matching step component. Lives apart from the
 * server shell so cookies + redirect stay on the server side and
 * only this branch hydrates.
 */

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
      return <Step5SuccessQR />;
    default:
      return <Step1BusinessInfo />;
  }
}