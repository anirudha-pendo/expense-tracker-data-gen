// All tunable values for the usage bot live here. Nothing outside this file
// should contain a magic number — if a behaviour needs tuning, it should be a
// constant exported from here.

// --- Environment-driven basics -------------------------------------------

export const APP_URL: string = process.env.APP_URL ?? "http://localhost:5173";
export const HEADLESS: boolean = process.env.HEADLESS !== "false";

// --- Run shape --------------------------------------------------------------

export const MAX_CONCURRENCY = 6;
export const BASE_SESSIONS_PER_RUN = 8; // per region, before curve weighting
export const NEW_VISITOR_RATE = 0.15;
export const WEEKEND_MULTIPLIER = 0.25;
export const MAX_FAILURE_RATE = 0.5; // exit non-zero above this
export const SESSION_TIMEOUT_MS = 240000;

// --- Pacing -------------------------------------------------------------

export const THINK_MIN_MS = 700;
export const THINK_MAX_MS = 3500;
export const READ_PAUSE_MIN_MS = 2500; // dashboard and insights linger
export const READ_PAUSE_MAX_MS = 9000;

// Resolved against the bot/ directory at runtime (the process cwd when
// `npm run run` executes). Kept as the bare directory name here so that
// resolution logic can be added where the run orchestrator lives, rather
// than baking a path assumption into this constants file.
export const FAILURE_DIR = "failures";

// --- Regions and the follow-the-sun traffic curve --------------------------

export const REGIONS = ["IN", "EU", "US"] as const;
export type Region = (typeof REGIONS)[number];

// Indexed by UTC hour, 0-23. Values are 0-1, the fraction of peak traffic.
export const REGION_CURVE: Record<Region, number[]> = {
  IN: [
    0.04, 0.03, 0.02, 0.06, 0.3, 0.6, 0.85, 1.0, 0.9, 0.8, 0.85, 0.9, 0.75,
    0.55, 0.45, 0.5, 0.45, 0.3, 0.18, 0.12, 0.09, 0.07, 0.06, 0.05,
  ],
  EU: [
    0.04, 0.03, 0.02, 0.02, 0.03, 0.06, 0.15, 0.45, 0.8, 0.95, 1.0, 0.85, 0.7,
    0.85, 0.9, 0.8, 0.6, 0.4, 0.3, 0.25, 0.2, 0.14, 0.09, 0.06,
  ],
  US: [
    0.3, 0.22, 0.15, 0.09, 0.06, 0.04, 0.03, 0.02, 0.03, 0.05, 0.08, 0.15,
    0.35, 0.7, 0.9, 1.0, 0.95, 0.85, 0.8, 0.85, 0.75, 0.6, 0.45, 0.38,
  ],
};

/**
 * Sessions to plan for a single region at the UTC hour of `date`.
 *
 * `Math.round(BASE_SESSIONS_PER_RUN * curve[region][utcHour] * weekendFactor)`
 * where `weekendFactor` is `WEEKEND_MULTIPLIER` on Saturday/Sunday (UTC),
 * otherwise 1. `date.getUTCDay()`: 0 is Sunday, 6 is Saturday.
 */
export function sessionsForRegion(region: Region, date: Date): number {
  const utcHour = date.getUTCHours();
  const utcDay = date.getUTCDay();
  const isWeekend = utcDay === 0 || utcDay === 6;
  const weekendFactor = isWeekend ? WEEKEND_MULTIPLIER : 1;
  const curveValue = REGION_CURVE[region][utcHour];
  return Math.round(BASE_SESSIONS_PER_RUN * curveValue * weekendFactor);
}

/** Per-region session counts for the UTC hour of `date`. */
export function sessionsForHour(date: Date): Record<Region, number> {
  const result = {} as Record<Region, number>;
  for (const region of REGIONS) {
    result[region] = sessionsForRegion(region, date);
  }
  return result;
}

// --- Seeded randomness ------------------------------------------------------
//
// All randomness in the bot must go through these helpers so runs are
// reproducible from a seed. No bare Math.random() anywhere else in bot/.

/** Mulberry32: a small, fast, seeded PRNG. Returns a `() => number` in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return function (): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable 32-bit hash of a string, used to turn a string seed into a number. */
export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

export interface Rng {
  /** Next float in [0, 1). */
  next: () => number;
  /** Random integer in [min, max], inclusive on both ends. */
  int: (min: number, max: number) => number;
  /** Random element of a non-empty array. */
  pick: <T>(arr: T[]) => T;
  /** Random element of a non-empty array, weighted by `weightFn`. */
  weighted: <T>(items: T[], weightFn: (item: T) => number) => T;
  /** True with probability `p` (0-1). */
  chance: (p: number) => boolean;
}

/** Builds a seeded, deterministic random-number helper from a string seed. */
export function makeRng(seed: string): Rng {
  const next = mulberry32(hashString(seed));

  function int(min: number, max: number): number {
    return Math.floor(next() * (max - min + 1)) + min;
  }

  function pick<T>(arr: T[]): T {
    return arr[int(0, arr.length - 1)];
  }

  function weighted<T>(items: T[], weightFn: (item: T) => number): T {
    const weights = items.map(weightFn);
    const total = weights.reduce((sum, w) => sum + w, 0);
    let roll = next() * total;
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        return items[i];
      }
    }
    return items[items.length - 1];
  }

  function chance(p: number): boolean {
    return next() < p;
  }

  return { next, int, pick, weighted, chance };
}

// --- Budget headroom ---------------------------------------------------------
//
// A seeded budget's monthly limit is (expected monthly spend in that
// category) x a headroom factor drawn per persona/category from this range.
// Below 1 the limit sits under expected spend (the budget gets exceeded);
// above 1 it sits comfortably over. This is a genuine tunable — widen the
// range for more over-budget sessions, narrow it for fewer — unlike the
// price/description tables in `seed-data.ts`, which nobody tunes.
export const BUDGET_HEADROOM_MIN = 0.8;
export const BUDGET_HEADROOM_MAX = 1.4;

// --- Seeding --------------------------------------------------------------
//
// After IndexedDB is seeded and the page is reloaded, the app re-renders
// /sign-in first and only redirects to the dashboard once its session
// bootstrap (reading localStorage, then IndexedDB) resolves. This bounds how
// long seedPersona waits for that redirect to settle and the dashboard's
// data to actually render, rather than assuming the first navigation is the
// final one.
export const SEED_LANDMARK_TIMEOUT_MS = 30000;
