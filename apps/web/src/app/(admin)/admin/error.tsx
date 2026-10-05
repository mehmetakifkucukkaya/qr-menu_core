"use client";

import { AdminErrorScreen } from "../_components/AdminErrorScreen";

/**
 * Page-level boundary: a page that fails to load shows this INSIDE the admin
 * shell (menu and header stay usable) instead of Next's raw error page.
 */
export default function AdminPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <AdminErrorScreen error={error} reset={reset} />;
}
