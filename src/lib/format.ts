import { parseCalendarDate } from "./dates.js";

export function formatCurrency(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

/** Wrap a value for CSV: double-quote the field and escape embedded quotes by doubling them. */
export function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function formatDate(dateString: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parseCalendarDate(dateString));
}
