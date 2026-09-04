import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import { useAuthContext } from "@/features/auth/hooks/auth-context";
import { useBudgets } from "../hooks/use-budgets";
import type { Category } from "@/types";

interface BudgetRowFormProps {
  category: Category;
  currentLimit: number | null;
  currency: string;
  locale: string;
  onSave: (categoryId: string, limit: number) => Promise<void>;
  onClear: (() => Promise<void>) | null;
}

function BudgetRowForm({ category, currentLimit, currency, locale, onSave, onClear }: BudgetRowFormProps) {
  const [value, setValue] = useState(currentLimit !== null ? String(currentLimit) : "");
  const [isSaving, setIsSaving] = useState(false);

  const parsed = Number(value);
  const isDirty = value !== (currentLimit !== null ? String(currentLimit) : "");
  const isValid = value !== "" && Number.isFinite(parsed) && parsed > 0;

  async function handleSave() {
    if (!isValid) {
      toast.error("Budget must be greater than 0");
      return;
    }
    setIsSaving(true);
    try {
      await onSave(category.id, parsed);
      toast.success(`Budget set for ${category.name}`);
    } catch {
      toast.error("Failed to save budget");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleClear() {
    if (!onClear) return;
    setIsSaving(true);
    try {
      await onClear();
      setValue("");
      toast.success(`Budget cleared for ${category.name}`);
    } catch {
      toast.error("Failed to clear budget");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex items-center justify-between py-2.5 gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="size-3 rounded-full shrink-0" style={{ backgroundColor: category.color }} />
        <span className="text-sm truncate">{category.name}</span>
        {currentLimit !== null && (
          <span className="font-mono text-[10px] text-muted-foreground/60 shrink-0">
            {formatCurrency(currentLimit, currency, locale)}/mo
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Input
          type="number"
          step="0.01"
          min="0.01"
          placeholder="No limit"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-28 h-8 font-mono text-sm"
          aria-label={`Monthly budget for ${category.name}`}
        />
        <Button size="sm" variant="outline" className="h-8" onClick={handleSave} disabled={isSaving || !isDirty || !isValid}>
          {isSaving ? <Loader2 className="size-3 animate-spin" /> : "Set"}
        </Button>
        {onClear && (
          <Button
            size="icon"
            variant="ghost"
            className="size-8 text-destructive hover:text-destructive"
            onClick={handleClear}
            disabled={isSaving}
            aria-label={`Clear budget for ${category.name}`}
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function BudgetManager() {
  const { workspace } = useAuthContext();
  const { budgets, expenseCategories, isLoading, saveBudget, removeBudget } = useBudgets(workspace!.id);

  const currency = workspace?.currency ?? "USD";
  const locale = workspace?.locale ?? "en-US";

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  const budgetByCategory = new Map(budgets.map((b) => [b.categoryId, b]));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Set monthly spending limits per category. You&apos;ll be alerted at 80% and when a budget is exceeded.
      </p>
      <div className="rounded-lg border px-4">
        <div className="flex flex-col">
          {expenseCategories.map((cat, idx) => {
            const budget = budgetByCategory.get(cat.id);
            return (
              /* Key includes the saved limit so the row's local input resets
                 when the budget changes from elsewhere (e.g. another reload). */
              <div key={`${cat.id}-${budget?.monthlyLimit ?? "none"}`}>
                <BudgetRowForm
                  category={cat}
                  currentLimit={budget ? budget.monthlyLimit : null}
                  currency={currency}
                  locale={locale}
                  onSave={saveBudget}
                  onClear={budget ? () => removeBudget(budget.id) : null}
                />
                {idx < expenseCategories.length - 1 && <Separator />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
