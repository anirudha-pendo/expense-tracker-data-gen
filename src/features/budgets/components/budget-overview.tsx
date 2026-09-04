import { Link } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import { BpBox } from "@/shared/components/bp-box";
import { formatCurrency } from "@/lib/format";
import { useAuthContext } from "@/features/auth/hooks/auth-context";
import { useBudgets, type BudgetState } from "../hooks/use-budgets";

const STATE_BAR_CLASS: Record<BudgetState, string> = {
  ok: "",
  warning: "[&_[data-slot=progress-indicator]]:bg-amber-500",
  over: "[&_[data-slot=progress-indicator]]:bg-destructive",
};

export function BudgetOverview() {
  const { workspace } = useAuthContext();
  const { rows, isLoading } = useBudgets(workspace!.id);

  const currency = workspace?.currency ?? "USD";
  const locale = workspace?.locale ?? "en-US";

  if (isLoading || rows.length === 0) return null;

  return (
    <BpBox className="stagger-item">
      <div className="border-b border-border/40 px-5 py-3 flex items-baseline justify-between">
        <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
          Budgets · This Month
        </span>
        <Link
          to="/settings"
          className="font-mono text-[10px] text-muted-foreground/40 hover:text-foreground transition-colors uppercase tracking-widest"
        >
          Manage
        </Link>
      </div>
      <div className="p-5 flex flex-col gap-4">
        {rows.map((row) => (
          <div key={row.budget.id} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="size-2 shrink-0" style={{ backgroundColor: row.category.color }} />
                <span className="text-sm truncate">{row.category.name}</span>
              </div>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground shrink-0">
                {formatCurrency(row.spent, currency, locale)}
                <span className="text-muted-foreground/40"> / {formatCurrency(row.budget.monthlyLimit, currency, locale)}</span>
              </span>
            </div>
            <Progress value={Math.min(row.ratio * 100, 100)} className={STATE_BAR_CLASS[row.state]} />
            {row.state === "over" && (
              <span className="font-mono text-[10px] text-destructive tracking-wider uppercase">
                Over by {formatCurrency(row.spent - row.budget.monthlyLimit, currency, locale)}
              </span>
            )}
            {row.state === "warning" && (
              <span className="font-mono text-[10px] text-amber-600 tracking-wider uppercase">
                {Math.round(row.ratio * 100)}% used
              </span>
            )}
          </div>
        ))}
      </div>
    </BpBox>
  );
}
