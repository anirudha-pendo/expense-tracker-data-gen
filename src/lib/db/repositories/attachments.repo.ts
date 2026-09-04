import { getDB } from "../client";
import type { Attachment } from "@/types";

export async function createAttachment(attachment: Attachment): Promise<void> {
  const db = await getDB();
  await db.add("attachments", attachment);
}

export async function getAttachmentsByTransactionId(transactionId: string): Promise<Attachment[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("attachments", "by-transactionId", transactionId);
  return all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export async function deleteAttachment(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("attachments", id);
}

export async function deleteAttachmentsByTransactionId(transactionId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("attachments", "readwrite");
  let cursor = await tx.store.index("by-transactionId").openKeyCursor(transactionId);
  while (cursor) {
    await tx.store.delete(cursor.primaryKey);
    cursor = await cursor.continue();
  }
  await tx.done;
}

// Index counts never materialize record values, so blobs are not loaded
// just to render attachment badges in the transaction list.
export async function getAttachmentCounts(transactionIds: string[]): Promise<Map<string, number>> {
  const db = await getDB();
  const counts = new Map<string, number>();
  const tx = db.transaction("attachments", "readonly");
  const index = tx.store.index("by-transactionId");
  await Promise.all(
    transactionIds.map(async (id) => {
      const count = await index.count(id);
      if (count > 0) counts.set(id, count);
    })
  );
  await tx.done;
  return counts;
}
