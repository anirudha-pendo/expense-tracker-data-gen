import type { CategoryScope, TransactionType } from "../../../types/index.js";

export interface AssistantContextCategory {
  name: string;
  scope: CategoryScope;
}

export interface AssistantContext {
  today: string;
  timeZone: string;
  currency: string;
  locale: string;
  categories: AssistantContextCategory[];
}

export interface GetSpendingSummaryInput {
  from: string;
  to: string;
  type?: TransactionType;
  categoryName?: string;
}

export interface SpendingRow {
  name: string;
  total: number;
  totalFormatted: string;
  count: number;
}

export interface GetSpendingSummaryOutput {
  period: { from: string; to: string; fromFormatted: string; toFormatted: string };
  type: TransactionType;
  categoryName: string | null;
  total: number;
  totalFormatted: string;
  count: number;
  byCategory: SpendingRow[];
}

export interface FindTransactionsInput {
  text?: string;
  categoryName?: string;
  type?: TransactionType;
  from?: string;
  to?: string;
  minAmount?: number;
  maxAmount?: number;
  limit?: number;
}

export interface FoundTransaction {
  id: string;
  date: string;
  dateFormatted: string;
  description: string;
  categoryName: string;
  type: TransactionType;
  amount: number;
  amountFormatted: string;
}

export interface FindTransactionsOutput {
  totalMatches: number;
  transactions: FoundTransaction[];
}

export interface AddTransactionInput {
  amount: number;
  type?: TransactionType;
  categoryName: string;
  description: string;
  date?: string;
  notes?: string;
}

export interface UpdateTransactionInput {
  transactionId: string;
  amount?: number;
  type?: TransactionType;
  categoryName?: string;
  description?: string;
  date?: string;
  notes?: string;
}

export interface DeleteTransactionInput {
  transactionId: string;
}

export type CancelReason = "user" | "superseded";

export type WriteToolOutput = { status: "confirmed"; id: string } | { status: "cancelled"; reason: CancelReason };

export interface AssistantMessageMetadata {
  model?: string;
  promptVersion?: string;
  stopped?: boolean;
}
