import { addWeeks, differenceInCalendarWeeks, isBefore } from "date-fns";
import type { Goal } from "@/types";

export interface GoalProjection {
  saved: number;
  remaining: number;
  ratio: number;
  isComplete: boolean;
  /** Estimated completion date from the average weekly contribution rate.
      Undefined with fewer than 2 contributions (no rate to extrapolate). */
  projectedDate?: Date;
  /** Whether the projection lands on or before the deadline (only when both exist). */
  onTrack?: boolean;
}

export function projectGoal(goal: Goal, now: Date = new Date()): GoalProjection {
  const saved = goal.contributions.reduce((sum, c) => sum + c.amount, 0);
  const remaining = Math.max(goal.targetAmount - saved, 0);
  const ratio = goal.targetAmount > 0 ? saved / goal.targetAmount : 0;
  const isComplete = remaining <= 0;

  const base: GoalProjection = { saved, remaining, ratio, isComplete };
  if (isComplete || goal.contributions.length < 2) return base;

  const firstDate = goal.contributions
    .map((c) => new Date(c.date))
    .reduce((min, d) => (d < min ? d : min));
  const weeks = Math.max(differenceInCalendarWeeks(now, firstDate), 1);
  const weeklyRate = saved / weeks;
  if (weeklyRate <= 0) return base;

  const weeksToGo = Math.ceil(remaining / weeklyRate);
  const projectedDate = addWeeks(now, weeksToGo);

  const onTrack = goal.deadline
    ? isBefore(projectedDate, new Date(goal.deadline)) || projectedDate.toDateString() === new Date(goal.deadline).toDateString()
    : undefined;

  return { ...base, projectedDate, onTrack };
}
