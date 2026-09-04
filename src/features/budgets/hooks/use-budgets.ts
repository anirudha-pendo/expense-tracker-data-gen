import { useCallback, useEffect, useState } from "react";
import { deleteBudget, getBudgetsByWorkspaceId, upsertBudget } from "@/lib/db/repositories/budgets.repo";
import { getCategoriesByWorkspaceId } from "@/lib/db/repositories/categories.repo";
import { getTransactionsByWorkspaceId } from "@/lib/db/repositories/transactions.repo";
import { useDataChanged } from "@/shared/lib/data-events";
import { sumCategoryMonthSpend, WARNING_THRESHOLD, OVER_THRESHOLD } from "../lib/budget-alerts";
import type { Budget, Category } from "@/types";

export type BudgetState = "ok" | "warning" | "over";

export interface BudgetRow {
  budget: Budget;
  category: Category;
  spent: number;
  ratio: number;
  state: BudgetState;
}

export interface UseBudgetsReturn {
  rows: BudgetRow[];
  budgets: Budget[];
  expenseCategories: Category[];
  isLoading: boolean;
  saveBudget: (categoryId: string, monthlyLimit: number) => Promise<void>;
  removeBudget: (id: string) => Promise<void>;
  reload: () => Promise<void>;
}

export function useBudgets(workspaceId: string): UseBudgetsReturn {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      const [buds, cats, txs] = await Promise.all([
        getBudgetsByWorkspaceId(workspaceId),
        getCategoriesByWorkspaceId(workspaceId),
        getTransactionsByWorkspaceId(workspaceId),
      ]);
      const catMap = new Map(cats.map((c) => [c.id, c]));
      const now = new Date();

      const computed: BudgetRow[] = buds
        .map((budget) => {
          const category = catMap.get(budget.categoryId);
          if (!category) return null;
          const spent = sumCategoryMonthSpend(txs, budget.categoryId, now);
          const ratio = budget.monthlyLimit > 0 ? spent / budget.monthlyLimit : 0;
          const state: BudgetState =
            ratio > OVER_THRESHOLD ? "over" : ratio >= WARNING_THRESHOLD ? "warning" : "ok";
          return { budget, category, spent, ratio, state };
        })
        .filter((r): r is BudgetRow => r !== null)
        .sort((a, b) => b.ratio - a.ratio);

      setBudgets(buds);
      setCategories(cats);
      setRows(computed);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useDataChanged(reload);

  const saveBudget = useCallback(
    async (categoryId: string, monthlyLimit: number) => {
      const now = new Date().toISOString();
      await upsertBudget({
        id: crypto.randomUUID(),
        workspaceId,
        categoryId,
        monthlyLimit,
        createdAt: now,
        updatedAt: now,
      });
      await reload();
    },
    [workspaceId, reload]
  );

  const removeBudget = useCallback(
    async (id: string) => {
      await deleteBudget(id);
      await reload();
    },
    [reload]
  );

  const expenseCategories = categories.filter((c) => c.scope === "expense" || c.scope === "both");

  return { rows, budgets, expenseCategories, isLoading, saveBudget, removeBudget, reload };
}
