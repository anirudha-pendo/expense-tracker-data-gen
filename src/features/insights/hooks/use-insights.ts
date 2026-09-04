import { useCallback, useEffect, useMemo, useState } from "react";
import { getTransactionsByWorkspaceId } from "@/lib/db/repositories/transactions.repo";
import { getCategoriesByWorkspaceId } from "@/lib/db/repositories/categories.repo";
import { getBudgetsByWorkspaceId } from "@/lib/db/repositories/budgets.repo";
import { useDataChanged } from "@/shared/lib/data-events";
import {
  computeHealthScore,
  detectAnomalies,
  forecastEndOfMonth,
  largestExpenses,
  monthOverMonthDeltas,
  type Anomaly,
  type CategoryDelta,
  type Forecast,
  type HealthScore,
} from "../lib/insights-engine";
import type { Budget, Category, Transaction } from "@/types";

export interface Insights {
  forecast: Forecast;
  deltas: CategoryDelta[];
  anomalies: Anomaly[];
  largest: Transaction[];
  health: HealthScore;
  categories: Category[];
  hasTransactions: boolean;
  isLoading: boolean;
}

export function useInsights(workspaceId: string): Insights {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [txs, cats, buds] = await Promise.all([
        getTransactionsByWorkspaceId(workspaceId),
        getCategoriesByWorkspaceId(workspaceId),
        getBudgetsByWorkspaceId(workspaceId),
      ]);
      setTransactions(txs);
      setCategories(cats);
      setBudgets(buds);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  useDataChanged(load);

  return useMemo(() => {
    const now = new Date();
    return {
      forecast: forecastEndOfMonth(transactions, now),
      deltas: monthOverMonthDeltas(transactions, categories, now),
      anomalies: detectAnomalies(transactions, categories, now),
      largest: largestExpenses(transactions, now),
      health: computeHealthScore(transactions, budgets, now),
      categories,
      hasTransactions: transactions.length > 0,
      isLoading,
    };
  }, [transactions, categories, budgets, isLoading]);
}
