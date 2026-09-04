import {
  endOfMonth,
  getDate,
  getDaysInMonth,
  isSameMonth,
  startOfMonth,
  subMonths,
} from "date-fns";
import type { Budget, Category, Transaction } from "@/types";

// Tuning constants — adjust these to change insight sensitivity.
export const ANOMALY_RATIO = 2; // current month >= 2x historical average
export const ANOMALY_HISTORY_MONTHS = 6;
export const ANOMALY_MIN_MONTHS = 2; // months of history required
export const ANOMALY_MIN_AVERAGE = 10; // ignore categories with tiny averages
export const FORECAST_BASELINE_MONTHS = 3;
export const LARGEST_EXPENSES_COUNT = 3;

export interface Forecast {
  /** Projected total expenses for the current month from the daily run-rate. */
  projected: number;
  spentSoFar: number;
  /** Average monthly expenses over the prior full baseline months (null without history). */
  baselineAverage: number | null;
  /** projected / baselineAverage, when a baseline exists. */
  vsBaseline: number | null;
}

export interface CategoryDelta {
  category: Category;
  thisMonth: number;
  lastMonth: number;
  delta: number;
  /** Percent change vs last month; null when last month was 0. */
  percent: number | null;
}

export interface Anomaly {
  category: Category;
  currentSpend: number;
  averageSpend: number;
  ratio: number;
}

export interface HealthScoreComponent {
  label: string;
  points: number;
  maxPoints: number;
  detail: string;
}

export interface HealthScore {
  score: number;
  components: HealthScoreComponent[];
}

function monthExpensesByCategory(transactions: Transaction[], monthOf: Date): Map<string, number> {
  const start = startOfMonth(monthOf);
  const end = endOfMonth(monthOf);
  const map = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    const d = new Date(t.date);
    if (d < start || d > end) continue;
    map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amount);
  }
  return map;
}

function monthTotal(transactions: Transaction[], monthOf: Date, type: Transaction["type"]): number {
  const start = startOfMonth(monthOf);
  const end = endOfMonth(monthOf);
  return transactions
    .filter((t) => {
      if (t.type !== type) return false;
      const d = new Date(t.date);
      return d >= start && d <= end;
    })
    .reduce((sum, t) => sum + t.amount, 0);
}

/** True when the workspace has any transaction dated in the given month. */
function hasActivityInMonth(transactions: Transaction[], monthOf: Date): boolean {
  return transactions.some((t) => isSameMonth(new Date(t.date), monthOf));
}

export function forecastEndOfMonth(transactions: Transaction[], now: Date): Forecast {
  const spentSoFar = monthTotal(transactions, now, "expense");
  const dayOfMonth = getDate(now);
  const daysInMonth = getDaysInMonth(now);
  const projected = dayOfMonth > 0 ? (spentSoFar / dayOfMonth) * daysInMonth : spentSoFar;

  const priorMonths: number[] = [];
  for (let i = 1; i <= FORECAST_BASELINE_MONTHS; i++) {
    const month = subMonths(now, i);
    if (hasActivityInMonth(transactions, month)) {
      priorMonths.push(monthTotal(transactions, month, "expense"));
    }
  }
  const baselineAverage =
    priorMonths.length > 0 ? priorMonths.reduce((a, b) => a + b, 0) / priorMonths.length : null;

  return {
    projected,
    spentSoFar,
    baselineAverage,
    vsBaseline: baselineAverage && baselineAverage > 0 ? projected / baselineAverage : null,
  };
}

