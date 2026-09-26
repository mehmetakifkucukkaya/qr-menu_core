import { formatPrice } from "@/lib/format";

interface PriceTagProps {
  price: string | number;
  currency: string;
  /** Display size: sm matches ItemCard body, lg emphasizes. */
  size?: "sm" | "lg";
  /** Optional strike-through comparison price (compare_at_price). */
  compareAtPrice?: string | number | null;
}

/**
 * PriceTag — formatted price label (Intl.NumberFormat under the hood).
 *
 * Falls back to a plain string for currencies Intl doesn't recognize
 * (see lib/format.ts).
 */
export function PriceTag({
  price,
  currency,
  size = "sm",
  compareAtPrice = null,
}: PriceTagProps) {
  const sizeClass =
    size === "lg"
      ? "font-heading text-xl font-bold text-primary sm:text-2xl"
      : "font-heading text-base font-bold text-primary sm:text-lg";

  const hasStrike =
    compareAtPrice !== null &&
    compareAtPrice !== undefined &&
    compareAtPrice !== "" &&
    Number(compareAtPrice) > Number(price);

  return (
    <span className="inline-flex items-baseline gap-2">
      {hasStrike ? (
        <span className="text-xs text-muted line-through">
          {formatPrice(compareAtPrice, currency)}
        </span>
      ) : null}
      <span className={sizeClass}>{formatPrice(price, currency)}</span>
    </span>
  );
}