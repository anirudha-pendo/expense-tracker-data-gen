import type { UIDataTypes, UIMessage } from "ai";
import type {
  AddTransactionInput,
  AssistantMessageMetadata,
  DeleteTransactionInput,
  FindTransactionsInput,
  FindTransactionsOutput,
  GetSpendingSummaryInput,
  GetSpendingSummaryOutput,
  UpdateTransactionInput,
  WriteToolOutput,
} from "./contract/types";

export type AssistantUITools = {
  getSpendingSummary: { input: GetSpendingSummaryInput; output: GetSpendingSummaryOutput };
  findTransactions: { input: FindTransactionsInput; output: FindTransactionsOutput };
  addTransaction: { input: AddTransactionInput; output: WriteToolOutput };
  updateTransaction: { input: UpdateTransactionInput; output: WriteToolOutput };
  deleteTransaction: { input: DeleteTransactionInput; output: WriteToolOutput };
};

export type AssistantUIMessage = UIMessage<AssistantMessageMetadata, UIDataTypes, AssistantUITools>;
