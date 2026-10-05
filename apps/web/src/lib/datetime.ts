/**
 * Date and time for display - always the venue's clock.
 *
 * The server (a Docker container, usually UTC) and a visitor's browser must
 * not decide what "14:30" means on an order ticket: the café does. Every
 * display of a date or time goes through here, with an explicit time zone, so
 * the server render and the browser render agree (no hydration mismatch) and
 * `/admin/orders` stops showing UTC (ANALYSIS: the Next image has no TZ).
 */

export const DISPLAY_TIME_ZONE = "Europe/Istanbul";
const LOCALE = "tr-TR";
const EMPTY = "—";

/** day.month.year hour:minute - the format the admin tables use. */
const STANDARD_DATE_TIME: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

const STANDARD_TIME: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };

function toDate(input: string | number | Date | null | undefined): Date | null {
  if (input === null || input === undefined || input === "") return null;
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * `options` replaces the standard day/month/year hour:minute set; pass `{}` for
 * the browser default (it includes seconds). "—" for a missing or invalid date.
 */
export function formatDateTime(
  input: string | number | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = STANDARD_DATE_TIME,
): string {
  const date = toDate(input);
  if (!date) return EMPTY;
  return date.toLocaleString(LOCALE, { timeZone: DISPLAY_TIME_ZONE, ...options });
}

export function formatDate(
  input: string | number | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const date = toDate(input);
  if (!date) return EMPTY;
  return date.toLocaleDateString(LOCALE, { timeZone: DISPLAY_TIME_ZONE, ...options });
}

export function formatTime(
  input: string | number | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = STANDARD_TIME,
): string {
  const date = toDate(input);
  if (!date) return EMPTY;
  return date.toLocaleTimeString(LOCALE, { timeZone: DISPLAY_TIME_ZONE, ...options });
}
