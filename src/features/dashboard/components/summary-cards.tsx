import { BpBox } from "@/shared/components/bp-box";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import type { SummaryStats } from "../hooks/use-dashboard-stats";

interface SummaryCardsProps {
  stats: SummaryStats;
  currency: string;
  locale: string;
  isLoading: boolean;
}

export function SummaryCards({ stats, currency, locale, isLoading }: SummaryCardsProps) {
  const fmt = (amount: number) => formatCurrency(amount, currency, locale);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <BpBox key={i} className="p-5">
            <Skeleton className="h-3 w-16 mb-4" />
            <Skeleton className="h-7 w-28 mb-2" />
            <Skeleton className="h-2.5 w-20" />
          </BpBox>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: "Income",
      value: fmt(stats.totalIncome),
      sub: "this month",
      valueClass: "text-emerald-700",
      marker: "▲",
    },
    {
      label: "Expenses",
      value: fmt(stats.totalExpenses),
      sub: "this month",
      valueClass: "text-red-600",
      marker: "▼",
    },
    {
      label: "Net Balance",
      value: fmt(stats.netBalance),
      sub: "income − expenses",
      valueClass: stats.netBalance >= 0 ? "text-foreground" : "text-red-600",
      marker: stats.netBalance >= 0 ? "=" : "−",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
      {cards.map((card, i) => (
        <BpBox
          key={card.label}
          className={`p-5 stagger-item`}
          style={{ animationDelay: `${i * 50}ms` } as React.CSSProperties}
        >
          {/* Label row */}
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
              {card.label}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground/40 select-none">
              {card.marker}
            </span>
          </div>

          {/* Value */}
          <p className={`font-mono text-2xl font-semibold tabular-nums tracking-tight leading-none mb-2 ${card.valueClass}`}>
            {card.value}
          </p>

          {/* Sub */}
          <p className="font-mono text-[10px] text-muted-foreground/50 tracking-wider">
            {card.sub}
          </p>
        </BpBox>
      ))}
    </div>
  );
}
