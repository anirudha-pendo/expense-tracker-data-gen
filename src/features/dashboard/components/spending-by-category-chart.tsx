import { Cell, Pie, PieChart, Tooltip, ResponsiveContainer } from "recharts";
import { BpBox } from "@/shared/components/bp-box";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import type { CategorySpend } from "../hooks/use-dashboard-stats";

interface SpendingByCategoryChartProps {
  data: CategorySpend[];
  currency: string;
  locale: string;
  isLoading: boolean;
}

function CustomTooltip({ active, payload, currency, locale }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { color: string } }>;
  currency: string;
  locale: string;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="border border-border/60 bg-card px-3 py-2 card-shadow text-xs font-mono">
      <div className="flex items-center gap-2 mb-1">
        <span className="size-1.5 inline-block shrink-0" style={{ backgroundColor: item.payload.color }} />
        <span className="text-muted-foreground">{item.name}</span>
      </div>
      <p className="font-semibold tabular-nums tracking-tight text-foreground">
        {formatCurrency(item.value, currency, locale)}
      </p>
    </div>
  );
}

export function SpendingByCategoryChart({ data, currency, locale, isLoading }: SpendingByCategoryChartProps) {
  if (isLoading) {
    return (
      <BpBox>
        <div className="border-b border-border/40 px-5 py-3">
          <Skeleton className="h-3 w-36" />
        </div>
        <div className="p-5">
          <Skeleton className="h-52 w-full" />
        </div>
      </BpBox>
    );
  }

  const total = data.reduce((sum, d) => sum + d.amount, 0);

  return (
    <BpBox className="section-enter">
      <div className="border-b border-border/40 px-5 py-3 flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
          Spending by Category
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/40">this month</span>
      </div>

      <div className="p-5">
        {data.length === 0 ? (
          <div className="flex h-52 items-center justify-center">
            <p className="font-mono text-[11px] text-muted-foreground/50 tracking-wider">
              No expense data yet.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-6">
            {/* Donut */}
            <div className="relative shrink-0">
              <ResponsiveContainer width={150} height={150}>
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={44}
                    outerRadius={68}
                    paddingAngle={2}
                    dataKey="amount"
                    nameKey="name"
                    strokeWidth={0}
                  >
                    {data.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={(props) => (
                      <CustomTooltip
                        active={props.active}
                        payload={props.payload as unknown as Array<{ name: string; value: number; payload: { color: string } }>}
                        currency={currency}
                        locale={locale}
                      />
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="font-mono text-[9px] text-muted-foreground/50 tracking-wider uppercase">total</p>
                <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
                  {formatCurrency(total, currency, locale)}
                </p>
              </div>
            </div>

            {/* Legend */}
            <div className="flex flex-col gap-1.5 flex-1 min-w-0 overflow-y-auto max-h-[150px]">
              {data.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2 min-w-0">
                  <span className="size-1.5 rounded-none shrink-0" style={{ backgroundColor: entry.color }} />
                  <span className="font-mono text-[10px] text-muted-foreground truncate flex-1">{entry.name}</span>
                  <span className="font-mono text-[10px] font-medium tabular-nums shrink-0 text-foreground">
                    {formatCurrency(entry.amount, currency, locale)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </BpBox>
  );
}
