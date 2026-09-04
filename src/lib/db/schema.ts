import type { DBSchema } from "idb";
import type { Attachment, Budget, Category, Goal, Transaction, User, Workspace } from "@/types";

export interface ExpenseTrackerDBSchema extends DBSchema {
  users: {
    key: string;
    value: User;
    indexes: {
      "by-username": string;
    };
  };
  workspaces: {
    key: string;
    value: Workspace;
    indexes: {
      "by-userId": string;
    };
  };
  transactions: {
    key: string;
    value: Transaction;
    indexes: {
      "by-workspaceId": string;
      "by-date": string;
    };
  };
  categories: {
    key: string;
    value: Category;
    indexes: {
      "by-workspaceId": string;
    };
  };
  goals: {
    key: string;
    value: Goal;
    indexes: {
      "by-workspaceId": string;
    };
  };
  budgets: {
    key: string;
    value: Budget;
    indexes: {
      "by-workspaceId": string;
      "by-categoryId": string;
    };
  };
  attachments: {
    key: string;
    value: Attachment;
    indexes: {
      "by-workspaceId": string;
      "by-transactionId": string;
    };
  };
}
