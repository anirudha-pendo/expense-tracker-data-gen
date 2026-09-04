import { AppLayout } from "@/shared/components/app-layout";
import { useAuthContext } from "@/features/auth/hooks/auth-context";
import { useDashboardStats } from "../hooks/use-dashboard-stats";
import { SummaryCards } from "../components/summary-cards";
import { SpendingByCategoryChart } from "../components/spending-by-category-chart";
import { MonthlyTrendChart } from "../components/monthly-trend-chart";
import { RecentTransactions } from "../components/recent-transactions";
import { BudgetOverview } from "@/features/budgets/components/budget-overview";
import { InsightsStrip } from "@/features/insights/components/insights-strip";

export function DashboardPage() {
  const { workspace } = useAuthContext();
  const stats = useDashboardStats(workspace!.id);
  const currency = workspace?.currency ?? "USD";
  const locale = workspace?.locale ?? "en-US";

  return (
    <AppLayout title="Dashboard">
      <div className="flex flex-col gap-6">
        <InsightsStrip />

        <SummaryCards
          stats={stats.summary}
          currency={currency}
          locale={locale}
          isLoading={stats.isLoading}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SpendingByCategoryChart
            data={stats.categoryBreakdown}
            currency={currency}
            locale={locale}
            isLoading={stats.isLoading}
          />
          <MonthlyTrendChart
            data={stats.monthlyTrend}
            currency={currency}
            locale={locale}
            isLoading={stats.isLoading}
          />
        </div>

        <BudgetOverview />

        <RecentTransactions
          transactions={stats.recentTransactions}
          currency={currency}
          locale={locale}
          isLoading={stats.isLoading}
        />
      </div>
    </AppLayout>
  );
}
