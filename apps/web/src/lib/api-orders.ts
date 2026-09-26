/**
 * Public orders API client — Sprint 8B.
 *
 * Wraps the unauthenticated endpoints added in Sprint 8A:
 *   - POST /api/v1/public/orders                (place order)
 *   - GET  /api/v1/public/orders/{number}/status (poll status)
 *
 * No CSRF, no credentials — these endpoints are open by design and
 * throttled (20/min/IP on POST). Failures throw `OrdersApiError` so the
 * UI can branch on `status` / `code` (e.g. unavailable item).
 *
 * Server components don't need this — they talk to admin endpoints via
 * `lib/api-admin.ts`. These wrappers are 100% client-side.
 */

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "delivered"
  | "cancelled";

export interface CreateOrderPayload {
  organization_slug: string;
  branch_slug?: string;
  table_number?: string;
  customer_name: string;
  customer_phone: string;
  notes?: string;
  items: Array<{
    menu_item_id: number;
    quantity: number;
    notes?: string;
  }>;
}

export interface CreateOrderResponse {
  order_number: string;
  status: OrderStatus;
  total_amount: string;
  currency: string;
  placed_at: string;
}

export interface OrderStatusResponse {
  order_number: string;
  status: OrderStatus;
  placed_at: string;
  confirmed_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
}

/** Thrown by the public-order helpers so callers can branch on status. */
export class OrdersApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "OrdersApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function resolveBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"
  ).replace(/\/+$/, "");
}

interface ApiEnvelope<T> {
  data: T;
  meta?: { request_id?: string };
}

interface ApiErrorEnvelope {
  error: { code: string; message: string; details?: Record<string, unknown> };
  meta?: { request_id?: string };
}

/**
 * POST /api/v1/public/orders — place a customer order.
 *
 * Returns the order number + total as computed by the server. Throws
 * `OrdersApiError` on 4xx (validation, unavailable item, throttle, …).
 */
export async function createOrder(
  payload: CreateOrderPayload,
): Promise<CreateOrderResponse> {
  const base = resolveBaseUrl();
  const url = `${base}/api/v1/public/orders/`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      credentials: "omit",
      cache: "no-store",
    });
  } catch (err) {
    throw new OrdersApiError(
      0,
      "network.error",
      err instanceof Error ? err.message : "Ağ hatası",
    );
  }

  if (!res.ok) {
    let body: ApiErrorEnvelope | null = null;
    try {
      body = (await res.json()) as ApiErrorEnvelope;
    } catch {
      /* fall through with generic message */
    }
    throw new OrdersApiError(
      res.status,
      body?.error?.code ?? "unknown",
      body?.error?.message ?? `Beklenmeyen hata (HTTP ${res.status})`,
      body?.error?.details,
    );
  }

  const envelope = (await res.json()) as ApiEnvelope<CreateOrderResponse>;
  return envelope.data;
}

/**
 * GET /api/v1/public/orders/{order_number}/status — poll the lifecycle.
 *
 * Customer confirmation page calls this every 15 s. Returns the order
 * snapshot (status + milestone timestamps). Throws on 404 / network.
 */
export async function fetchOrderStatus(
  orderNumber: string,
): Promise<OrderStatusResponse> {
  const base = resolveBaseUrl();
  const url = `${base}/api/v1/public/orders/${encodeURIComponent(
    orderNumber,
  )}/status/`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "omit",
      cache: "no-store",
    });
  } catch (err) {
    throw new OrdersApiError(
      0,
      "network.error",
      err instanceof Error ? err.message : "Ağ hatası",
    );
  }

  if (!res.ok) {
    let body: ApiErrorEnvelope | null = null;
    try {
      body = (await res.json()) as ApiErrorEnvelope;
    } catch {
      /* fall through */
    }
    throw new OrdersApiError(
      res.status,
      body?.error?.code ?? "unknown",
      body?.error?.message ?? `Beklenmeyen hata (HTTP ${res.status})`,
      body?.error?.details,
    );
  }

  const envelope = (await res.json()) as ApiEnvelope<OrderStatusResponse>;
  return envelope.data;
}