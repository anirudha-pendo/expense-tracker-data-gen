import { BpBox } from "@/shared/components/bp-box";
import { Progress } from "@/components/ui/progress";
import type { HealthScore } from "../lib/insights-engine";

function scoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Needs attention";
}

export function HealthScoreCard({ health }: { health: HealthScore }) {
  return (
    <BpBox className="stagger-item">
      <div className="border-b border-border/40 px-5 py-3 flex items-baseline justify-between">
        <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
          Financial Health
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/40 uppercase tracking-widest">
          {scoreLabel(health.score)}
        </span>
      </div>
      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-3xl font-semibold tabular-nums">{health.score}</span>
          <span className="font-mono text-[11px] text-muted-foreground">/ 100</span>
        </div>
        <div className="flex flex-col gap-3">
          {health.components.map((c) => (
            <div key={c.label} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground">
                  {c.label}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60">
                  {c.points}/{c.maxPoints}
                </span>
              </div>
              <Progress value={c.maxPoints > 0 ? (c.points / c.maxPoints) * 100 : 0} />
              <span className="text-xs text-muted-foreground/70">{c.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </BpBox>
  );
}
