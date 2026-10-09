import { z } from "zod";
import { ASSISTANT_LIMITS } from "./limits.js";
import { TOOL_NAMES, type ToolName } from "./tool-names.js";
import type {
  AddTransactionInput,
  DeleteTransactionInput,
  FindTransactionsInput,
  GetSpendingSummaryInput,
  UpdateTransactionInput,
} from "./types.js";

export { TOOL_NAMES } from "./tool-names.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const transactionType = z.enum(["income", "expense"]);
const amount = z.number().positive().max(ASSISTANT_LIMITS.maxAmount);
const categoryName = z.string().trim().min(1).max(40);
const transactionId = z.string().min(1).max(100);

export const getSpendingSummaryInputSchema: z.ZodType<GetSpendingSummaryInput> = z.object({
  from: isoDate.describe("First day, inclusive (YYYY-MM-DD)."),
  to: isoDate.describe("Last day, inclusive (YYYY-MM-DD). Must be on or after from; at most 366 days after it."),
  type: transactionType.optional().describe("expense (default) or income."),
  categoryName: categoryName.optional().describe("Exact category name from the list. Omit for all categories."),
});

export const findTransactionsInputSchema: z.ZodType<FindTransactionsInput> = z.object({
  text: z
    .string()
    .trim()
    .min(1)
    .max(ASSISTANT_LIMITS.searchTextMax)
    .optional()
    .describe("Words to match in the description or notes, case-insensitive."),
  categoryName: categoryName.optional(),
  type: transactionType.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  minAmount: z.number().min(0).max(ASSISTANT_LIMITS.maxAmount).optional(),
  maxAmount: z.number().min(0).max(ASSISTANT_LIMITS.maxAmount).optional(),
  sortBy: z
    .enum(["date", "amount"])
    .optional()
    .describe("date (default) or amount. Use amount for biggest, smallest or top-N questions."),
  order: z.enum(["desc", "asc"]).optional().describe("desc (default): newest or largest first. asc: oldest or smallest first."),
  limit: z.number().int().min(1).max(ASSISTANT_LIMITS.maxListRows).optional().describe("Rows to return, 1-20. Default 10."),
});

export const addTransactionInputSchema: z.ZodType<AddTransactionInput> = z.object({
  amount: amount.describe("Positive amount in the workspace currency."),
  type: transactionType.optional().describe("Omit to infer it from the category."),
  categoryName: categoryName.describe("Exact category name from the list."),
  description: z.string().trim().min(1).max(ASSISTANT_LIMITS.descriptionMax),
  date: isoDate.optional().describe("Defaults to today."),
  notes: z.string().trim().max(ASSISTANT_LIMITS.notesMax).optional(),
});

export const updateTransactionInputSchema: z.ZodType<UpdateTransactionInput> = z.object({
  transactionId: transactionId.describe("An id returned by findTransactions in this conversation."),
  amount: amount.optional(),
  type: transactionType.optional(),
  categoryName: categoryName.optional(),
  description: z.string().trim().min(1).max(ASSISTANT_LIMITS.descriptionMax).optional(),
  date: isoDate.optional(),
  notes: z.string().trim().max(ASSISTANT_LIMITS.notesMax).optional(),
});

export const deleteTransactionInputSchema: z.ZodType<DeleteTransactionInput> = z.object({
  transactionId: transactionId.describe("An id returned by findTransactions in this conversation."),
});

export const TOOL_INPUT_SCHEMAS = {
  getSpendingSummary: getSpendingSummaryInputSchema,
  findTransactions: findTransactionsInputSchema,
  addTransaction: addTransactionInputSchema,
  updateTransaction: updateTransactionInputSchema,
  deleteTransaction: deleteTransactionInputSchema,
} satisfies Record<ToolName, z.ZodType>;

export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  [TOOL_NAMES.getSpendingSummary]:
    "Totals of the user's expenses (default) or income between two dates, overall and per category, with pre-formatted amounts. Use for any how-much or where-did-my-money-go question.",
  [TOOL_NAMES.findTransactions]:
    "Search the user's transactions by text, category, type, date range or amount. Newest first by default; sortBy amount lists the largest (order desc) or smallest (order asc) first. Use it to show transactions and always before editing or deleting one. totalMatches counts every match, returned counts the rows listed; when truncated is true, more matched than are listed, so narrow the search instead of guessing about unlisted rows.",
  [TOOL_NAMES.addTransaction]:
    "Propose a new transaction. The app shows a confirm card; nothing is saved unless the user confirms. Omit type to infer it from the category.",
  [TOOL_NAMES.updateTransaction]:
    "Propose changes to one transaction returned by findTransactions in this conversation. Include only fields that change. The user confirms in the app.",
  [TOOL_NAMES.deleteTransaction]:
    "Propose deleting one transaction returned by findTransactions in this conversation. One transaction per call. The user confirms in the app.",
};
