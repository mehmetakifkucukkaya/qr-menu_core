import { redirect } from "next/navigation";

/**
 * Root landing — for the V1 demo we deep-link straight into the seeded
 * Modern Cafe menu. Once the QR generation flow lands in Sprint 5, this
 * page will become a tenant picker / marketing landing.
 */
export default function HomePage(): never {
  redirect("/m/modern-cafe");
}
