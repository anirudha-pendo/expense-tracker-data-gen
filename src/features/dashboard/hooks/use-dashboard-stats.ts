import { useCallback, useEffect, useState } from "react";
import { getTransactionsByWorkspaceId } from "@/lib/db/repositories/transactions.repo";
import { getCategoriesByWorkspaceId } from "@/lib/db/repositories/categories.repo";
import { useDataChanged } from "@/shared/lib/data-events";
import type { Category, Transaction } from "@/types";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";

export interface SummaryStats {
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
}

export interface CategorySpend {
  name: string;
  amount: number;
  color: string;
}

export interface MonthlyTrend {
  month: string;
  income: number;
  expenses: number;
}

export interface DashboardStats {
  summary: SummaryStats;
  categoryBreakdown: CategorySpend[];
  monthlyTrend: MonthlyTrend[];
  recentTransactions: (Transaction & { categoryName: string; categoryColor: string })[];
  isLoading: boolean;
}

export function useDashboardStats(workspaceId: string): DashboardStats {
  const [isLoading, setIsLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [txs, cats] = await Promise.all([
        getTransactionsByWorkspaceId(workspaceId),
        getCategoriesByWorkspaceId(workspaceId),
      ]);
      setTransactions(txs);
      setCategories(cats);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  useDataChanged(load);

  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const thisMonthTxs = transactions.filter((t) => {
    const d = new Date(t.date);
    return d >= monthStart && d <= monthEnd;
  });

  const totalIncome = thisMonthTxs
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpenses = thisMonthTxs
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  const categorySpendMap = new Map<string, number>();
  thisMonthTxs
    .filter((t) => t.type === "expense")
    .forEach((t) => {
      categorySpendMap.set(t.categoryId, (categorySpendMap.get(t.categoryId) ?? 0) + t.amount);
    });

  const categoryBreakdown: CategorySpend[] = Array.from(categorySpendMap.entries())
    .map(([id, amount]) => {
      const cat = categoryMap.get(id);
      return { name: cat?.name ?? "Unknown", amount, color: cat?.color ?? "#6b7280" };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);

  const monthlyTrend: MonthlyTrend[] = Array.from({ length: 6 }, (_, i) => {
    const date = subMonths(now, 5 - i);
    const start = startOfMonth(date);
    const end = endOfMonth(date);
    const monthTxs = transactions.filter((t) => {
      const d = new Date(t.date);
      return d >= start && d <= end;
    });
    return {
      month: format(date, "MMM"),
      income: monthTxs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
      expenses: monthTxs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
    };
  });

  const recentTransactions = transactions.slice(0, 8).map((t) => {
    const cat = categoryMap.get(t.categoryId);
    return {
      ...t,
      categoryName: cat?.name ?? "Uncategorized",
      categoryColor: cat?.color ?? "#6b7280",
    };
  });

  return {
    summary: { totalIncome, totalExpenses, netBalance: totalIncome - totalExpenses },
    categoryBreakdown,
    monthlyTrend,
    recentTransactions,
    isLoading,
  };
}
