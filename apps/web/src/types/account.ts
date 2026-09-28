/**
 * Customer-account TypeScript contracts — Sprint 10B (D-025 consumer).
 *
 * Mirrors the backend serializers in
 *  - apps.account.serializers.MagicLinkRequestSerializer
 *  - apps.account.serializers.CustomerProfileSerializer /
 *    CustomerProfileUpdateSerializer
 *  - apps.account.serializers.LoyaltyTransactionSerializer
 *  - apps.account.serializers.PublicLoyaltySettingsSerializer
 *  - apps.account.views.CustomerOrderHistoryView results
 *  - apps.account.views.CustomerLoyaltyView envelope
 *
 * Anything the frontend shows / sends to the customer account endpoints
 * must declare its shape here first.
 */

export interface CustomerProfile {
  id: number;
  email: string;
  /** Customer-chosen display name. May be empty. */
  full_name: string;
  /** Free-text phone, validated by the backend (lenient — at least 7 digits). */
  phone: string;
  /** ISO-8601 datetime. */
  created_at: string;
  /** ISO-8601 datetime, or null if the customer hasn't logged in yet. */
  last_login_at: string | null;
}

/** PATCH /api/v1/account/me body — partial. */
export interface CustomerProfileUpdate {
  full_name?: string;
  phone?: string;
}

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "delivered"
  | "cancelled";

/** Per-order line item returned by /me/orders. */
export interface CustomerOrderHistoryItem {
  id: number;
  order_number: string;
  organization_slug: string;
  organization_name: string;
  branch_name: string | null;
  status: OrderStatus;
  table_number: string;
  total_amount: string;
  currency: string;
  placed_at: string;
  delivered_at: string | null;
  items: Array<{ name: string; quantity: number; price: string }>;
}

export interface CustomerOrderHistoryResult {
  count: number;
  next: string | null;
  previous: string | null;
  results: CustomerOrderHistoryItem[];
}

/** One row in the loyalty ledger. */
export interface LoyaltyTransaction {
  id: number;
  type: "earn" | "redeem" | "expire" | "adjust" | "reverse";
  /** Signed integer — earn/reverse positive, redeem/expire/adjust-down negative. */
  points: number;
  /** Order PK when the txn is tied to an order, null otherwise. */
  order: number | null;
  note: string;
  created_at: string;
}

/** Public-facing loyalty settings (banner için) — no admin-only fields. */
export interface PublicLoyaltySettings {
  is_enabled: boolean;
  /** Decimal-as-string (e.g. "1.00") — 1 currency unit = X points. */
  points_per_currency_unit: string;
  /** Decimal-as-string — 1 puan = X TL indirim. */
  redemption_rate: string;
  min_points_to_redeem: number;
}

/** Envelope returned by /me/loyalty. */
export interface CustomerLoyaltySummary {
  organization: { id: number; slug: string; name: string };
  /** Computed `Sum(points)` over the customer's txns at this org. */
  balance: number;
  transactions: LoyaltyTransaction[];
}

export interface MagicLinkRequestResponse {
  ok: true;
}

export interface MagicLinkVerifyResponse {
  customer_id: number;
  session_ttl_seconds: number;
}

export interface LogoutResponse {
  ok: true;
}
