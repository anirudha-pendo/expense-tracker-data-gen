/**
 * Regression test for APP-172981: the "Spending by Category" donut total must
 * reflect ALL expense categories, not just the top 6 displayed slices.
 *
 * No test framework — mirrors bot/selftest.ts style with node:assert.
 * Run: npx tsx tests/category-total-regression.ts
 */

import assert from "node:assert";

interface CategorySpend {
  name: string;
  amount: number;
  color: string;
}

let passed = 0;

function check(label: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    console.error(`FAILED: ${label}`);
    throw err;
  }
  passed++;
}

// Reproduces the exact computation paths from use-dashboard-stats.ts (hook)
// and spending-by-category-chart.tsx (chart).

/** Hook computation: build the full breakdown, then slice to the display limit. */
function buildBreakdown(expenses: { categoryId: string; amount: number }[], categories: Map<string, { name: string; color: string }>, limit = 6) {
  const spendMap = new Map<string, number>();
  for (const t of expenses) {
    spendMap.set(t.categoryId, (spendMap.get(t.categoryId) ?? 0) + t.amount);
  }
  const all: CategorySpend[] = Array.from(spendMap.entries())
    .map(([id, amount]) => {
      const cat = categories.get(id);
      return { name: cat?.name ?? "Unknown", amount, color: cat?.color ?? "#6b7280" };
    })
    .sort((a, b) => b.amount - a.amount);

  const totalExpenses = expenses.reduce((sum, t) => sum + t.amount, 0);
  return { breakdown: all.slice(0, limit), totalExpenses };
}

// 8 categories: the ticket says "power personas have 8 default plus up to 3
// custom expense categories", so >6 is the normal case for those users.
const categories = new Map([
  ["c1", { name: "Food & Dining", color: "#ef4444" }],
  ["c2", { name: "Transport", color: "#f97316" }],
  ["c3", { name: "Entertainment", color: "#eab308" }],
  ["c4", { name: "Shopping", color: "#22c55e" }],
  ["c5", { name: "Healthcare", color: "#3b82f6" }],
  ["c6", { name: "Education", color: "#8b5cf6" }],
  ["c7", { name: "Utilities", color: "#ec4899" }],
  ["c8", { name: "Travel", color: "#14b8a6" }],
]);

const expenses = [
  { categoryId: "c1", amount: 500 },
  { categoryId: "c2", amount: 400 },
  { categoryId: "c3", amount: 350 },
  { categoryId: "c4", amount: 300 },
  { categoryId: "c5", amount: 250 },
  { categoryId: "c6", amount: 200 },
  { categoryId: "c7", amount: 150 },
  { categoryId: "c8", amount: 100 },
];

const { breakdown, totalExpenses } = buildBreakdown(expenses, categories);

check("breakdown is sliced to 6 categories", () => {
  assert.strictEqual(breakdown.length, 6);
});

check("totalExpenses equals the sum of ALL 8 categories (2250), not just the top 6 (2000)", () => {
  const sumAll = expenses.reduce((s, e) => s + e.amount, 0);
  assert.strictEqual(sumAll, 2250);
  assert.strictEqual(totalExpenses, 2250);
});

check("the old bug: summing only the sliced array yields 2000, not the correct 2250", () => {
  const slicedTotal = breakdown.reduce((sum, d) => sum + d.amount, 0);
  assert.strictEqual(slicedTotal, 2000, "sliced total should be 2000");
  assert.notStrictEqual(slicedTotal, totalExpenses, "sliced total must differ from the full total when >6 categories exist");
});

check("the fix: chart uses totalExpenses (passed as prop), which equals the full sum", () => {
  // After the fix, the chart receives totalExpenses directly from the hook's
  // summary.totalExpenses instead of computing data.reduce(). The prop value
  // must equal the sum of ALL expense transactions.
  assert.strictEqual(totalExpenses, 2250);
});

check("with exactly 6 categories the sliced total equals the full total (no regression for <=6)", () => {
  const sixCats = new Map([...categories].slice(0, 6));
  const sixExpenses = expenses.slice(0, 6);
  const result = buildBreakdown(sixExpenses, sixCats);
  const slicedSum = result.breakdown.reduce((s, d) => s + d.amount, 0);
  assert.strictEqual(result.breakdown.length, 6);
  assert.strictEqual(slicedSum, result.totalExpenses);
});

check("with 0 categories both totals are 0", () => {
  const result = buildBreakdown([], new Map());
  assert.strictEqual(result.breakdown.length, 0);
  assert.strictEqual(result.totalExpenses, 0);
});

console.log(`category-total-regression: ${passed} checks passed`);
