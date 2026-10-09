import { getCategoriesByWorkspaceId } from "@/lib/db/repositories/categories.repo";
import { getTransactionsByWorkspaceId } from "@/lib/db/repositories/transactions.repo";
import type {
  FindTransactionsInput,
  FindTransactionsOutput,
  GetSpendingSummaryInput,
  GetSpendingSummaryOutput,
} from "../contract/types";
import type { Validation } from "../lib/categories";
import type { MoneyFormat } from "../lib/money";
import { findTransactionsIn, summarizeSpending } from "../lib/spending";

export interface ToolSession {
  workspaceId: string;
  money: MoneyFormat;
  today: string;
}

async function loadWorkspace(workspaceId: string) {
  const [transactions, categories] = await Promise.all([
    getTransactionsByWorkspaceId(workspaceId),
    getCategoriesByWorkspaceId(workspaceId),
  ]);
  return { transactions, categories };
}

export async function runGetSpendingSummary(
  session: ToolSession,
  input: GetSpendingSummaryInput,
): Promise<Validation<GetSpendingSummaryOutput>> {
  const data = await loadWorkspace(session.workspaceId);
  return summarizeSpending({ input, ...data, workspaceId: session.workspaceId, money: session.money });
}

export async function runFindTransactions(
  session: ToolSession,
  input: FindTransactionsInput,
): Promise<Validation<FindTransactionsOutput>> {
  const data = await loadWorkspace(session.workspaceId);
  return findTransactionsIn({ input, ...data, workspaceId: session.workspaceId, money: session.money });
}
