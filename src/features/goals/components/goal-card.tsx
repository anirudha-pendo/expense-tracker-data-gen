import { CalendarClock, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BpBox } from "@/shared/components/bp-box";
import { formatCurrency, formatDate } from "@/lib/format";
import { projectGoal } from "../lib/goal-projection";
import type { Goal } from "@/types";

interface GoalCardProps {
  goal: Goal;
  currency: string;
  locale: string;
  index: number;
  onContribute: (goal: Goal) => void;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
}

export function GoalCard({ goal, currency, locale, index, onContribute, onEdit, onDelete }: GoalCardProps) {
  const projection = projectGoal(goal);
  const percent = Math.min(Math.round(projection.ratio * 100), 100);

  return (
    <BpBox
      className="stagger-item flex flex-col"
      style={{ animationDelay: `${index * 60}ms` } as React.CSSProperties}
    >
      <div className="border-b border-border/40 px-5 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="size-3 rounded-full shrink-0" style={{ backgroundColor: goal.color }} />
          <span className="font-mono text-[11px] tracking-widest uppercase text-foreground truncate">
            {goal.name}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button variant="ghost" size="icon" className="size-7" onClick={() => onEdit(goal)}>
            <Pencil className="size-3" />
            <span className="sr-only">Edit goal</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-destructive hover:text-destructive"
            onClick={() => onDelete(goal)}
          >
            <Trash2 className="size-3" />
            <span className="sr-only">Delete goal</span>
          </Button>
        </div>
      </div>

      <div className="p-5 flex flex-col gap-4 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-2xl font-semibold tabular-nums">
            {formatCurrency(projection.saved, currency, locale)}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            of {formatCurrency(goal.targetAmount, currency, locale)}
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <Progress
            value={percent}
            className="[&_[data-slot=progress-indicator]]:bg-[var(--goal-color)]"
            style={{ ["--goal-color" as string]: goal.color }}
          />
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
              {percent}% saved
            </span>
            {!projection.isComplete && (
              <span className="font-mono text-[10px] tracking-wider text-muted-foreground/60 tabular-nums">
                {formatCurrency(projection.remaining, currency, locale)} to go
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1 font-mono text-[10px] tracking-wider text-muted-foreground mt-auto">
          {projection.isComplete ? (
            <span className="flex items-center gap-1.5 text-emerald-700">
              <Check className="size-3" /> Goal reached
            </span>
          ) : (
            <>
              {projection.projectedDate && (
                <span className="flex items-center gap-1.5">
                  <CalendarClock className="size-3 shrink-0" />
                  Projected: {formatDate(projection.projectedDate.toISOString(), locale)}
                  {projection.onTrack !== undefined && (
                    <span className={projection.onTrack ? "text-emerald-700" : "text-destructive"}>
                      · {projection.onTrack ? "on track" : "behind"}
                    </span>
                  )}
                </span>
              )}
              {goal.deadline && (
                <span className="text-muted-foreground/60">
                  Deadline: {formatDate(goal.deadline, locale)}
                </span>
              )}
              {goal.contributions.length < 2 && (
                <span className="text-muted-foreground/40">
                  Add {goal.contributions.length === 0 ? "a contribution" : "another contribution"} to see a projection
                </span>
              )}
            </>
          )}
        </div>

        <Button size="sm" variant="outline" className="w-full" onClick={() => onContribute(goal)}>
          <Plus data-icon="inline-start" />
          Add money
        </Button>
      </div>
    </BpBox>
  );
}
