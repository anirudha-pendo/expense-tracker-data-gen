import { Link } from "react-router-dom";
import { ArrowRight, Repeat2 } from "lucide-react";
import { BpBox } from "@/shared/components/bp-box";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/format";
import type { DashboardStats } from "../hooks/use-dashboard-stats";

interface RecentTransactionsProps {
  transactions: DashboardStats["recentTransactions"];
  currency: string;
  locale: string;
  isLoading: boolean;
}

export function RecentTransactions({ transactions, currency, locale, isLoading }: RecentTransactionsProps) {
  if (isLoading) {
    return (
      <BpBox>
        <div className="border-b border-border/40 px-5 py-3">
          <Skeleton className="h-3 w-36" />
        </div>
        <div className="divide-y divide-border/40">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5">
              <Skeleton className="size-6 shrink-0" />
              <div className="flex-1">
                <Skeleton className="h-3 w-32 mb-1.5" />
                <Skeleton className="h-2.5 w-20" />
              </div>
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </BpBox>
    );
  }

  return (
    <BpBox className="section-enter">
      <div className="border-b border-foreground/20 px-5 py-3 flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
          Recent Transactions
        </span>
        <Link
          to="/transactions"
          className="font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors duration-150 flex items-center gap-1 uppercase tracking-wider btn-press"
        >
          View all
          <ArrowRight className="size-3" />
        </Link>
      </div>

      {transactions.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="font-mono text-[11px] text-muted-foreground/50 tracking-wider">
            No transactions yet.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-foreground/8">
          {transactions.map((t, idx) => (
            <div
              key={t.id}
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/40 transition-colors duration-150 stagger-item"
              style={{ animationDelay: `${idx * 35}ms` } as React.CSSProperties}
            >
              {/* Category color square */}
              <div
                className="size-2 shrink-0"
                style={{ backgroundColor: t.categoryColor }}
              />

              {/* Description + meta */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">{t.description}</span>
                  {t.isRecurring && (
                    <Repeat2 className="size-3 text-muted-foreground/40 shrink-0" />
                  )}
                </div>
                <p className="font-mono text-[10px] text-muted-foreground/50 mt-0.5">
                  {t.categoryName} · {formatDate(t.date, locale)}
                </p>
              </div>

              {/* Amount */}
              <span
                className={`font-mono text-sm font-semibold tabular-nums shrink-0 ${
                  t.type === "income" ? "text-emerald-700" : "text-red-600"
                }`}
              >
                {t.type === "income" ? "+" : "−"}
                {formatCurrency(t.amount, currency, locale)}
              </span>
            </div>
          ))}
        </div>
      )}
    </BpBox>
  );
}
