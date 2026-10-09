import { isInMonth, parseCalendarDate } from "@/lib/dates";
import type { Budget, Transaction } from "@/types";

export const WARNING_THRESHOLD = 0.8;
export const OVER_THRESHOLD = 1.0;

export interface BudgetThresholdAlert {
  categoryId: string;
  level: "warning" | "over";
  spent: number;
  monthlyLimit: number;
}

export function sumCategoryMonthSpend(
  transactions: Transaction[],
  categoryId: string,
  monthOf: Date
): number {
  return transactions
    .filter((t) => t.type === "expense" && t.categoryId === categoryId && isInMonth(t.date, monthOf))
    .reduce((sum, t) => sum + t.amount, 0);
}

// Returns the threshold newly crossed by adding `newTransaction` to the month,
// or null if no boundary was crossed. `transactions` must NOT yet include the
// new transaction. Pure so both the transaction form and Quick Add can use it.
export function checkBudgetThresholds(
  newTransaction: Pick<Transaction, "type" | "categoryId" | "amount" | "date">,
  budgets: Budget[],
  transactions: Transaction[]
): BudgetThresholdAlert | null {
  if (newTransaction.type !== "expense") return null;
  const budget = budgets.find((b) => b.categoryId === newTransaction.categoryId);
  if (!budget || budget.monthlyLimit <= 0) return null;

  const txDate = parseCalendarDate(newTransaction.date);
  const before = sumCategoryMonthSpend(transactions, newTransaction.categoryId, txDate);
  const after = before + newTransaction.amount;

  const beforeRatio = before / budget.monthlyLimit;
  const afterRatio = after / budget.monthlyLimit;

  if (beforeRatio <= OVER_THRESHOLD && afterRatio > OVER_THRESHOLD) {
    return { categoryId: budget.categoryId, level: "over", spent: after, monthlyLimit: budget.monthlyLimit };
  }
  if (beforeRatio < WARNING_THRESHOLD && afterRatio >= WARNING_THRESHOLD) {
    return { categoryId: budget.categoryId, level: "warning", spent: after, monthlyLimit: budget.monthlyLimit };
  }
  return null;
}
