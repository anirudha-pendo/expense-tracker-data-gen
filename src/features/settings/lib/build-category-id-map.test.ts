// Regression test for APP-172982: buildCategoryIdMap must remap exported
// category IDs to the current workspace's IDs so that imported transactions
// and budgets reference valid categories instead of showing "Uncategorized".
//
// Run with: cd bot && npx tsx ../src/features/settings/lib/build-category-id-map.test.ts
// (uses the bot's tsx — no new dependency needed.)

import assert from "node:assert";

// The function under test is a pure function with no DOM or DB dependencies,
// so we can import it directly with the path alias that bot/tsconfig.json
// already maps.
import { buildCategoryIdMap } from "@/features/settings/lib/build-category-id-map";

import type { Category } from "@/types";

let checksPassed = 0;

function check(label: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    console.error(`FAILED: ${label}`);
    throw err;
  }
  checksPassed++;
}

// --- Helpers -----------------------------------------------------------------

let nextId = 1;
function fakeId(): string {
  return `fake-id-${nextId++}`;
}

function makeCategory(overrides: Partial<Category> & { id: string; name: string }): Category {
  return {
    workspaceId: "ws-source",
    color: "#000000",
    scope: "expense",
    isDefault: true,
    ...overrides,
  };
}

// --- Tests -------------------------------------------------------------------

check("default categories match by name: old IDs map to current IDs", () => {
  const exported: Category[] = [
    makeCategory({ id: "old-food", name: "Food & Dining" }),
    makeCategory({ id: "old-transport", name: "Transport" }),
  ];
  const current: Category[] = [
    makeCategory({ id: "new-food", name: "Food & Dining", workspaceId: "ws-target" }),
    makeCategory({ id: "new-transport", name: "Transport", workspaceId: "ws-target" }),
  ];

  const { idMap, newCategories } = buildCategoryIdMap(exported, current, "ws-target", fakeId);

  assert.strictEqual(idMap.get("old-food"), "new-food");
  assert.strictEqual(idMap.get("old-transport"), "new-transport");
  assert.strictEqual(newCategories.length, 0);
});

check("custom categories with no name match produce new categories", () => {
  const exported: Category[] = [
    makeCategory({ id: "old-food", name: "Food & Dining" }),
    makeCategory({ id: "old-custom", name: "My Custom", isDefault: false, color: "#ff0000", scope: "both" }),
  ];
  const current: Category[] = [
    makeCategory({ id: "new-food", name: "Food & Dining", workspaceId: "ws-target" }),
  ];

  const { idMap, newCategories } = buildCategoryIdMap(exported, current, "ws-target", fakeId);

  assert.strictEqual(idMap.get("old-food"), "new-food");
  // The custom category should get a new ID
  const newCustomId = idMap.get("old-custom");
  assert.ok(newCustomId !== undefined);
  assert.notStrictEqual(newCustomId, "old-custom");

  assert.strictEqual(newCategories.length, 1);
  assert.strictEqual(newCategories[0].name, "My Custom");
  assert.strictEqual(newCategories[0].id, newCustomId);
  assert.strictEqual(newCategories[0].workspaceId, "ws-target");
  assert.strictEqual(newCategories[0].color, "#ff0000");
  assert.strictEqual(newCategories[0].scope, "both");
  assert.strictEqual(newCategories[0].isDefault, false);
});

check("empty exported categories produce an empty map and no new categories", () => {
  const current: Category[] = [
    makeCategory({ id: "new-food", name: "Food & Dining", workspaceId: "ws-target" }),
  ];

  const { idMap, newCategories } = buildCategoryIdMap([], current, "ws-target", fakeId);

  assert.strictEqual(idMap.size, 0);
  assert.strictEqual(newCategories.length, 0);
});

check("category name matching is case-sensitive (names from the same app are exact)", () => {
  const exported: Category[] = [
    makeCategory({ id: "old-food", name: "food & dining" }),
  ];
  const current: Category[] = [
    makeCategory({ id: "new-food", name: "Food & Dining", workspaceId: "ws-target" }),
  ];

  const { idMap, newCategories } = buildCategoryIdMap(exported, current, "ws-target", fakeId);

  // No match — names differ in case
  assert.notStrictEqual(idMap.get("old-food"), "new-food");
  assert.strictEqual(newCategories.length, 1);
  assert.strictEqual(newCategories[0].name, "food & dining");
});

