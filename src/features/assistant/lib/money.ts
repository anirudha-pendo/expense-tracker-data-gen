import { formatCurrency } from "../../../lib/format.js";
import { currencyFractionDigits } from "./intl.js";

export interface MoneyFormat {
  currency: string;
  locale: string;
}

// toPrecision(15) strips binary noise such as 1.005 * 100 = 100.49999999999999.
export function toMinorUnits(amount: number, digits: number): number {
  return Math.round(Number((amount * 10 ** digits).toPrecision(15)));
}

export function fromMinorUnits(minor: number, digits: number): number {
  return minor / 10 ** digits;
}

export function roundToCurrency(amount: number, money: MoneyFormat): number {
  const digits = currencyFractionDigits(money.currency, money.locale);
  return fromMinorUnits(toMinorUnits(amount, digits), digits);
}

export function sumAmounts(amounts: readonly number[], money: MoneyFormat): number {
  const digits = currencyFractionDigits(money.currency, money.locale);
  return fromMinorUnits(
    amounts.reduce((sum, a) => sum + toMinorUnits(a, digits), 0),
    digits,
  );
}

export function formatMoney(amount: number, money: MoneyFormat): string {
  return formatCurrency(amount, money.currency, money.locale);
}
