export const TOOL_NAMES = {
  getSpendingSummary: "getSpendingSummary",
  findTransactions: "findTransactions",
  addTransaction: "addTransaction",
  updateTransaction: "updateTransaction",
  deleteTransaction: "deleteTransaction",
} as const;

export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];

const ALL_NAMES: readonly string[] = Object.values(TOOL_NAMES);

export function isToolName(value: string): value is ToolName {
  return ALL_NAMES.includes(value);
}
