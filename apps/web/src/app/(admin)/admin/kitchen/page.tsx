import { cookies } from "next/headers";

import { fetchKitchenBoard, isPlanBlocked } from "@/lib/api-admin";
import type { KitchenBoard as KitchenBoardData } from "@/lib/kitchen-board";

import { KitchenBoard } from "./_components/KitchenBoard";
import { PlanBlockedNotice } from "./_components/PlanBlockedNotice";

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
  let planBlocked = false;
  let planMessage = "";
  try {
    initialBoard = await fetchKitchenBoard({ internal: true, cookieHeader });
  } catch (error) {
    if (isPlanBlocked(error)) {
      // The plan does not carry the "Sipariş + mutfak" module. Say that,
      // instead of letting the screen blame the connection.
      planBlocked = true;
      planMessage = error instanceof Error ? error.message : "";
    }
    // Otherwise the board polls by itself and says "Bağlantı yok" until a
    // poll gets through.
  }

  if (planBlocked) {
    return <PlanBlockedNotice message={planMessage || undefined} />;
  }

  return <KitchenBoard initialBoard={initialBoard} csrfToken={csrfToken} />;
}
