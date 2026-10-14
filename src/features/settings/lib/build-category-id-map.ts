import type { Category } from "@/types";

/**
 * Given the categories from an export file and the categories already present
 * in the current workspace, return:
 *
 * - `idMap` — old category ID → new category ID (for remapping transactions
 *   and budgets).
 * - `newCategories` — custom categories from the export that have no name
 *   match in the current workspace and must be created before the remap is
 *   applied.
 *
 * Matching is by exact `name`: every default category keeps its canonical name
 * across workspaces, and a user-created category whose name collides with an
 * existing one reuses the existing row rather than duplicating it.
 *
 * This function is pure — it has no side effects and does not touch IndexedDB —
 * so it can be tested without a browser environment.
 */
export function buildCategoryIdMap(
  exportedCategories: Category[],
  currentCategories: Category[],
  workspaceId: string,
  generateId: () => string = () => crypto.randomUUID(),
): { idMap: Map<string, string>; newCategories: Category[] } {
  const currentByName = new Map(currentCategories.map((c) => [c.name, c.id]));
  const idMap = new Map<string, string>();
  const newCategories: Category[] = [];

  for (const exported of exportedCategories) {
    const existingId = currentByName.get(exported.name);
    if (existingId !== undefined) {
      idMap.set(exported.id, existingId);
    } else {
      const newId = generateId();
      idMap.set(exported.id, newId);
      newCategories.push({
        ...exported,
        id: newId,
        workspaceId,
      });
    }
  }

  return { idMap, newCategories };
}
