import { Lightbulb } from "lucide-react";
import { AppLayout } from "@/shared/components/app-layout";
import { BpBox } from "@/shared/components/bp-box";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthContext } from "@/features/auth/hooks/auth-context";
import { useInsights } from "../hooks/use-insights";
import { ForecastCard } from "../components/forecast-card";
import { HealthScoreCard } from "../components/health-score-card";
import { AnomalyList } from "../components/anomaly-list";
import { MomDeltaTable } from "../components/mom-delta-table";
import { LargestExpenses } from "../components/largest-expenses";

export function InsightsPage() {
  const { workspace } = useAuthContext();
  const insights = useInsights(workspace!.id);

  const currency = workspace?.currency ?? "USD";
  const locale = workspace?.locale ?? "en-US";

  if (insights.isLoading) {
    return (
      <AppLayout title="Insights">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      </AppLayout>
    );
  }

  if (!insights.hasTransactions) {
    return (
      <AppLayout title="Insights">
        <BpBox className="stagger-item">
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <Lightbulb className="size-6 text-muted-foreground/40" />
            <p className="font-mono text-[11px] tracking-wider uppercase text-muted-foreground/60">
              No data to analyze yet
            </p>
            <p className="text-sm text-muted-foreground max-w-sm">
              Add some transactions and come back — you&apos;ll get a spending forecast, anomaly
              alerts, and a financial health score computed from your history.
            </p>
          </div>
        </BpBox>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Insights">
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ForecastCard forecast={insights.forecast} currency={currency} locale={locale} />
          <HealthScoreCard health={insights.health} />
        </div>
        <AnomalyList anomalies={insights.anomalies} currency={currency} locale={locale} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <MomDeltaTable deltas={insights.deltas} currency={currency} locale={locale} />
          <LargestExpenses
            transactions={insights.largest}
            categories={insights.categories}
            currency={currency}
            locale={locale}
          />
        </div>
      </div>
    </AppLayout>
  );
}
