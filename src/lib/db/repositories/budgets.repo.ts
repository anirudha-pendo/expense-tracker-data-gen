import { getDB } from "../client";
import type { Budget } from "@/types";

export async function getBudgetsByWorkspaceId(workspaceId: string): Promise<Budget[]> {
  const db = await getDB();
  return db.getAllFromIndex("budgets", "by-workspaceId", workspaceId);
}

export async function upsertBudget(budget: Budget): Promise<void> {
  const db = await getDB();
  const existing = await db.getFromIndex("budgets", "by-categoryId", budget.categoryId);
  if (existing) {
    await db.put("budgets", {
      ...existing,
      monthlyLimit: budget.monthlyLimit,
      updatedAt: new Date().toISOString(),
    });
  } else {
    await db.add("budgets", budget);
  }
}

export async function deleteBudget(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("budgets", id);
}
