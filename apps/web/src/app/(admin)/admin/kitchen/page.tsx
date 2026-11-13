import { cookies } from "next/headers";

import { fetchKitchenBoard } from "@/lib/api-admin";
import type { KitchenBoard as KitchenBoardData } from "@/lib/kitchen-board";

import { KitchenBoard } from "./_components/KitchenBoard";

// The page reads cookies on every render: never prerender it at build time.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * /admin/kitchen - the kitchen screen. The server draws the first board so the
 * tablet shows orders at once; from then on `KitchenBoard` keeps itself fresh
 * with a poll of its own (see SPEC_PILOT_READINESS 5.5).
 */
export default async function KitchenPage() {
  const jar = cookies();
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const csrfToken = jar.get("qr_csrftoken")?.value ?? null;

  let initialBoard: KitchenBoardData | null = null;
  try {
    initialBoard = await fetchKitchenBoard({ internal: true, cookieHeader });
  } catch {
    // The board polls by itself and says "Bağlantı yok" until a poll gets through.
  }

  return <KitchenBoard initialBoard={initialBoard} csrfToken={csrfToken} />;
}
