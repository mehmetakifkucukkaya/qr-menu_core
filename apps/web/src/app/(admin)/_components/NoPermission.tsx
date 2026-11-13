import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { buttonStyles } from "@/components/ui/Button";

interface NoPermissionProps {
  /** Where "Ana sayfaya dön" leads: the signed-in role's own landing page. */
  landingHref: string;
  title?: string;
  message?: string;
  linkLabel?: string;
}

/**
 * Shown in place of a page the signed-in role may not open. The server refuses
 * the same requests (RoleGateMiddleware); this is the polite version, so nobody
 * meets a raw 403 or an empty page.
 */
export function NoPermission({
  landingHref,
  title = "Bu sayfaya yetkiniz yok",
  message = "Hesabınızın rolü bu sayfayı açmaya izin vermiyor. Gerekirse işletme sahibinden yetki isteyin.",
  linkLabel = "Ana sayfaya dön",
}: NoPermissionProps) {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-col items-center rounded-2xl bg-surface-low px-6 py-12 text-center ring-1 ring-border"
    >
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-warning-soft text-warning">
        <ShieldAlert className="h-6 w-6" aria-hidden />
      </span>
      <h1 className="font-heading text-lg font-semibold text-text">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">{message}</p>
      <Link
        href={landingHref}
        className={buttonStyles({ variant: "primary", className: "mt-6" })}
      >
        {linkLabel}
      </Link>
    </div>
  );
}
