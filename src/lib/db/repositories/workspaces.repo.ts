import { getDB } from "../client";
import type { Workspace } from "@/types";

export async function createWorkspace(workspace: Workspace): Promise<void> {
  const db = await getDB();
  await db.add("workspaces", workspace);
}

export async function getWorkspaceById(id: string): Promise<Workspace | undefined> {
  const db = await getDB();
  return db.get("workspaces", id);
}

export async function getWorkspacesByUserId(userId: string): Promise<Workspace[]> {
  const db = await getDB();
  return db.getAllFromIndex("workspaces", "by-userId", userId);
}

export async function updateWorkspace(workspace: Workspace): Promise<void> {
  const db = await getDB();
  await db.put("workspaces", workspace);
}
