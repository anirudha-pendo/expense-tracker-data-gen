import { getDB } from "../client";
import type { Goal, GoalContribution } from "@/types";

export async function createGoal(goal: Goal): Promise<void> {
  const db = await getDB();
  await db.add("goals", goal);
}

export async function getGoalsByWorkspaceId(workspaceId: string): Promise<Goal[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("goals", "by-workspaceId", workspaceId);
  return all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export async function updateGoal(goal: Goal): Promise<void> {
  const db = await getDB();
  await db.put("goals", { ...goal, updatedAt: new Date().toISOString() });
}

export async function deleteGoal(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("goals", id);
}

export async function addContribution(goalId: string, contribution: GoalContribution): Promise<Goal> {
  const db = await getDB();
  const goal = await db.get("goals", goalId);
  if (!goal) throw new Error("Goal not found");
  const updated: Goal = {
    ...goal,
    contributions: [...goal.contributions, contribution],
    updatedAt: new Date().toISOString(),
  };
  await db.put("goals", updated);
  return updated;
}
