import { ExternalLink, LogOut } from "lucide-react";

import { BusinessMark } from "@/components/public/BusinessMark";

/**
 * Pieces shared by the desktop sidebar and the phone navigation drawer, so the
 * two can never drift apart.
 */

interface AdminBrandProps {
  businessName: string;
  businessLogo?: string | null;
}

/** The venue's mark and name, with the "Admin Paneli" caption. */
export function AdminBrand({ businessName, businessLogo }: AdminBrandProps) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <BusinessMark
        name={businessName}
        logo={businessLogo}
        className="h-10 w-10 rounded-xl ring-1 ring-border"
        initialClassName="text-lg"
        loading="eager"
      />
      <div className="min-w-0">
        <p
          className="truncate font-heading text-base font-semibold leading-tight text-text"
          title={businessName}
        >
          {businessName}
        </p>
        <p className="text-xs font-medium text-outline">Admin Paneli</p>
      </div>
    </div>
  );
}

interface AdminAccountLinksProps {
  /** Public menu slug — adds a "view my menu" shortcut when present. */
  businessSlug?: string | null;
  /** Logout form action — server-issued POST. */
  logoutAction: (formData: FormData) => void;
}

const rowClass =
  "flex h-11 w-full items-center gap-3 rounded-xl px-3 text-[0.9375rem] font-medium text-muted " +
  "transition-colors duration-200 hover:bg-surface-low hover:text-text";

/** "View my menu" shortcut and the sign-out button. */
export function AdminAccountLinks({
  businessSlug,
  logoutAction,
}: AdminAccountLinksProps) {
  return (
    <div className="flex flex-col gap-0.5">
      {businessSlug ? (
        <a
          href={`/m/${businessSlug}`}
          target="_blank"
          rel="noopener noreferrer"
          className={rowClass}
        >
          <ExternalLink
            className="h-[1.125rem] w-[1.125rem] shrink-0 text-outline"
            aria-hidden
          />
          <span className="truncate">Menüyü görüntüle</span>
          <span className="sr-only"> (yeni sekmede açılır)</span>
        </a>
      ) : null}
      <form action={logoutAction}>
        <button type="submit" className={rowClass}>
          <LogOut
            className="h-[1.125rem] w-[1.125rem] shrink-0 text-outline"
            aria-hidden
          />
          <span>Çıkış yap</span>
        </button>
      </form>
    </div>
  );
}
