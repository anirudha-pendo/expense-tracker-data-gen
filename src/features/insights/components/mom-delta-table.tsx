import { BpBox } from "@/shared/components/bp-box";
import { formatCurrency } from "@/lib/format";
import type { CategoryDelta } from "../lib/insights-engine";

interface MomDeltaTableProps {
  deltas: CategoryDelta[];
  currency: string;
  locale: string;
}

export function MomDeltaTable({ deltas, currency, locale }: MomDeltaTableProps) {
  return (
    <BpBox className="stagger-item">
      <div className="border-b border-border/40 px-5 py-3">
        <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
          Month over Month
        </span>
      </div>
      <div className="p-5">
        {deltas.length === 0 ? (
          <p className="font-mono text-[11px] text-muted-foreground/50 tracking-wider">
            No expenses recorded this month or last month.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {deltas.slice(0, 6).map((d) => {
              const up = d.delta > 0;
              const flat = d.delta === 0;
              return (
                <div key={d.category.id} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="size-2 shrink-0" style={{ backgroundColor: d.category.color }} />
                    <span className="text-sm truncate">{d.category.name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                      {formatCurrency(d.thisMonth, currency, locale)}
                    </span>
                    <span
                      className={`font-mono text-[11px] tabular-nums w-20 text-right ${
                        flat ? "text-muted-foreground/40" : up ? "text-red-600" : "text-emerald-700"
                      }`}
                    >
                      {flat
                        ? "—"
                        : `${up ? "+" : ""}${
                            d.percent !== null
                              ? `${Math.round(d.percent)}%`
                              : formatCurrency(d.delta, currency, locale)
                          }`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </BpBox>
  );
}
