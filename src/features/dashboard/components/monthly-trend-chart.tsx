import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BpBox } from "@/shared/components/bp-box";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import type { MonthlyTrend } from "../hooks/use-dashboard-stats";

interface MonthlyTrendChartProps {
  data: MonthlyTrend[];
  currency: string;
  locale: string;
  isLoading: boolean;
}

const INCOME_COLOR = "#15803d";
const EXPENSE_COLOR = "#b91c1c";
const MUTED = "#999";
const GRID_COLOR = "#e5e5e5";

function CustomTooltip({ active, payload, label, currency, locale }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  currency: string;
  locale: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border border-border/60 bg-card px-3 py-2.5 card-shadow text-xs font-mono">
      <p className="text-muted-foreground tracking-wider uppercase text-[10px] mb-1.5">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-3 justify-between">
          <span className="text-muted-foreground capitalize">{p.name}</span>
          <span className="font-semibold tabular-nums" style={{ color: p.color }}>
            {formatCurrency(p.value, currency, locale)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function MonthlyTrendChart({ data, currency, locale, isLoading }: MonthlyTrendChartProps) {
  if (isLoading) {
    return (
      <BpBox>
        <div className="border-b border-border/40 px-5 py-3">
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="p-5">
          <Skeleton className="h-52 w-full" />
        </div>
      </BpBox>
    );
  }

  return (
    <BpBox className="section-enter">
      <div className="border-b border-border/40 px-5 py-3 flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
          Monthly Trend
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/40">last 6 months</span>
      </div>

      <div className="px-4 pt-4 pb-3">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }} barGap={3}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fill: MUTED, fontFamily: "'Geist Mono Variable', monospace" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: MUTED, fontFamily: "'Geist Mono Variable', monospace" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) =>
                new Intl.NumberFormat(locale, {
                  notation: "compact",
                  currency,
                  style: "currency",
                  maximumFractionDigits: 0,
                }).format(v)
              }
            />
            <Tooltip
              content={(props) => (
                <CustomTooltip
                  active={props.active}
                  payload={props.payload as unknown as Array<{ name: string; value: number; color: string }>}
                  label={props.label as string | undefined}
                  currency={currency}
                  locale={locale}
                />
              )}
              cursor={{ fill: "oklch(0.96 0 0)" }}
            />
            <Bar dataKey="income" fill={INCOME_COLOR} radius={[0, 0, 0, 0]} name="income" />
            <Bar dataKey="expenses" fill={EXPENSE_COLOR} radius={[0, 0, 0, 0]} name="expenses" />
          </BarChart>
        </ResponsiveContainer>

        <div className="flex items-center gap-5 mt-1 justify-end">
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
            <span className="w-3 h-px" style={{ backgroundColor: INCOME_COLOR, display: "inline-block" }} />
            income
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
            <span className="w-3 h-px" style={{ backgroundColor: EXPENSE_COLOR, display: "inline-block" }} />
            expenses
          </div>
        </div>
      </div>
    </BpBox>
  );
}
