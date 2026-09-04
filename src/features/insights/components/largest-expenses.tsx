import { BpBox } from "@/shared/components/bp-box";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Category, Transaction } from "@/types";

interface LargestExpensesProps {
  transactions: Transaction[];
  categories: Category[];
  currency: string;
  locale: string;
}

export function LargestExpenses({ transactions, categories, currency, locale }: LargestExpensesProps) {
  const catMap = new Map(categories.map((c) => [c.id, c]));

  return (
    <BpBox className="stagger-item">
      <div className="border-b border-border/40 px-5 py-3">
        <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
          Largest Expenses · This Month
        </span>
      </div>
      <div className="p-5">
        {transactions.length === 0 ? (
          <p className="font-mono text-[11px] text-muted-foreground/50 tracking-wider">
            No expenses recorded this month.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {transactions.map((t, idx) => {
              const cat = catMap.get(t.categoryId);
              return (
                <div key={t.id} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-[10px] text-muted-foreground/40 tabular-nums">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm truncate">{t.description}</span>
                      <span className="font-mono text-[10px] text-muted-foreground/60">
                        {cat?.name ?? "Uncategorized"} · {formatDate(t.date, locale)}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-semibold tabular-nums text-red-600 shrink-0">
                    {formatCurrency(t.amount, currency, locale)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </BpBox>
  );
}
