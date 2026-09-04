import { openDB, type IDBPDatabase } from "idb";
import type { ExpenseTrackerDBSchema } from "./schema";

const DB_NAME = "expense-tracker";
const DB_VERSION = 2;

let dbInstance: IDBPDatabase<ExpenseTrackerDBSchema> | null = null;

export async function getDB(): Promise<IDBPDatabase<ExpenseTrackerDBSchema>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<ExpenseTrackerDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const userStore = db.createObjectStore("users", { keyPath: "id" });
        userStore.createIndex("by-username", "username", { unique: true });

        const workspaceStore = db.createObjectStore("workspaces", { keyPath: "id" });
        workspaceStore.createIndex("by-userId", "userId");

        const transactionStore = db.createObjectStore("transactions", { keyPath: "id" });
        transactionStore.createIndex("by-workspaceId", "workspaceId");
        transactionStore.createIndex("by-date", "date");

        const categoryStore = db.createObjectStore("categories", { keyPath: "id" });
        categoryStore.createIndex("by-workspaceId", "workspaceId");
      }

      if (oldVersion < 2) {
        const goalStore = db.createObjectStore("goals", { keyPath: "id" });
        goalStore.createIndex("by-workspaceId", "workspaceId");

        const budgetStore = db.createObjectStore("budgets", { keyPath: "id" });
        budgetStore.createIndex("by-workspaceId", "workspaceId");
        budgetStore.createIndex("by-categoryId", "categoryId", { unique: true });

        const attachmentStore = db.createObjectStore("attachments", { keyPath: "id" });
        attachmentStore.createIndex("by-workspaceId", "workspaceId");
        attachmentStore.createIndex("by-transactionId", "transactionId");
      }
    },
    // Close this connection if another tab upgrades to a newer version,
    // otherwise the old tab would block the upgrade forever.
    blocking() {
      dbInstance?.close();
      dbInstance = null;
    },
  });

  return dbInstance;
}
