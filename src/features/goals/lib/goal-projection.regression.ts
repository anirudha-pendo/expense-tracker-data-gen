// Regression test for APP-172986: the "on track / behind" check must compare
// calendar days in local time, not via `new Date(deadline)` which is UTC
// midnight and drifts to the previous local day in UTC-negative zones.
//
// Run: TZ=America/New_York npx tsx --tsconfig tsconfig.app.json src/features/goals/lib/goal-projection.regression.ts

import { projectGoal } from "./goal-projection";
import type { Goal } from "@/types";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "g1",
    workspaceId: "ws1",
    name: "Regression goal",
    targetAmount: 320,
    deadline: "2026-12-31",
    color: "#000",
    contributions: [
      { id: "c1", amount: 80, date: "2026-12-03" },
      { id: "c2", amount: 80, date: "2026-12-10" },
    ],
    createdAt: "2026-12-01",
    updatedAt: "2026-12-10",
    ...overrides,
  };
}

// With now = 2026-12-17, the two contributions (80 each, starting 2026-12-03)
// span 2 calendar weeks → weeklyRate = 80.  remaining = 160, weeksToGo = 2,
// so projectedDate = addWeeks(2026-12-17, 2) = 2026-12-31 — the deadline day.

const now = new Date(2026, 11, 17); // local Dec 17

const result = projectGoal(makeGoal(), now);

assert(
  result.onTrack === true,
  `projected date on the deadline must be "on track", got onTrack=${String(result.onTrack)}`,
);

// A projection that lands before the deadline is also on track.
const earlyResult = projectGoal(
  makeGoal({
    targetAmount: 200,
    contributions: [
      { id: "c1", amount: 80, date: "2026-12-03" },
      { id: "c2", amount: 80, date: "2026-12-10" },
    ],
  }),
  now,
);

assert(
  earlyResult.onTrack === true,
  `projected date before the deadline must be "on track", got onTrack=${String(earlyResult.onTrack)}`,
);

// A projection that lands after the deadline is behind.
const lateResult = projectGoal(
  makeGoal({
    targetAmount: 10000,
    contributions: [
      { id: "c1", amount: 80, date: "2026-12-03" },
      { id: "c2", amount: 80, date: "2026-12-10" },
    ],
  }),
  now,
);

assert(
  lateResult.onTrack === false,
  `projected date well past the deadline must be "behind", got onTrack=${String(lateResult.onTrack)}`,
);

// No deadline → onTrack is undefined.
const noDeadline = projectGoal(makeGoal({ deadline: undefined }), now);

assert(
  noDeadline.onTrack === undefined,
  `no deadline must yield onTrack=undefined, got onTrack=${String(noDeadline.onTrack)}`,
);

console.log("goal-projection regression: all checks passed");