export function monthOverMonthDeltas(
  transactions: Transaction[],
  categories: Category[],
  now: Date
): CategoryDelta[] {
  const thisMonth = monthExpensesByCategory(transactions, now);
  const lastMonth = monthExpensesByCategory(transactions, subMonths(now, 1));
  const catMap = new Map(categories.map((c) => [c.id, c]));

  const categoryIds = new Set([...thisMonth.keys(), ...lastMonth.keys()]);
  const deltas: CategoryDelta[] = [];
  for (const id of categoryIds) {
    const category = catMap.get(id);
    if (!category) continue;
    const current = thisMonth.get(id) ?? 0;
    const previous = lastMonth.get(id) ?? 0;
    deltas.push({
      category,
      thisMonth: current,
      lastMonth: previous,
      delta: current - previous,
      percent: previous > 0 ? ((current - previous) / previous) * 100 : null,
    });
  }
  return deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

export function detectAnomalies(
  transactions: Transaction[],
  categories: Category[],
  now: Date
): Anomaly[] {
  const current = monthExpensesByCategory(transactions, now);
  const catMap = new Map(categories.map((c) => [c.id, c]));

  // Per-category average over prior months that had any activity.
  const totals = new Map<string, { sum: number; months: number }>();
  for (let i = 1; i <= ANOMALY_HISTORY_MONTHS; i++) {
    const month = subMonths(now, i);
    if (!hasActivityInMonth(transactions, month)) continue;
    const spend = monthExpensesByCategory(transactions, month);
    for (const [id] of catMap) {
      const entry = totals.get(id) ?? { sum: 0, months: 0 };
      entry.sum += spend.get(id) ?? 0;
      entry.months += 1;
      totals.set(id, entry);
    }
  }

  const anomalies: Anomaly[] = [];
  for (const [id, currentSpend] of current) {
    const category = catMap.get(id);
    const history = totals.get(id);
    if (!category || !history || history.months < ANOMALY_MIN_MONTHS) continue;
    const averageSpend = history.sum / history.months;
    if (averageSpend < ANOMALY_MIN_AVERAGE) continue;
    const ratio = currentSpend / averageSpend;
    if (ratio >= ANOMALY_RATIO) {
      anomalies.push({ category, currentSpend, averageSpend, ratio });
    }
  }
  return anomalies.sort((a, b) => b.ratio - a.ratio);
}

export function largestExpenses(transactions: Transaction[], now: Date): Transaction[] {
  const start = startOfMonth(now);
  const end = endOfMonth(now);
  return transactions
    .filter((t) => {
      if (t.type !== "expense") return false;
      const d = new Date(t.date);
      return d >= start && d <= end;
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, LARGEST_EXPENSES_COUNT);
}

export function computeHealthScore(
  transactions: Transaction[],
  budgets: Budget[],
  now: Date
): HealthScore {
  const income = monthTotal(transactions, now, "income");
  const expenses = monthTotal(transactions, now, "expense");
  const components: HealthScoreComponent[] = [];

  const hasBudgets = budgets.length > 0;
  // Weights: savings 40, forecast 25, budgets 20, volatility 15.
  // Without budgets, the 20 budget points are redistributed (50/30/20).
  const weights = hasBudgets
    ? { savings: 40, forecast: 25, budgets: 20, volatility: 15 }
    : { savings: 50, forecast: 30, budgets: 0, volatility: 20 };

  // 1. Savings rate this month: full points at >= 25% of income saved.
  const savingsRate = income > 0 ? (income - expenses) / income : 0;
  const savingsPoints = Math.round(Math.min(Math.max(savingsRate / 0.25, 0), 1) * weights.savings);
  components.push({
    label: "Savings rate",
    points: savingsPoints,
    maxPoints: weights.savings,
    detail:
      income > 0
        ? `Saving ${Math.round(savingsRate * 100)}% of income this month`
        : "No income recorded this month",
  });

  // 2. Forecast discipline: projected spend at or below baseline = full points,
  //    2x baseline or more = zero.
  const forecast = forecastEndOfMonth(transactions, now);
  let forecastPoints = Math.round(weights.forecast * 0.6); // neutral without history
  let forecastDetail = "Not enough history to compare forecast";
  if (forecast.vsBaseline !== null) {
    const overage = Math.min(Math.max(forecast.vsBaseline - 1, 0), 1);
    forecastPoints = Math.round((1 - overage) * weights.forecast);
    forecastDetail =
      forecast.vsBaseline <= 1
        ? "Forecast spending is at or below your recent average"
        : `Forecast spending is ${forecast.vsBaseline.toFixed(1)}x your recent average`;
  }
  components.push({
    label: "Spending forecast",
    points: forecastPoints,
    maxPoints: weights.forecast,
    detail: forecastDetail,
  });

  // 3. Budget adherence: share of budgeted categories currently within limit.
  if (hasBudgets) {
    const spendByCategory = monthExpensesByCategory(transactions, now);
    const withinLimit = budgets.filter(
      (b) => (spendByCategory.get(b.categoryId) ?? 0) <= b.monthlyLimit
    ).length;
    const budgetPoints = Math.round((withinLimit / budgets.length) * weights.budgets);
    components.push({
      label: "Budget adherence",
      points: budgetPoints,
      maxPoints: weights.budgets,
      detail: `${withinLimit} of ${budgets.length} budgets within limit`,
    });
  }

  // 4. Spending volatility across the last 3 active months: lower is better.
  const recentTotals: number[] = [];
  for (let i = 0; i <= 2; i++) {
    const month = subMonths(now, i);
    if (hasActivityInMonth(transactions, month)) {
      recentTotals.push(monthTotal(transactions, month, "expense"));
    }
  }
  let volatilityPoints = Math.round(weights.volatility * 0.6); // neutral without history
  let volatilityDetail = "Not enough history to measure consistency";
  if (recentTotals.length >= 2) {
    const mean = recentTotals.reduce((a, b) => a + b, 0) / recentTotals.length;
    if (mean > 0) {
      const variance =
        recentTotals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / recentTotals.length;
      const coefficient = Math.sqrt(variance) / mean; // 0 = perfectly steady
      volatilityPoints = Math.round(Math.min(Math.max(1 - coefficient, 0), 1) * weights.volatility);
      volatilityDetail =
        coefficient < 0.25 ? "Spending is steady month to month" : "Spending varies a lot month to month";
    }
  }
  components.push({
    label: "Consistency",
    points: volatilityPoints,
    maxPoints: weights.volatility,
    detail: volatilityDetail,
  });

  const score = components.reduce((sum, c) => sum + c.points, 0);
  return { score, components };
}
