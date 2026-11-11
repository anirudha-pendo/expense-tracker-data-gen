import type { Category } from "@/types";

export interface CategoryMappingResult {
  /** Maps each imported category's old ID to the ID to use in the current workspace. */
  idMap: Map<string, string>;
  /** Categories that had no name-match and need to be created in the workspace. */
  newCategories: Category[];
}

/**
 * Build a mapping from exported category IDs to the current workspace's
 * category IDs.  Categories whose name already exists in the workspace reuse
 * the existing ID; all others are assigned a fresh UUID and returned in
 * `newCategories` so the caller can persist them.
 */
export function buildCategoryIdMap(
  importedCategories: Category[],
  existingCategories: Category[],
  workspaceId: string,
  generateId: () => string = () => crypto.randomUUID(),
): CategoryMappingResult {
  const idMap = new Map<string, string>();
  const newCategories: Category[] = [];

  const existingByName = new Map<string, Category>();
  for (const cat of existingCategories) {
    existingByName.set(cat.name, cat);
  }

  for (const imported of importedCategories) {
    // Already mapped (e.g. two imported categories share a name).
    if (idMap.has(imported.id)) continue;

    const match = existingByName.get(imported.name);
    if (match) {
      idMap.set(imported.id, match.id);
    } else {
      const newId = generateId();
      idMap.set(imported.id, newId);
      newCategories.push({ ...imported, id: newId, workspaceId });
    }
  }

  return { idMap, newCategories };
}
