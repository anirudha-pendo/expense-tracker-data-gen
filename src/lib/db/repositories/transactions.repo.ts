import { getDB } from "../client";
import type { Transaction } from "@/types";

export async function createTransaction(transaction: Transaction): Promise<void> {
  const db = await getDB();
  await db.add("transactions", transaction);
}

export async function getTransactionsByWorkspaceId(workspaceId: string): Promise<Transaction[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("transactions", "by-workspaceId", workspaceId);
  return all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function updateTransaction(transaction: Transaction): Promise<void> {
  const db = await getDB();
  await db.put("transactions", transaction);
}

export async function deleteTransaction(id: string): Promise<void> {
  const db = await getDB();
  // Cascade: remove the transaction and its receipt attachments atomically.
  const tx = db.transaction(["transactions", "attachments"], "readwrite");
  await tx.objectStore("transactions").delete(id);
  const attachmentStore = tx.objectStore("attachments");
  let cursor = await attachmentStore.index("by-transactionId").openKeyCursor(id);
  while (cursor) {
    await attachmentStore.delete(cursor.primaryKey);
    cursor = await cursor.continue();
  }
  await tx.done;
}
