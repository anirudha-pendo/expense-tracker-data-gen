import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Sparkles } from "lucide-react";
import { BpBox } from "@/shared/components/bp-box";
import { formatCurrency } from "@/lib/format";
import { useAuthContext } from "@/features/auth/hooks/auth-context";
import { useInsights } from "../hooks/use-insights";

// Compact dashboard strip: forecast + top anomaly, linking to /insights.
export function InsightsStrip() {
  const { workspace } = useAuthContext();
  const insights = useInsights(workspace!.id);

  const currency = workspace?.currency ?? "USD";
  const locale = workspace?.locale ?? "en-US";

  if (insights.isLoading || !insights.hasTransactions) return null;

  const topAnomaly = insights.anomalies[0];

  return (
    <BpBox className="stagger-item">
      <Link
        to="/insights"
        className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-muted/30 transition-colors duration-150"
      >
        <div className="flex items-center gap-4 min-w-0 flex-wrap">
          <span className="flex items-center gap-2 font-mono text-[11px] tracking-wider text-muted-foreground shrink-0">
            <Sparkles className="size-3.5" />
            <span className="uppercase tracking-widest text-[10px]">Forecast</span>
            <span className="text-foreground font-semibold tabular-nums">
              {formatCurrency(insights.forecast.projected, currency, locale)}
            </span>
            <span className="text-muted-foreground/50">by month end</span>
          </span>
          {topAnomaly && (
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-amber-600 min-w-0">
              <AlertTriangle className="size-3.5 shrink-0" />
              <span className="truncate">
                {topAnomaly.category.name} is {topAnomaly.ratio.toFixed(1)}x your usual
              </span>
            </span>
          )}
        </div>
        <span className="flex items-center gap-1 font-mono text-[10px] tracking-widest uppercase text-muted-foreground shrink-0">
          Insights <ArrowRight className="size-3" />
        </span>
      </Link>
    </BpBox>
  );
}
