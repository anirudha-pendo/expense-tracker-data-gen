import { toast } from "sonner";
import { notifyBudgetThreshold } from "@/features/transactions/hooks/use-transactions";
import { getAttachmentCounts } from "@/lib/db/repositories/attachments.repo";
import { getCategoriesByWorkspaceId } from "@/lib/db/repositories/categories.repo";
import {
  createTransaction,
  deleteTransaction,
  getTransactionById,
  getTransactionsByWorkspaceId,
  updateTransaction,
} from "@/lib/db/repositories/transactions.repo";
import { emitDataChanged } from "@/shared/lib/data-events";
import type { Transaction } from "@/types";
import type {
  AddTransactionInput,
  DeleteTransactionInput,
  FindTransactionsInput,
  FindTransactionsOutput,
  GetSpendingSummaryInput,
  GetSpendingSummaryOutput,
  UpdateTransactionInput,
} from "../contract/types";
import type { Validation } from "../lib/categories";
import type { MoneyFormat } from "../lib/money";
import { findTransactionsIn, summarizeSpending } from "../lib/spending";
import {
  buildAddProposal,
  buildDeleteProposal,
  buildUpdateProposal,
  type AddProposal,
  type DeleteProposal,
  type TransactionProposal,
  type UpdateProposal,
} from "../lib/transaction-proposals";

export interface ToolSession {
  workspaceId: string;
  money: MoneyFormat;
  today: string;
}

export class StaleWriteError extends Error {}

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

export async function prepareAdd(session: ToolSession, input: AddTransactionInput): Promise<Validation<AddProposal>> {
  const categories = await getCategoriesByWorkspaceId(session.workspaceId);
  return buildAddProposal(input, { categories, today: session.today, money: session.money });
}

export async function prepareUpdate(
  session: ToolSession,
  input: UpdateTransactionInput,
  seenIds: ReadonlySet<string>,
): Promise<Validation<UpdateProposal>> {
  const [categories, before] = await Promise.all([
    getCategoriesByWorkspaceId(session.workspaceId),
    getTransactionById(input.transactionId),
  ]);
  return buildUpdateProposal(input, { categories, before, seenIds, workspaceId: session.workspaceId, money: session.money });
}

export async function prepareDelete(
  session: ToolSession,
  input: DeleteTransactionInput,
  seenIds: ReadonlySet<string>,
): Promise<Validation<DeleteProposal>> {
  const [categories, transaction, counts] = await Promise.all([
    getCategoriesByWorkspaceId(session.workspaceId),
    getTransactionById(input.transactionId),
    getAttachmentCounts([input.transactionId]),
  ]);
  return buildDeleteProposal(input, {
    categories,
    transaction,
    seenIds,
    workspaceId: session.workspaceId,
    attachmentCount: counts.get(input.transactionId) ?? 0,
  });
}

async function currentOrStale(id: string, workspaceId: string, updatedAt: string): Promise<Transaction> {
  const current = await getTransactionById(id);
  if (current === undefined || current.workspaceId !== workspaceId || current.updatedAt !== updatedAt) {
    throw new StaleWriteError("This transaction changed since the card was shown. Look it up again.");
  }
  return current;
}

function reportThreshold(task: Promise<void>): void {
  task.catch((error: unknown) => console.error("assistant: budget threshold check failed", error));
}

// Same repositories, refresh event and budget alerts as Quick Add and the transaction form.
export async function applyTransactionProposal(workspaceId: string, proposal: TransactionProposal): Promise<string> {
  switch (proposal.kind) {
    case "add": {
      const { transactions: prior, categories } = await loadWorkspace(workspaceId);
      const now = new Date().toISOString();
      const tx: Transaction = {
        id: crypto.randomUUID(),
        workspaceId,
        ...proposal.draft,
        isRecurring: false,
        createdAt: now,
        updatedAt: now,
      };
      try {
        await createTransaction(tx);
      } catch (error) {
        toast.error("Failed to add transaction");
        throw error;
      }
      emitDataChanged();
      toast.success(`Added: ${tx.description}`);
      reportThreshold(notifyBudgetThreshold(workspaceId, tx, prior, categories));
      return tx.id;
    }
    case "update": {
      await currentOrStale(proposal.before.id, workspaceId, proposal.before.updatedAt);
      const { transactions, categories } = await loadWorkspace(workspaceId);
      const updated: Transaction = { ...proposal.after, updatedAt: new Date().toISOString() };
      try {
        await updateTransaction(updated);
      } catch (error) {
        toast.error("Failed to update transaction");
        throw error;
      }
      emitDataChanged();
      toast.success(`Updated: ${updated.description}`);
      reportThreshold(
        notifyBudgetThreshold(
          workspaceId,
          updated,
          transactions.filter((t) => t.id !== updated.id),
          categories,
        ),
      );
      return updated.id;
    }
    case "delete": {
      const current = await currentOrStale(proposal.transaction.id, workspaceId, proposal.transaction.updatedAt);
      try {
        await deleteTransaction(current.id);
      } catch (error) {
        toast.error("Failed to delete transaction");
        throw error;
      }
      emitDataChanged();
      toast.success(`Deleted: ${current.description}`);
      return current.id;
    }
  }
}
