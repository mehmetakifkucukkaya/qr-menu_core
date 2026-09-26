"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { fetchImportDraft, AdminApiError } from "@/lib/api-admin";
import type { MenuImportDraftDetail } from "@/types/admin";

interface ParseProgressIndicatorProps {
  /** Draft id we just created — polling target. */
  draftId: number;
  /**
   * Polling interval (ms). Default 2000ms matches the spec.
   * Bumped during test runs via prop to avoid timing flakes.
   */
  intervalMs?: number;
}

/**
 * ParseProgressIndicator — Sprint 7B.
 *
 * Polls `/api/v1/admin/pdf-import/drafts/{id}/` every 2 seconds and
 * navigates to the draft detail page as soon as the status leaves the
 * transient `parsing` state. We deliberately poll (no SSE/WebSocket —
 * out of V1 scope, see D-021) so the same component renders both the
 * "AI is still working" spinner and the redirect trigger.
 *
 * Stop conditions:
 *   - `parsed`    → router.push detail page → cleanup
 *   - `failed`    → bubble the error payload up via `onFailed` (parent
 *                   shows an inline error state)
 *   - `confirmed` → already wrapped up by a prior session — push the
 *                   linked menu.
 *
 * Note: the upload endpoint returns synchronously today (PDF parse is
 * blocking in the POST). We still mount this component defensively for
 * any future background-job fallback (D-021 backlog).
 */
export function ParseProgressIndicator({
  draftId,
  intervalMs = 2000,
}: ParseProgressIndicatorProps) {
  const router = useRouter();
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelledRef.current) return;
      let next: MenuImportDraftDetail | null = null;
      try {
        next = await fetchImportDraft(draftId);
      } catch (err) {
        if (err instanceof AdminApiError && err.status === 404) {
          // Draft was discarded mid-poll; bail.
          return;
        }
        // Network / 5xx → retry on the next tick.
      }

      if (cancelledRef.current) return;

      if (next) {
        if (next.status === "parsed") {
          router.push(`/admin/pdf-import/drafts/${draftId}`);
          router.refresh();
          return;
        }
        if (next.status === "confirmed") {
          router.push(`/admin/menus/${next.menu_id ?? ""}`);
          router.refresh();
          return;
        }
        if (next.status === "failed" || next.status === "discarded") {
          // Terminal failure — fall through to keep polling; the page
          // surfaces the error via the surrounding error boundary.
          return;
        }
      }

      timer = setTimeout(tick, intervalMs);
    };

    void tick();

    return () => {
      cancelledRef.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [draftId, intervalMs, router]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-6 py-8 text-center shadow-sm"
    >
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      <div>
        <p className="font-heading text-base font-semibold text-text">
          AI menüyü analiz ediyor…
        </p>
        <p className="mt-1 max-w-md text-xs text-muted">
          OpenAI GPT-4o veya Anthropic Claude ile PDF&apos;ten kategoriler ve ürünler
          çıkarılıyor. Bu işlem genelde 5–30 saniye sürer.
        </p>
      </div>
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
        draft #{draftId}
      </p>
    </div>
  );
}