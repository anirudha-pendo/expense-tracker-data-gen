/**
 * Regression test for APP-172986.
 *
 * Before the fix the deadline comparison used `new Date(goal.deadline)` which
 * parses a bare YYYY-MM-DD as UTC midnight — in a UTC-negative timezone that
 * shifts to the previous local day. A projection landing on the deadline day
 * was therefore judged "behind" instead of "on track".
 *
 * Run: cd bot && npx tsx ../src/features/goals/lib/goal-projection.regression.ts
 */

import assert from "node:assert";
import { addWeeks, differenceInCalendarWeeks } from "date-fns";
import { localIsoDate } from "@/lib/dates";
import { projectGoal } from "./goal-projection";
import type { Goal } from "@/types";

function makeGoal(patch: Partial<Goal> = {}): Goal {
  return {
    id: "g1",
    workspaceId: "ws",
    name: "Test",
    targetAmount: 500,
    color: "#000",
    contributions: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...patch,
  };
}

// ---- helpers to predict what projectGoal will compute ----

function predictProjectedDate(
  goal: Goal,
  now: Date,
): Date | undefined {
  const saved = goal.contributions.reduce((s, c) => s + c.amount, 0);
  const remaining = Math.max(goal.targetAmount - saved, 0);
  if (remaining <= 0 || goal.contributions.length < 2) return undefined;

  const firstDate = goal.contributions
    .map((c) => new Date(c.date))
    .reduce((min, d) => (d < min ? d : min));
  const weeks = Math.max(differenceInCalendarWeeks(now, firstDate), 1);
  const weeklyRate = saved / weeks;
  if (weeklyRate <= 0) return undefined;

  return addWeeks(now, Math.ceil(remaining / weeklyRate));
}

// ---- 1. Projected date lands ON the deadline → on track ----
{
  const now = new Date(2026, 5, 15); // Jun 15 local
  const contributions = [
    { id: "c1", amount: 100, date: localIsoDate(new Date(2026, 4, 1)) },
    { id: "c2", amount: 100, date: localIsoDate(new Date(2026, 5, 1)) },
  ];

  const projected = predictProjectedDate(
    makeGoal({ targetAmount: 500, contributions }),
    now,
  );
  assert.ok(projected, "should produce a projected date");

  const deadline = localIsoDate(projected);
  const goal = makeGoal({ targetAmount: 500, deadline, contributions });
  const result = projectGoal(goal, now);

  assert.strictEqual(
    result.onTrack,
    true,
    `projected date on deadline (${deadline}) must be "on track"`,
  );
}

// ---- 2. Projected date is BEFORE the deadline → on track ----
{
  const now = new Date(2026, 5, 15);
  const contributions = [
    { id: "c1", amount: 100, date: localIsoDate(new Date(2026, 4, 1)) },
    { id: "c2", amount: 100, date: localIsoDate(new Date(2026, 5, 1)) },
  ];

  const projected = predictProjectedDate(
    makeGoal({ targetAmount: 500, contributions }),
    now,
  );
  assert.ok(projected);

  // deadline is one week after projected → comfortably on track
  const deadline = localIsoDate(addWeeks(projected, 1));
  const goal = makeGoal({ targetAmount: 500, deadline, contributions });
  const result = projectGoal(goal, now);

  assert.strictEqual(result.onTrack, true, "before deadline → on track");
}

// ---- 3. Projected date is AFTER the deadline → behind ----
{
  const now = new Date(2026, 5, 15);
  const contributions = [
    { id: "c1", amount: 100, date: localIsoDate(new Date(2026, 4, 1)) },
    { id: "c2", amount: 100, date: localIsoDate(new Date(2026, 5, 1)) },
  ];

  const projected = predictProjectedDate(
    makeGoal({ targetAmount: 500, contributions }),
    now,
  );
  assert.ok(projected);

  // deadline is one week before projected → behind
  const deadline = localIsoDate(addWeeks(projected, -1));
  const goal = makeGoal({ targetAmount: 500, deadline, contributions });
  const result = projectGoal(goal, now);

  assert.strictEqual(result.onTrack, false, "after deadline → behind");
}

// ---- 4. No deadline → onTrack is undefined ----
{
  const now = new Date(2026, 5, 15);
  const contributions = [
    { id: "c1", amount: 100, date: localIsoDate(new Date(2026, 4, 1)) },
    { id: "c2", amount: 100, date: localIsoDate(new Date(2026, 5, 1)) },
  ];
  const goal = makeGoal({ targetAmount: 500, contributions });
  const result = projectGoal(goal, now);

  assert.strictEqual(result.onTrack, undefined, "no deadline → undefined");
}

console.log("✓ goal-projection regression (APP-172986): all checks passed");
