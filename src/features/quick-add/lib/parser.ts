import { format, getDay, isValid, parse, subDays, subYears } from "date-fns";
import { buildKeywordIndex, inferCategory } from "./category-inference";
import type { Category, Transaction, TransactionType } from "@/types";

export interface ParseContext {
  categories: Category[];
  transactions: Transaction[];
  now?: Date;
}

export interface ParsedQuickAdd {
  amount: number | null;
  /** yyyy-MM-dd; defaults to today when no date phrase was found. */
  date: string;
  dateExplicit: boolean;
  type: TransactionType;
  typeExplicit: boolean;
  category: Category | null;
  categoryGuessed: boolean;
  description: string;
  isValid: boolean;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAY_ABBREV = ["sun", "mon", "tue", "tues", "wed", "thu", "thur", "thurs", "fri", "sat"];
const ABBREV_TO_DAY: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6,
};

// Explicit formats tried over sliding 1–2 token windows. Month-name and
// slash/dash formats can't collide with bare amounts.
const ONE_TOKEN_FORMATS = ["yyyy-MM-dd", "M/d/yyyy", "M/d"];
const TWO_TOKEN_FORMATS = ["MMMM d", "MMM d", "d MMMM", "d MMM"];

const AMOUNT_RE = /^[$€£]?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/;

interface DateMatch {
  date: Date;
  /** Indices of consumed tokens. */
  consumed: number[];
}

function mostRecentWeekday(target: number, now: Date): Date {
  for (let i = 1; i <= 7; i++) {
    const d = subDays(now, i);
    if (getDay(d) === target) return d;
  }
  return now;
}

function findDate(tokens: string[], now: Date): DateMatch | null {
  const lower = tokens.map((t) => t.toLowerCase());

  for (let i = 0; i < lower.length; i++) {
    const t = lower[i];

    if (t === "today") return { date: now, consumed: [i] };
    if (t === "yesterday") return { date: subDays(now, 1), consumed: [i] };

    // "N days ago" / "N day ago"
    if (/^\d{1,3}$/.test(t) && (lower[i + 1] === "days" || lower[i + 1] === "day") && lower[i + 2] === "ago") {
      return { date: subDays(now, parseInt(t, 10)), consumed: [i, i + 1, i + 2] };
    }

    // Weekday names: most recent past occurrence; consume a preceding "last".
    const weekdayIndex = WEEKDAYS.indexOf(t);
    const abbrevDay = WEEKDAY_ABBREV.includes(t) ? ABBREV_TO_DAY[t] : undefined;
    const day = weekdayIndex >= 0 ? weekdayIndex : abbrevDay;
    if (day !== undefined) {
      const consumed = lower[i - 1] === "last" ? [i - 1, i] : [i];
      return { date: mostRecentWeekday(day, now), consumed };
    }

    // Explicit single-token formats (2024-06-01, 6/1, 6/1/2024)
    if (/[/-]/.test(t)) {
      for (const fmt of ONE_TOKEN_FORMATS) {
        const parsed = parse(t, fmt, now);
        if (isValid(parsed)) {
          const date = parsed > now && !fmt.includes("yyyy") ? subYears(parsed, 1) : parsed;
          return { date, consumed: [i] };
        }
      }
    }

    // Two-token month-name formats ("june 1", "1 june")
    if (i + 1 < lower.length) {
      const window = `${lower[i]} ${lower[i + 1]}`;
      for (const fmt of TWO_TOKEN_FORMATS) {
        const parsed = parse(window, fmt, now);
        if (isValid(parsed)) {
          const date = parsed > now ? subYears(parsed, 1) : parsed;
          return { date, consumed: [i, i + 1] };
        }
      }
    }
  }
  return null;
}

function findAmount(tokens: string[]): { amount: number; index: number } | null {
  const candidates: { amount: number; index: number; symbol: boolean; decimal: boolean }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!AMOUNT_RE.test(t)) continue;
    const symbol = /^[$€£]/.test(t);
    const decimal = t.includes(".");
    const amount = parseFloat(t.replace(/^[$€£]/, "").replace(/,/g, ""));
    if (amount > 0) candidates.push({ amount, index: i, symbol, decimal });
  }
  if (candidates.length === 0) return null;
  // Prefer an explicit currency symbol, then a decimal amount, then the last
  // numeric token ("2 coffees 4.50" → 4.50; trailing amounts are most common).
  const preferred =
    candidates.find((c) => c.symbol) ??
    candidates.find((c) => c.decimal) ??
    candidates[candidates.length - 1];
  return { amount: preferred.amount, index: preferred.index };
}

// Deterministic extraction order: type keyword → date → amount → description
// → category. Date runs before amount so "june 1" can't be read as amount 1.
export function parseQuickAdd(input: string, ctx: ParseContext): ParsedQuickAdd {
  const now = ctx.now ?? new Date();
  let tokens = input.trim().split(/\s+/).filter(Boolean);

  // 1. Explicit type keyword
  let explicitType: TransactionType | null = null;
  tokens = tokens.filter((t) => {
    const lower = t.toLowerCase();
    if (lower === "income" || lower === "expense") {
      explicitType = lower as TransactionType;
      return false;
    }
    return true;
  });

  // 2. Date
  const dateMatch = findDate(tokens, now);
  if (dateMatch) {
    const consumed = new Set(dateMatch.consumed);
    tokens = tokens.filter((_, i) => !consumed.has(i));
  }
  const date = format(dateMatch?.date ?? now, "yyyy-MM-dd");

  // 3. Amount
  const amountMatch = findAmount(tokens);
  if (amountMatch) tokens = tokens.filter((_, i) => i !== amountMatch.index);

  // 4. Description = whatever is left, original casing
  const description = tokens.join(" ").trim();

  // 5. Category inference from description + history
  const index = buildKeywordIndex(ctx.transactions);
  const inference = inferCategory(description, ctx.categories, index, explicitType);

  const type: TransactionType = explicitType ?? inference.inferredType ?? "expense";

  return {
    amount: amountMatch?.amount ?? null,
    date,
    dateExplicit: !!dateMatch,
    type,
    typeExplicit: explicitType !== null,
    category: inference.category,
    categoryGuessed: inference.guessed,
    description,
    isValid: amountMatch !== null && inference.category !== null,
  };
}
