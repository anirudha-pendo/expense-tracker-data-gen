export const TOOL_NAMES = {
  getSpendingSummary: "getSpendingSummary",
  findTransactions: "findTransactions",
  addTransaction: "addTransaction",
  updateTransaction: "updateTransaction",
  deleteTransaction: "deleteTransaction",
} as const;

export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];

export const READ_TOOL_NAMES: readonly ToolName[] = [TOOL_NAMES.getSpendingSummary, TOOL_NAMES.findTransactions];
export const WRITE_TOOL_NAMES: readonly ToolName[] = [
  TOOL_NAMES.addTransaction,
  TOOL_NAMES.updateTransaction,
  TOOL_NAMES.deleteTransaction,
];

const ALL_NAMES: readonly string[] = Object.values(TOOL_NAMES);

export function isToolName(value: string): value is ToolName {
  return ALL_NAMES.includes(value);
}

export function isWriteToolName(name: ToolName): boolean {
  return WRITE_TOOL_NAMES.includes(name);
}
