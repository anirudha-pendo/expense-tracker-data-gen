import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { createTransaction, getTransactionsByWorkspaceId } from "@/lib/db/repositories/transactions.repo";
import { getCategoriesByWorkspaceId } from "@/lib/db/repositories/categories.repo";
import { notifyBudgetThreshold } from "@/features/transactions/hooks/use-transactions";
import { emitDataChanged } from "@/shared/lib/data-events";
import { parseQuickAdd, type ParsedQuickAdd } from "../lib/parser";
import type { Category, Transaction } from "@/types";

export interface UseQuickAddReturn {
  input: string;
  setInput: (value: string) => void;
  parsed: ParsedQuickAdd;
  categories: Category[];
  /** User-selected category override (wins over inference). */
  overrideCategory: Category | null;
  setOverrideCategory: (category: Category | null) => void;
  effectiveCategory: Category | null;
  isSaving: boolean;
  canSave: boolean;
  save: () => Promise<void>;
}

export function useQuickAdd(workspaceId: string, open: boolean): UseQuickAddReturn {
  const [input, setInput] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [overrideCategory, setOverrideCategory] = useState<Category | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Lazy-load history on first open; reset the input each time it opens.
  useEffect(() => {
    if (!open) return;
    setInput("");
    setOverrideCategory(null);
    if (hasLoaded) return;
    (async () => {
      const [txs, cats] = await Promise.all([
        getTransactionsByWorkspaceId(workspaceId),
        getCategoriesByWorkspaceId(workspaceId),
      ]);
      setTransactions(txs);
      setCategories(cats);
      setHasLoaded(true);
    })();
  }, [open, hasLoaded, workspaceId]);

  const parsed = useMemo(
    () => parseQuickAdd(input, { categories, transactions }),
    [input, categories, transactions]
  );

  const effectiveCategory = overrideCategory ?? parsed.category;
  const canSave = parsed.amount !== null && effectiveCategory !== null && !isSaving;

  const save = useCallback(async () => {
    if (parsed.amount === null || !effectiveCategory) return;
    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const type = overrideCategory
        ? overrideCategory.scope === "income"
          ? "income"
          : overrideCategory.scope === "expense"
            ? "expense"
            : parsed.type
        : parsed.type;
      const tx: Transaction = {
        id: crypto.randomUUID(),
        workspaceId,
        type,
        amount: parsed.amount,
        categoryId: effectiveCategory.id,
        description: parsed.description || effectiveCategory.name,
        date: parsed.date,
        isRecurring: false,
        notes: "",
        createdAt: now,
        updatedAt: now,
      };
      await createTransaction(tx);
      await notifyBudgetThreshold(workspaceId, tx, transactions, categories);
      // Keep local history fresh so the next entry's inference sees this one.
      setTransactions((prev) => [tx, ...prev]);
      setInput("");
      setOverrideCategory(null);
      emitDataChanged();
      toast.success(`Added: ${tx.description}`);
    } catch {
      toast.error("Failed to add transaction");
    } finally {
      setIsSaving(false);
    }
  }, [parsed, effectiveCategory, overrideCategory, workspaceId, transactions, categories]);

  return {
    input,
    setInput,
    parsed,
    categories,
    overrideCategory,
    setOverrideCategory,
    effectiveCategory,
    isSaving,
    canSave,
    save,
  };
}
