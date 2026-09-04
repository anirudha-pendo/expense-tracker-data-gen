export type TransactionType = "income" | "expense";
export type CategoryScope = "income" | "expense" | "both";

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarInitials: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  userId: string;
  name: string;
  currency: string;
  locale: string;
  createdAt: string;
}

export interface Category {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  scope: CategoryScope;
  isDefault: boolean;
}

export interface Transaction {
  id: string;
  workspaceId: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  description: string;
  date: string;
  isRecurring: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  userId: string;
  workspaceId: string;
}

export interface GoalContribution {
  id: string;
  amount: number;
  date: string;
  note?: string;
}

export interface Goal {
  id: string;
  workspaceId: string;
  name: string;
  targetAmount: number;
  deadline?: string;
  color: string;
  icon?: string;
  contributions: GoalContribution[];
  createdAt: string;
  updatedAt: string;
}

export interface Budget {
  id: string;
  workspaceId: string;
  categoryId: string;
  monthlyLimit: number;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  workspaceId: string;
  transactionId: string;
  name: string;
  mimeType: string;
  size: number;
  blob: Blob;
  createdAt: string;
}
