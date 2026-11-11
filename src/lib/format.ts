import { parseCalendarDate } from "./dates.js";

/** Wraps a value in double quotes and ``-escapes embedded quotes for CSV (RFC 4180). */
export function escapeCsvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function formatCurrency(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateString: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parseCalendarDate(dateString));
}
