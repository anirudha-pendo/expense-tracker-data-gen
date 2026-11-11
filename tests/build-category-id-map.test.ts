// Standalone regression test for the category-import mapping logic.
// No test framework — matches the repo convention (see CLAUDE.md).
//
// Run:  npx tsx tests/build-category-id-map.test.ts

import assert from "node:assert";
import type { Category } from "../src/types/index.js";
import { buildCategoryIdMap } from "../src/features/settings/lib/build-category-id-map.js";

let nextId = 0;
function fakeId(): string {
  return `new-${++nextId}`;
}

function makeCat(overrides: Partial<Category> & Pick<Category, "id" | "name">): Category {
  return {
    workspaceId: "ws-old",
    color: "#000",
    scope: "expense",
    isDefault: true,
    ...overrides,
  };
}

// --- 1. Matching by name reuses existing IDs --------------------------------
{
  const imported = [makeCat({ id: "old-food", name: "Food & Dining" })];
  const existing = [makeCat({ id: "cur-food", name: "Food & Dining", workspaceId: "ws-new" })];

  const { idMap, newCategories } = buildCategoryIdMap(imported, existing, "ws-new", fakeId);

  assert.strictEqual(idMap.get("old-food"), "cur-food", "should map old ID → existing ID by name");
  assert.strictEqual(newCategories.length, 0, "no new categories when name matches");
}

// --- 2. Unmatched categories get created with new IDs -----------------------
{
  nextId = 0;
  const imported = [makeCat({ id: "old-custom", name: "My Custom" })];
  const existing = [makeCat({ id: "cur-food", name: "Food & Dining", workspaceId: "ws-new" })];

  const { idMap, newCategories } = buildCategoryIdMap(imported, existing, "ws-new", fakeId);

  assert.strictEqual(idMap.get("old-custom"), "new-1", "unmatched category gets a fresh ID");
  assert.strictEqual(newCategories.length, 1, "one new category to create");
  assert.strictEqual(newCategories[0].name, "My Custom");
  assert.strictEqual(newCategories[0].workspaceId, "ws-new", "new category uses target workspace");
}

// --- 3. Mixed: some match, some are new -------------------------------------
{
  nextId = 0;
  const imported = [
    makeCat({ id: "old-food", name: "Food & Dining" }),
    makeCat({ id: "old-salary", name: "Salary", scope: "income" }),
    makeCat({ id: "old-custom", name: "Vacation" }),
  ];
  const existing = [
    makeCat({ id: "cur-food", name: "Food & Dining", workspaceId: "ws-new" }),
    makeCat({ id: "cur-salary", name: "Salary", workspaceId: "ws-new", scope: "income" }),
  ];

  const { idMap, newCategories } = buildCategoryIdMap(imported, existing, "ws-new", fakeId);

  assert.strictEqual(idMap.size, 3);
  assert.strictEqual(idMap.get("old-food"), "cur-food");
  assert.strictEqual(idMap.get("old-salary"), "cur-salary");
  assert.strictEqual(idMap.get("old-custom"), "new-1");
  assert.strictEqual(newCategories.length, 1);
  assert.strictEqual(newCategories[0].name, "Vacation");
}

// --- 4. Empty imported categories array → no-op -----------------------------
{
  const { idMap, newCategories } = buildCategoryIdMap([], [], "ws-new", fakeId);
  assert.strictEqual(idMap.size, 0);
  assert.strictEqual(newCategories.length, 0);
}

// --- 5. Transactions / budgets remap correctly via the idMap ----------------
{
  nextId = 0;
  const imported = [
    makeCat({ id: "old-food", name: "Food & Dining" }),
    makeCat({ id: "old-custom", name: "Vacation" }),
  ];
  const existing = [makeCat({ id: "cur-food", name: "Food & Dining", workspaceId: "ws-new" })];

  const { idMap } = buildCategoryIdMap(imported, existing, "ws-new", fakeId);

  // Simulate remapping a transaction's categoryId
  const txCategoryId = "old-food";
  assert.strictEqual(idMap.get(txCategoryId) ?? txCategoryId, "cur-food", "transaction remapped to existing");

  const budgetCategoryId = "old-custom";
  assert.strictEqual(idMap.get(budgetCategoryId) ?? budgetCategoryId, "new-1", "budget remapped to new category");
}

console.log("✓ all build-category-id-map tests passed");
