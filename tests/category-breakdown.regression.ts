// Regression test for APP-172981: the "Spending by Category" chart total must
// include every category, not only the top 6.
//
// Run with: npx tsx --tsconfig tsconfig.app.json tests/category-breakdown.regression.ts

import assert from "node:assert";
import { capCategoryBreakdown, type CategorySpend } from "../src/features/dashboard/hooks/use-dashboard-stats";

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

// Helpers --------------------------------------------------------------------

function makeCategories(count: number): CategorySpend[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `Cat ${i + 1}`,
    amount: (count - i) * 100,
    color: `#${String(i).padStart(6, "0")}`,
  }));
}

function total(categories: CategorySpend[]): number {
  return categories.reduce((sum, c) => sum + c.amount, 0);
}

// Checks ---------------------------------------------------------------------

check("returns input unchanged when 6 or fewer categories", () => {
  for (const n of [0, 1, 3, 6]) {
    const input = makeCategories(n);
    const result = capCategoryBreakdown(input);
    assert.deepStrictEqual(result, input, `${n} categories should pass through`);
  }
});

check("folds 7th+ categories into an Other bucket", () => {
  const input = makeCategories(8);
  const result = capCategoryBreakdown(input);

  assert.strictEqual(result.length, 7, "should be top 6 + Other");
  assert.strictEqual(result[6].name, "Other");
  assert.strictEqual(result[6].color, "#9ca3af");
});

check("Other amount equals the sum of categories beyond the top 6", () => {
  const input = makeCategories(10);
  const result = capCategoryBreakdown(input);
  const otherExpected = input.slice(6).reduce((sum, c) => sum + c.amount, 0);

  assert.strictEqual(result[6].amount, otherExpected);
});

check("total of capped output equals total of full input (APP-172981)", () => {
  const input = makeCategories(9);
  const result = capCategoryBreakdown(input);

  assert.strictEqual(
    total(result),
    total(input),
    "chart total must match full expenses total",
  );
});

check("top 6 entries are preserved in order", () => {
  const input = makeCategories(8);
  const result = capCategoryBreakdown(input);

  for (let i = 0; i < 6; i++) {
    assert.deepStrictEqual(result[i], input[i]);
  }
});

check("exactly 7 categories: single remainder becomes Other", () => {
  const input = makeCategories(7);
  const result = capCategoryBreakdown(input);

  assert.strictEqual(result.length, 7);
  assert.strictEqual(result[6].name, "Other");
  assert.strictEqual(result[6].amount, input[6].amount);
});

console.log(`category-breakdown regression: ${passed} checks passed`);
