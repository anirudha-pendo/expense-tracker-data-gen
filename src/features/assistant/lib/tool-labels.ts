import { isToolName, type ToolName } from "../contract/tool-names.js";
import type { MessageLike, PartLike } from "./conversation.js";

export type ToolRowState = "running" | "done" | "cancelled" | "error";
export type WriteToolName = "addTransaction" | "updateTransaction" | "deleteTransaction";

const LABELS: Record<ToolName, { running: string; done: string }> = {
  getSpendingSummary: { running: "Checking spending…", done: "Checked spending" },
  findTransactions: { running: "Searching transactions…", done: "Found transactions" },
  addTransaction: { running: "Preparing transaction…", done: "Transaction confirmed" },
  updateTransaction: { running: "Preparing edit…", done: "Edit confirmed" },
  deleteTransaction: { running: "Preparing delete…", done: "Delete confirmed" },
};

export const WRITE_CARD_TITLES: Record<WriteToolName, string> = {
  addTransaction: "Add transaction",
  updateTransaction: "Edit transaction",
  deleteTransaction: "Delete transaction",
};

export function toolNameFromPartType(type: string): ToolName | null {
  if (!type.startsWith("tool-")) return null;
  const name = type.slice("tool-".length);
  return isToolName(name) ? name : null;
}

export function isCancelledOutput(output: unknown): boolean {
  return typeof output === "object" && output !== null && "status" in output && output.status === "cancelled";
}

export function toolRowState(part: PartLike): ToolRowState {
  if (part.state === "output-error") return "error";
  if (part.state !== "output-available") return "running";
  return isCancelledOutput(part.output) ? "cancelled" : "done";
}

function totalMatches(output: unknown): number {
  if (typeof output === "object" && output !== null && "totalMatches" in output && typeof output.totalMatches === "number") {
    return output.totalMatches;
  }
  return 0;
}

export function toolRowLabel(tool: ToolName, state: ToolRowState, output: unknown): string {
  if (state === "cancelled") return "Cancelled";
  if (state === "error") return "Couldn't complete";
  if (state === "running") return LABELS[tool].running;
  if (tool === "findTransactions") {
    const n = totalMatches(output);
    return `Found ${n} ${n === 1 ? "transaction" : "transactions"}`;
  }
  return LABELS[tool].done;
}

export function announcementFor(last: MessageLike | undefined, pendingTitles: readonly string[]): string {
  const pending = pendingTitles.at(-1);
  if (pending !== undefined) return `Confirmation needed: ${pending}`;
  if (last === undefined) return "";
  for (let i = last.parts.length - 1; i >= 0; i--) {
    const part = last.parts[i];
    const tool = toolNameFromPartType(part.type);
    if (tool !== null) return toolRowLabel(tool, toolRowState(part), part.output);
  }
  return "";
}