check("all 12 default categories remap correctly when both workspaces have them", () => {
  const defaultNames = [
    "Food & Dining", "Transport", "Shopping", "Entertainment",
    "Health", "Housing", "Utilities", "Other Expense",
    "Salary", "Freelance", "Investment", "Other Income",
  ];

  const exported = defaultNames.map((name, i) =>
    makeCategory({ id: `old-${i}`, name }),
  );
  const current = defaultNames.map((name, i) =>
    makeCategory({ id: `new-${i}`, name, workspaceId: "ws-target" }),
  );

  const { idMap, newCategories } = buildCategoryIdMap(exported, current, "ws-target", fakeId);

  assert.strictEqual(idMap.size, 12);
  assert.strictEqual(newCategories.length, 0);
  for (let i = 0; i < 12; i++) {
    assert.strictEqual(idMap.get(`old-${i}`), `new-${i}`, `category "${defaultNames[i]}" not remapped`);
  }
});

check("mixed default and custom categories: defaults remap, customs are created", () => {
  const exported: Category[] = [
    makeCategory({ id: "old-food", name: "Food & Dining" }),
    makeCategory({ id: "old-pets", name: "Pet Supplies", isDefault: false }),
    makeCategory({ id: "old-salary", name: "Salary", scope: "income" }),
    makeCategory({ id: "old-side", name: "Side Gig", scope: "income", isDefault: false }),
  ];
  const current: Category[] = [
    makeCategory({ id: "new-food", name: "Food & Dining", workspaceId: "ws-target" }),
    makeCategory({ id: "new-salary", name: "Salary", scope: "income", workspaceId: "ws-target" }),
  ];

  const { idMap, newCategories } = buildCategoryIdMap(exported, current, "ws-target", fakeId);

  assert.strictEqual(idMap.get("old-food"), "new-food");
  assert.strictEqual(idMap.get("old-salary"), "new-salary");
  assert.strictEqual(idMap.size, 4);
  assert.strictEqual(newCategories.length, 2);

  const createdNames = newCategories.map((c) => c.name).sort();
  assert.deepStrictEqual(createdNames, ["Pet Supplies", "Side Gig"]);

  for (const cat of newCategories) {
    assert.strictEqual(cat.workspaceId, "ws-target");
    assert.strictEqual(idMap.get(exported.find((e) => e.name === cat.name)!.id), cat.id);
  }
});

check("regression: categoryId remapping prevents Uncategorized transactions and invisible budgets", () => {
  // Simulate the exact scenario from the bug report: a workspace exports
  // data, a fresh workspace with different category IDs imports it.
  const exported: Category[] = [
    makeCategory({ id: "src-food", name: "Food & Dining" }),
    makeCategory({ id: "src-salary", name: "Salary", scope: "income" }),
  ];
  const current: Category[] = [
    makeCategory({ id: "dst-food", name: "Food & Dining", workspaceId: "ws-new" }),
    makeCategory({ id: "dst-salary", name: "Salary", scope: "income", workspaceId: "ws-new" }),
  ];

  const { idMap } = buildCategoryIdMap(exported, current, "ws-new", fakeId);

  // A transaction and budget from the export
  const txCategoryId = "src-food";
  const budgetCategoryId = "src-food";

  // After remapping, they reference the target workspace's categories
  const remappedTxCategoryId = idMap.get(txCategoryId) ?? txCategoryId;
  const remappedBudgetCategoryId = idMap.get(budgetCategoryId) ?? budgetCategoryId;

  assert.strictEqual(remappedTxCategoryId, "dst-food", "transaction should reference the new workspace's Food & Dining");
  assert.strictEqual(remappedBudgetCategoryId, "dst-food", "budget should reference the new workspace's Food & Dining");

  // Both IDs exist in the current workspace
  const currentIds = new Set(current.map((c) => c.id));
  assert.ok(currentIds.has(remappedTxCategoryId), "remapped transaction categoryId must exist in target workspace");
  assert.ok(currentIds.has(remappedBudgetCategoryId), "remapped budget categoryId must exist in target workspace");
});

// --- Summary -----------------------------------------------------------------

console.log(`build-category-id-map: ${checksPassed} checks passed`);
process.exit(0);
