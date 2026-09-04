import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { BpBox } from "@/shared/components/bp-box";
import { formatCurrency } from "@/lib/format";
import type { Anomaly } from "../lib/insights-engine";

interface AnomalyListProps {
  anomalies: Anomaly[];
  currency: string;
  locale: string;
}

export function AnomalyList({ anomalies, currency, locale }: AnomalyListProps) {
  return (
    <BpBox className="stagger-item">
      <div className="border-b border-border/40 px-5 py-3">
        <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
          Unusual Spending
        </span>
      </div>
      <div className="p-5">
        {anomalies.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-emerald-700 shrink-0" />
            Nothing unusual — spending is in line with your history.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {anomalies.map((a) => (
              <div key={a.category.id} className="flex items-start gap-3">
                <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-sm">
                    <span className="font-medium">{a.category.name}</span> is{" "}
                    <span className="font-mono font-semibold">{a.ratio.toFixed(1)}x</span> your usual
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                    {formatCurrency(a.currentSpend, currency, locale)} this month vs{" "}
                    {formatCurrency(a.averageSpend, currency, locale)} average
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </BpBox>
  );
}
