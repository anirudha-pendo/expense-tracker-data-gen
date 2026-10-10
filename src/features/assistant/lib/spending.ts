import type { Category, Transaction, TransactionType } from "../../../types/index.js";
import { daysInclusive, isIsoDate } from "../../../lib/dates.js";
import { formatDate } from "../../../lib/format.js";
import { ASSISTANT_LIMITS } from "../contract/limits.js";
import type {
  FindTransactionsInput,
  FindTransactionsOutput,
  FoundTransaction,
  GetSpendingSummaryInput,
  GetSpendingSummaryOutput,
  SpendingRow,
} from "../contract/types.js";
import { findCategory, scopeAllows, scopeError, unknownCategoryError, type Validation } from "./categories.js";
import { formatMoney, roundToCurrency, sumAmounts, type MoneyFormat } from "./money.js";

interface ComputeArgs<I> {
  input: I;
  transactions: readonly Transaction[];
  categories: readonly Category[];
  workspaceId: string;
  money: MoneyFormat;
}

const day = (tx: Transaction): string => tx.date.slice(0, 10);

function checkRange(from: string | undefined, to: string | undefined): string | null {
  if (from !== undefined && !isIsoDate(from)) return `"${from}" is not a real date. Use YYYY-MM-DD.`;
  if (to !== undefined && !isIsoDate(to)) return `"${to}" is not a real date. Use YYYY-MM-DD.`;
  if (from !== undefined && to !== undefined) {
    if (to < from) return "The end date must be on or after the start date.";
    if (daysInclusive(from, to) > ASSISTANT_LIMITS.maxSpanDays) {
      return `The period can be at most ${ASSISTANT_LIMITS.maxSpanDays} days.`;
    }
  }
  return null;
}

function resolveCategoryFilter(
  name: string | undefined,
  type: TransactionType | undefined,
  categories: readonly Category[],
): Validation<Category | null> {
  if (name === undefined) return { ok: true, value: null };
  const category = findCategory(categories, name);
  if (category === undefined) return { ok: false, error: unknownCategoryError(name, categories, type) };
  if (type !== undefined && !scopeAllows(category, type)) {
    return { ok: false, error: scopeError(category, type, categories) };
  }
  return { ok: true, value: category };
}

export function summarizeSpending(args: ComputeArgs<GetSpendingSummaryInput>): Validation<GetSpendingSummaryOutput> {
  const { input, transactions, categories, workspaceId, money } = args;
  const type = input.type ?? "expense";
  const rangeError = checkRange(input.from, input.to);
  if (rangeError !== null) return { ok: false, error: rangeError };
  const filter = resolveCategoryFilter(input.categoryName, type, categories);
  if (!filter.ok) return filter;

  const names = new Map(categories.map((c) => [c.id, c.name]));
  const groups = new Map<string, number[]>();
  const matched = transactions.filter(
    (t) =>
      t.workspaceId === workspaceId &&
      t.type === type &&
      day(t) >= input.from &&
      day(t) <= input.to &&
      (filter.value === null || t.categoryId === filter.value.id),
  );
  for (const t of matched) {
    const name = names.get(t.categoryId) ?? "Uncategorized";
    groups.set(name, [...(groups.get(name) ?? []), t.amount]);
  }
  const byCategory: SpendingRow[] = [...groups.entries()]
    .map(([name, amounts]) => {
      const total = sumAmounts(amounts, money);
      return { name, total, totalFormatted: formatMoney(total, money), count: amounts.length };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, ASSISTANT_LIMITS.maxListRows);
  const total = sumAmounts(
    matched.map((t) => t.amount),
    money,
  );

  return {
    ok: true,
    value: {
      period: {
        from: input.from,
        to: input.to,
        fromFormatted: formatDate(input.from, money.locale),
        toFormatted: formatDate(input.to, money.locale),
      },
      type,
      categoryName: filter.value === null ? null : filter.value.name,
      total,
      totalFormatted: formatMoney(total, money),
      count: matched.length,
      byCategory,
    },
  };
}

// Deterministic order: ties fall back to newest day, newest created, then id.
function compareFound(a: Transaction, b: Transaction, input: FindTransactionsInput): number {
  const direction = input.order === "asc" ? 1 : -1;
  const primary = input.sortBy === "amount" ? a.amount - b.amount : day(a).localeCompare(day(b));
  if (primary !== 0) return primary * direction;
  return day(b).localeCompare(day(a)) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
}

function byteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function findTransactionsIn(args: ComputeArgs<FindTransactionsInput>): Validation<FindTransactionsOutput> {
  const { input, transactions, categories, workspaceId, money } = args;
  const rangeError = checkRange(input.from, input.to);
  if (rangeError !== null) return { ok: false, error: rangeError };
  if (input.minAmount !== undefined && input.maxAmount !== undefined && input.minAmount > input.maxAmount) {
    return { ok: false, error: "minAmount must not be more than maxAmount." };
  }
  const filter = resolveCategoryFilter(input.categoryName, input.type, categories);
  if (!filter.ok) return filter;

  const text = input.text?.trim().toLowerCase();
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const matched = transactions
    .filter(
      (t) =>
        t.workspaceId === workspaceId &&
        (input.type === undefined || t.type === input.type) &&
        (filter.value === null || t.categoryId === filter.value.id) &&
        (input.from === undefined || day(t) >= input.from) &&
        (input.to === undefined || day(t) <= input.to) &&
        (input.minAmount === undefined || t.amount >= input.minAmount) &&
        (input.maxAmount === undefined || t.amount <= input.maxAmount) &&
        (text === undefined || `${t.description} ${t.notes}`.toLowerCase().includes(text)),
    )
    .sort((a, b) => compareFound(a, b, input));

  const limit = Math.min(input.limit ?? ASSISTANT_LIMITS.defaultListRows, ASSISTANT_LIMITS.maxListRows);
  const rows: FoundTransaction[] = matched.slice(0, limit).map((t) => {
    const amount = roundToCurrency(t.amount, money);
    return {
      id: t.id,
      date: day(t),
      dateFormatted: formatDate(day(t), money.locale),
      description: t.description,
      categoryName: names.get(t.categoryId) ?? "Uncategorized",
      type: t.type,
      amount,
      amountFormatted: formatMoney(amount, money),
    };
  });
  const describe = (shown: FoundTransaction[]): FindTransactionsOutput => ({
    totalMatches: matched.length,
    returned: shown.length,
    truncated: shown.length < matched.length,
    transactions: shown,
  });
  let output = describe(rows);
  while (output.transactions.length > 0 && byteSize(output) > ASSISTANT_LIMITS.maxToolOutputBytes) {
    output = describe(output.transactions.slice(0, -1));
  }
  return { ok: true, value: output };
}
