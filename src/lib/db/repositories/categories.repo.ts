import { getDB } from "../client";
import type { Category } from "@/types";

export async function createCategory(category: Category): Promise<void> {
  const db = await getDB();
  await db.add("categories", category);
}

export async function getCategoriesByWorkspaceId(workspaceId: string): Promise<Category[]> {
  const db = await getDB();
  return db.getAllFromIndex("categories", "by-workspaceId", workspaceId);
}

export async function updateCategory(category: Category): Promise<void> {
  const db = await getDB();
  await db.put("categories", category);
}

export async function deleteCategory(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("categories", id);
}

export async function seedDefaultCategories(workspaceId: string): Promise<void> {
  const defaults: Category[] = [
    { id: crypto.randomUUID(), workspaceId, name: "Food & Dining", color: "#f97316", scope: "expense", isDefault: true },
    { id: crypto.randomUUID(), workspaceId, name: "Transport", color: "#3b82f6", scope: "expense", isDefault: true },
    { id: crypto.randomUUID(), workspaceId, name: "Shopping", color: "#8b5cf6", scope: "expense", isDefault: true },
    { id: crypto.randomUUID(), workspaceId, name: "Entertainment", color: "#ec4899", scope: "expense", isDefault: true },
    { id: crypto.randomUUID(), workspaceId, name: "Health", color: "#10b981", scope: "expense", isDefault: true },
    { id: crypto.randomUUID(), workspaceId, name: "Housing", color: "#6366f1", scope: "expense", isDefault: true },
    { id: crypto.randomUUID(), workspaceId, name: "Utilities", color: "#f59e0b", scope: "expense", isDefault: true },
    { id: crypto.randomUUID(), workspaceId, name: "Other Expense", color: "#6b7280", scope: "expense", isDefault: true },
    { id: crypto.randomUUID(), workspaceId, name: "Salary", color: "#22c55e", scope: "income", isDefault: true },
    { id: crypto.randomUUID(), workspaceId, name: "Freelance", color: "#06b6d4", scope: "income", isDefault: true },
    { id: crypto.randomUUID(), workspaceId, name: "Investment", color: "#84cc16", scope: "income", isDefault: true },
    { id: crypto.randomUUID(), workspaceId, name: "Other Income", color: "#a3e635", scope: "income", isDefault: true },
  ];

  const db = await getDB();
  const tx = db.transaction("categories", "readwrite");
  await Promise.all([...defaults.map((c) => tx.store.add(c)), tx.done]);
}
