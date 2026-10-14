// Regression test for APP-173132: verify that deleteTransaction cascades to
// remove every associated attachment, and that unrelated attachments survive.
//
// Run with: cd bot && npm run test:cascade
//
// Requires root node_modules (for the `idb` package that client.ts imports).

import "fake-indexeddb/auto";
import assert from "node:assert/strict";

import {
  createTransaction,
  deleteTransaction,
  getTransactionById,
} from "../src/lib/db/repositories/transactions.repo";
import {
  createAttachment,
  getAttachmentsByTransactionId,
} from "../src/lib/db/repositories/attachments.repo";
import type { Attachment, Transaction } from "../src/types";

function makeTx(id: string): Transaction {
  const now = new Date().toISOString();
  return {
    id,
    workspaceId: "ws-1",
    type: "expense",
    amount: 42,
    categoryId: "cat-1",
    description: `tx-${id}`,
    date: "2025-06-01",
    isRecurring: false,
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
}

function makeAtt(id: string, transactionId: string): Attachment {
  return {
    id,
    workspaceId: "ws-1",
    transactionId,
    name: `receipt-${id}.png`,
    mimeType: "image/png",
    size: 128,
    blob: new Blob(["x"]),
    createdAt: new Date().toISOString(),
  };
}

async function run(): Promise<void> {
  // ── setup ──
  await createTransaction(makeTx("t1"));
  await createTransaction(makeTx("t2"));

  await createAttachment(makeAtt("a1", "t1"));
  await createAttachment(makeAtt("a2", "t1"));
  await createAttachment(makeAtt("a3", "t1"));
  await createAttachment(makeAtt("a4", "t2")); // belongs to a different transaction

  // sanity-check the setup
  const before = await getAttachmentsByTransactionId("t1");
  assert.equal(before.length, 3, "t1 should start with 3 attachments");
  const otherBefore = await getAttachmentsByTransactionId("t2");
  assert.equal(otherBefore.length, 1, "t2 should start with 1 attachment");

  // ── act ──
  await deleteTransaction("t1");

  // ── assert: cascade ──
  const txAfter = await getTransactionById("t1");
  assert.equal(txAfter, undefined, "t1 record should be gone");

  const attsAfter = await getAttachmentsByTransactionId("t1");
  assert.equal(attsAfter.length, 0, "all t1 attachments should be cascade-deleted");

  // ── assert: isolation ──
  const t2After = await getTransactionById("t2");
  assert.ok(t2After, "t2 record should still exist");

  const otherAfter = await getAttachmentsByTransactionId("t2");
  assert.equal(otherAfter.length, 1, "t2 attachment should be unchanged");

  console.log("✓ deleteTransaction cascades to all associated attachments");
  console.log("✓ unrelated transaction and its attachments are preserved");
}

run().then(
  () => {
    console.log("\nAll cascade-delete checks passed.");
    process.exit(0);
  },
  (err: unknown) => {
    console.error("Cascade-delete check failed:", err);
    process.exit(1);
  },
);
