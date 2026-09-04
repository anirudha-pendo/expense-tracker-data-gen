import { TrendingDown, TrendingUp } from "lucide-react";
import { BpBox } from "@/shared/components/bp-box";
import { formatCurrency } from "@/lib/format";
import type { Forecast } from "../lib/insights-engine";

interface ForecastCardProps {
  forecast: Forecast;
  currency: string;
  locale: string;
}

export function ForecastCard({ forecast, currency, locale }: ForecastCardProps) {
  const aboveBaseline = forecast.vsBaseline !== null && forecast.vsBaseline > 1;

  return (
    <BpBox className="stagger-item">
      <div className="border-b border-border/40 px-5 py-3">
        <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
          End-of-Month Forecast
        </span>
      </div>
      <div className="p-5 flex flex-col gap-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-3xl font-semibold tabular-nums">
            {formatCurrency(forecast.projected, currency, locale)}
          </span>
          {forecast.vsBaseline !== null && (
            <span
              className={`flex items-center gap-1 font-mono text-[11px] tracking-wider ${
                aboveBaseline ? "text-red-600" : "text-emerald-700"
              }`}
            >
              {aboveBaseline ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {Math.round(forecast.vsBaseline * 100)}% of usual
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1 font-mono text-[11px] text-muted-foreground">
          <span>
            Spent so far: <span className="tabular-nums">{formatCurrency(forecast.spentSoFar, currency, locale)}</span>
          </span>
          {forecast.baselineAverage !== null ? (
            <span>
              Recent monthly average:{" "}
              <span className="tabular-nums">{formatCurrency(forecast.baselineAverage, currency, locale)}</span>
            </span>
          ) : (
            <span className="text-muted-foreground/50">
              Projection based on this month&apos;s daily run-rate
            </span>
          )}
        </div>
      </div>
    </BpBox>
  );
}
