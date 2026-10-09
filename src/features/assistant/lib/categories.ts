import type { Category, TransactionType } from "../../../types/index.js";

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

export function findCategory(categories: readonly Category[], name: string): Category | undefined {
  const wanted = name.trim().toLowerCase();
  if (wanted === "") return undefined;
  return categories.find((c) => c.name.trim().toLowerCase() === wanted);
}

export function scopeAllows(category: Category, type: TransactionType): boolean {
  return category.scope === "both" || category.scope === type;
}

export function inferType(category: Category): TransactionType {
  return category.scope === "income" ? "income" : "expense";
}

export function categoryListFor(categories: readonly Category[], type?: TransactionType): string {
  const names = categories.filter((c) => type === undefined || scopeAllows(c, type)).map((c) => c.name);
  return names.length === 0 ? "none" : names.join(", ");
}

export function unknownCategoryError(name: string, categories: readonly Category[], type?: TransactionType): string {
  const label = type === undefined ? "Valid categories" : `Valid ${type} categories`;
  return `Unknown category "${name.trim()}". ${label}: ${categoryListFor(categories, type)}.`;
}

export function scopeError(category: Category, type: TransactionType, categories: readonly Category[]): string {
  return `"${category.name}" is an ${category.scope} category. Valid ${type} categories: ${categoryListFor(categories, type)}.`;
}
