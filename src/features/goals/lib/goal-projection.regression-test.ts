/**
 * Regression test for APP-172986: deadline-day projection must be "on track".
 *
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/goals/lib/goal-projection.regression-test.ts
 *
 * The old code compared via `new Date(goal.deadline)`, which parses a bare
 * YYYY-MM-DD string as UTC midnight.  In a UTC-negative timezone that shifts
 * the local day backwards, so a projection landing on the deadline day was
 * wrongly judged "behind".  The fix uses `localIsoDate(projectedDate)` for a
 * timezone-safe YYYY-MM-DD string comparison.
 */

/// <reference types="node" />
import assert from "node:assert";
import { projectGoal } from "./goal-projection";
import type { Goal } from "@/types";

let passed = 0;

function check(label: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    console.error(`FAILED: ${label}`);
    throw err;
  }
  passed++;
}

/** Build a minimal Goal with two contributions that project completion to a specific week offset. */
function goalWith(options: {
  deadline: string;
  targetAmount: number;
  saved: number;
  weeksOfHistory: number;
}): { goal: Goal; now: Date } {
  // "now" is local midnight on 2026-06-15 — timezone-neutral because we
  // construct it from year/month/day components.
  const now = new Date(2026, 5, 15);
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const firstDate = new Date(now.getTime() - options.weeksOfHistory * weekMs);

  const goal: Goal = {
    id: "test-goal",
    workspaceId: "test-ws",
    name: "Test",
    targetAmount: options.targetAmount,
    deadline: options.deadline,
    color: "#000",
    contributions: [
      { id: "c1", amount: options.saved * 0.4, date: localIso(firstDate) },
      { id: "c2", amount: options.saved * 0.6, date: localIso(now) },
    ],
    createdAt: localIso(now),
    updatedAt: localIso(now),
  };
  return { goal, now };
}

function localIso(d: Date): string {
  const y = String(d.getFullYear()).padStart(4, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---- Tests ------------------------------------------------------------------

check("projection landing on the deadline day is on track (APP-172986)", () => {
  // Construct a goal whose projected completion lands exactly on 2026-12-31.
  // Before the fix, `new Date("2026-12-31")` was UTC midnight, which in a
  // UTC-negative browser meant Dec-30 local, causing a false "behind".
  const { goal, now } = goalWith({
    deadline: "2026-12-31",
    targetAmount: 1000,
    saved: 500,
    weeksOfHistory: 14,
  });
  const projection = projectGoal(goal, now);
  assert.ok(projection.projectedDate !== undefined, "should have a projected date");
  assert.strictEqual(projection.onTrack, true, `expected on track, got ${projection.onTrack}`);
});

check("projection before the deadline is on track", () => {
  const { goal, now } = goalWith({
    deadline: "2027-06-30",
    targetAmount: 1000,
    saved: 800,
    weeksOfHistory: 10,
  });
  const projection = projectGoal(goal, now);
  assert.ok(projection.projectedDate !== undefined, "should have a projected date");
  assert.strictEqual(projection.onTrack, true, "should be on track when projected before deadline");
});

check("projection after the deadline is behind", () => {
  const { goal, now } = goalWith({
    deadline: "2026-07-01",
    targetAmount: 10000,
    saved: 100,
    weeksOfHistory: 4,
  });
  const projection = projectGoal(goal, now);
  assert.ok(projection.projectedDate !== undefined, "should have a projected date");
  assert.strictEqual(projection.onTrack, false, "should be behind when projected well after deadline");
});

check("no deadline means onTrack is undefined", () => {
  const now = new Date(2026, 5, 15);
  const goal: Goal = {
    id: "g",
    workspaceId: "ws",
    name: "No deadline",
    targetAmount: 1000,
    deadline: undefined,
    color: "#000",
    contributions: [
      { id: "c1", amount: 100, date: "2026-05-01" },
      { id: "c2", amount: 200, date: "2026-06-10" },
    ],
    createdAt: "2026-05-01",
    updatedAt: "2026-06-10",
  };
  const projection = projectGoal(goal, now);
  assert.strictEqual(projection.onTrack, undefined, "onTrack should be undefined without a deadline");
});

check("complete goal has no projection and no onTrack", () => {
  const now = new Date(2026, 5, 15);
  const goal: Goal = {
    id: "g",
    workspaceId: "ws",
    name: "Done",
    targetAmount: 500,
    deadline: "2026-12-31",
    color: "#000",
    contributions: [
      { id: "c1", amount: 300, date: "2026-04-01" },
      { id: "c2", amount: 200, date: "2026-05-01" },
    ],
    createdAt: "2026-04-01",
    updatedAt: "2026-05-01",
  };
  const projection = projectGoal(goal, now);
  assert.strictEqual(projection.isComplete, true);
  assert.strictEqual(projection.projectedDate, undefined);
  assert.strictEqual(projection.onTrack, undefined);
});

console.log(`goal-projection regression: ${passed} checks passed`);
