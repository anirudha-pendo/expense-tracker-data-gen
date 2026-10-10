export const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

// A bare YYYY-MM-DD is a calendar day; new Date() would read it as UTC midnight.
export function parseCalendarDate(value: string): Date {
  const match = ISO_DATE_PATTERN.exec(value);
  if (match === null) return new Date(value);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function localIsoDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// The calendar month `offset` months from the month of `isoDay` (a valid YYYY-MM-DD), first and last day.
export function monthRange(isoDay: string, offset: number): { from: string; to: string } {
  const [year, month] = isoDay.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + offset, 1));
  const last = new Date(Date.UTC(year, month + offset, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

export function isInMonth(dateString: string, monthOf: Date): boolean {
  return localIsoDate(parseCalendarDate(dateString)).slice(0, 7) === localIsoDate(monthOf).slice(0, 7);
}

function utcDay(value: string): number | null {
  const match = ISO_DATE_PATTERN.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const time = Date.UTC(year, month - 1, day);
  const check = new Date(time);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return time;
}

export function isIsoDate(value: string): boolean {
  return utcDay(value) !== null;
}

// Both arguments must already satisfy isIsoDate.
export function daysInclusive(from: string, to: string): number {
  const start = utcDay(from);
  const end = utcDay(to);
  if (start === null || end === null) throw new Error("daysInclusive needs valid YYYY-MM-DD dates");
  return Math.round((end - start) / DAY_MS) + 1;
}
