export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

export function isValidLocale(locale: string): boolean {
  try {
    return Intl.getCanonicalLocales(locale).length === 1;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

export function currencyFractionDigits(currency: string, locale: string): number {
  const digits = new Intl.NumberFormat(locale, { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
  if (digits === undefined) throw new Error(`Intl reported no fraction digits for ${currency}`);
  return digits;
}

export function currentTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
