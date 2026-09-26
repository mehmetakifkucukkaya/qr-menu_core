import { Download } from "lucide-react";

import { qrDownloadUrl } from "@/lib/api-admin";

interface QrPreviewProps {
  id: number;
  label: string;
  /**
   * Optional caption rendered below the image (e.g. "Masa 4").
   * Falls back to the operator-facing label.
   */
  caption?: string;
}

/**
 * QrPreview — large QR code preview + "PNG indir" button.
 *
 * The PNG lives behind `GET /api/v1/admin/qr-codes/{id}/download` —
 * an authenticated endpoint that returns the bytes inline. We embed it
 * directly via `<img src>` and let the browser handle session cookies
 * (qr_sessionid has SameSite=Lax + same-site on localhost dev). For the
 * download button we use a plain `<a download>` which forces the
 * browser's save dialog.
 *
 * The component itself is server-renderable: it just emits HTML and
 * delegates auth + bytes to the backend endpoint.
 */
export function QrPreview({ id, label, caption }: QrPreviewProps) {
  const url = qrDownloadUrl(id);

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface p-6 shadow-sm">
      <div className="rounded-lg border border-border bg-white p-3">
        {/* `alt` deliberately repeats the label so screen readers don't
            announce a bare "qr code" icon. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`${label} QR kodu`}
          width={280}
          height={280}
          className="h-64 w-64 object-contain"
          loading="eager"
        />
      </div>
      <a
        href={url}
        // Filename hint — matches the backend's Content-Disposition.
        download={`qr-${id}.png`}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
        <Download className="h-4 w-4" />
        PNG indir
      </a>
      <p className="text-xs text-muted">{caption ?? label}</p>
    </div>
  );
}
