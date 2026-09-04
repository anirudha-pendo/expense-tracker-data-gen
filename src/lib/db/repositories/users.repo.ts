import { getDB } from "../client";
import type { User } from "@/types";

export async function createUser(user: User): Promise<void> {
  const db = await getDB();
  await db.add("users", user);
}

export async function getUserByUsername(username: string): Promise<User | undefined> {
  const db = await getDB();
  return db.getFromIndex("users", "by-username", username);
}

export async function getUserById(id: string): Promise<User | undefined> {
  const db = await getDB();
  return db.get("users", id);
}

export async function updateUser(user: User): Promise<void> {
  const db = await getDB();
  await db.put("users", user);
}
