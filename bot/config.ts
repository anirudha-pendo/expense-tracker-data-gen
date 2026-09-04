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

// --- Persona identity & credentials ------------------------------------------

/**
 * Shared login password for every seeded persona. This is fixture data for a
 * throwaway dummy app seeded by a bot, not a real credential — see the "No
 * secrets in the repo" constraint, which this does not violate.
 */
export const PERSONA_PASSWORD = "UsageBot#2026";

// --- Deterministic seed-data generation --------------------------------------
//
// Fixed reference point ("today") that all historical seed data is generated
// relative to, so `buildSeedData` is a pure function of a persona and produces
// byte-identical output on every call — no `Date.now()` anywhere in bot/.
export const SEED_ANCHOR_DATE = "2026-09-04T00:00:00.000Z";

export type SeedCategoryScope = "income" | "expense" | "both";

export interface CategorySeed {
  name: string;
  color: string;
  scope: SeedCategoryScope;
  amountMin: number;
  amountMax: number;
  /** 0-1: chance a transaction in this category is marked recurring. */
  recurringRate: number;
  descriptions: string[];
}

// Verbatim mirror of the app's own `seedDefaultCategories`
// (src/lib/db/repositories/categories.repo.ts) — same names, same colors,
// same order — so seeded data is a state the app itself could produce.
export const DEFAULT_CATEGORY_SEEDS: CategorySeed[] = [
  {
    name: "Food & Dining",
    color: "#f97316",
    scope: "expense",
    amountMin: 6,
    amountMax: 140,
    recurringRate: 0.05,
    descriptions: ["Groceries", "Coffee", "Lunch with team", "Dinner out", "Grocery run", "Takeout order", "Bakery treat", "Farmers market"],
  },
  {
    name: "Transport",
    color: "#3b82f6",
    scope: "expense",
    amountMin: 4,
    amountMax: 90,
    recurringRate: 0.05,
    descriptions: ["Gas fill-up", "Uber ride", "Metro pass", "Parking fee", "Car service", "Train ticket", "Bike repair"],
  },
  {
    name: "Shopping",
    color: "#8b5cf6",
    scope: "expense",
    amountMin: 12,
    amountMax: 260,
    recurringRate: 0.03,
    descriptions: ["New shoes", "Electronics", "Clothing haul", "Home decor", "Online order", "Gadget accessory", "Furniture piece"],
  },
  {
    name: "Entertainment",
    color: "#ec4899",
    scope: "expense",
    amountMin: 8,
    amountMax: 150,
    recurringRate: 0.15,
    descriptions: ["Movie tickets", "Concert tickets", "Streaming subscription", "Video game", "Bowling night", "Museum entry"],
  },
  {
    name: "Health",
    color: "#10b981",
    scope: "expense",
    amountMin: 10,
    amountMax: 300,
    recurringRate: 0.05,
    descriptions: ["Pharmacy run", "Doctor visit", "Gym membership", "Dental checkup", "Vitamins", "Physio session"],
  },
  {
    name: "Housing",
    color: "#6366f1",
    scope: "expense",
    amountMin: 700,
    amountMax: 2600,
    recurringRate: 0.85,
    descriptions: ["Monthly rent", "Mortgage payment", "Home insurance", "Property tax", "HOA fee"],
  },
  {
    name: "Utilities",
    color: "#f59e0b",
    scope: "expense",
    amountMin: 35,
    amountMax: 260,
    recurringRate: 0.6,
    descriptions: ["Electricity bill", "Water bill", "Internet bill", "Phone bill", "Gas bill"],
  },
  {
    name: "Other Expense",
    color: "#6b7280",
    scope: "expense",
    amountMin: 5,
    amountMax: 200,
    recurringRate: 0.03,
    descriptions: ["Miscellaneous purchase", "Bank fee", "Charity donation", "Postage", "Late fee"],
  },
  {
    name: "Salary",
    color: "#22c55e",
    scope: "income",
    amountMin: 2500,
    amountMax: 8200,
    recurringRate: 0.9,
    descriptions: ["Monthly salary", "Paycheck deposit"],
  },
  {
    name: "Freelance",
    color: "#06b6d4",
    scope: "income",
    amountMin: 200,
    amountMax: 3000,
    recurringRate: 0.1,
    descriptions: ["Freelance project", "Consulting fee", "Client payment", "Design gig"],
  },
  {
    name: "Investment",
    color: "#84cc16",
    scope: "income",
    amountMin: 40,
    amountMax: 1500,
    recurringRate: 0.1,
    descriptions: ["Dividend payout", "Stock sale", "Interest income", "ETF payout"],
  },
  {
    name: "Other Income",
    color: "#a3e635",
    scope: "income",
    amountMin: 15,
    amountMax: 500,
    recurringRate: 0.05,
    descriptions: ["Cashback reward", "Refund received", "Gift money", "Rebate"],
  },
];

// Optional-for-variety categories a workspace may additionally have created
// through the Category Manager (isDefault: false). A subset of 0-3 is picked
// per persona.
export const CUSTOM_CATEGORY_SEEDS: CategorySeed[] = [
  {
    name: "Travel",
    color: "#3b82f6",
    scope: "expense",
    amountMin: 100,
    amountMax: 2200,
    recurringRate: 0.02,
    descriptions: ["Flight tickets", "Hotel stay", "Travel insurance", "Rental car", "Airport transfer"],
  },
  {
    name: "Education",
    color: "#f59e0b",
    scope: "expense",
    amountMin: 40,
    amountMax: 1600,
    recurringRate: 0.1,
    descriptions: ["Online course", "Textbooks", "Tuition payment", "Workshop fee"],
  },
  {
    name: "Gifts",
    color: "#ec4899",
    scope: "expense",
    amountMin: 12,
    amountMax: 320,
    recurringRate: 0.02,
    descriptions: ["Birthday gift", "Holiday present", "Wedding gift", "Anniversary gift"],
  },
  {
    name: "Pets",
    color: "#84cc16",
    scope: "expense",
    amountMin: 8,
    amountMax: 220,
    recurringRate: 0.1,
    descriptions: ["Vet visit", "Pet food", "Grooming session", "Pet supplies"],
  },
  {
    name: "Side Hustle",
    color: "#22c55e",
    scope: "income",
    amountMin: 40,
    amountMax: 1100,
    recurringRate: 0.15,
    descriptions: ["Side gig payout", "Marketplace sale", "Tutoring income", "Etsy sale"],
  },
  {
    name: "Reimbursement",
    color: "#06b6d4",
    scope: "both",
    amountMin: 15,
    amountMax: 520,
    recurringRate: 0.05,
    descriptions: ["Expense reimbursement", "Work travel reimbursement", "Team lunch reimbursement"],
  },
];

export const CUSTOM_CATEGORY_COUNT_MIN = 0;
export const CUSTOM_CATEGORY_COUNT_MAX = 3;

// The exact 10 preset swatches offered by both `CategoryFormDialog`
// (src/features/settings/components/category-manager.tsx) and
// `GoalFormDialog` (src/features/goals/components/goal-form.tsx) — reused
// here so a custom category's or a goal's color is one a real user could
// actually have clicked.
export const CATEGORY_PRESET_COLORS: string[] = [
  "#ef4444", "#f97316", "#f59e0b", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280", "#84cc16",
];

/** Fraction of seeded transactions that are expense (vs income). */
export const EXPENSE_TRANSACTION_RATE = 0.85;

export const BUDGET_COUNT_MIN = 2;
export const BUDGET_COUNT_MAX = 4;
/** A monthly budget is set at roughly this many times a category's average single-transaction amount. */
export const BUDGET_MONTHLY_LIMIT_MULTIPLIER = 5;

export const GOAL_COUNT_MIN = 1;
export const GOAL_COUNT_MAX = 3;
export const GOAL_CONTRIBUTION_COUNT_MIN = 1;
export const GOAL_CONTRIBUTION_COUNT_MAX = 5;
/** Each contribution is this many percent of the goal's target amount. */
export const GOAL_CONTRIBUTION_PERCENT_MIN = 5;
export const GOAL_CONTRIBUTION_PERCENT_MAX = 25;
/** Contributions are dated within this many months of the seed anchor, capped by the persona's history window. */
export const GOAL_CONTRIBUTION_LOOKBACK_MONTHS = 6;
export const GOAL_DEADLINE_CHANCE = 0.6;
export const GOAL_DEADLINE_MONTHS_MIN = 2;
export const GOAL_DEADLINE_MONTHS_MAX = 18;

export interface GoalSeed {
  name: string;
  targetMin: number;
  targetMax: number;
}

export const GOAL_SEED_POOL: GoalSeed[] = [
  { name: "Emergency Fund", targetMin: 2000, targetMax: 10000 },
  { name: "Vacation Fund", targetMin: 800, targetMax: 5000 },
  { name: "New Laptop", targetMin: 800, targetMax: 2500 },
  { name: "Wedding Fund", targetMin: 3000, targetMax: 15000 },
  { name: "Home Down Payment", targetMin: 10000, targetMax: 50000 },
  { name: "New Car", targetMin: 5000, targetMax: 30000 },
];

/** Goal targets and budget limits are rounded to the nearest unit of this size. */
export const AMOUNT_ROUNDING_UNIT = 10;

export const WORKSPACE_NAME_TEMPLATES: string[] = [
  "{name}'s Finances",
  "{name}'s Budget",
  "{name}'s Ledger",
  "{name} Expenses",
  "Household Finances",
];

export interface RegionWorkspaceOption {
  /** One of the exact currency codes the app's own Currency select accepts. */
  currency: string;
  /** One of the exact locale codes the app's own Number Format select accepts. */
  locale: string;
}

// Values drawn only from the option lists in
// src/features/workspace/components/workspace-setup-form.tsx (CURRENCIES /
// LOCALES), so every generated workspace is a state the app's own setup form
// could produce.
export const REGION_WORKSPACE_OPTIONS: Record<Region, RegionWorkspaceOption[]> = {
  IN: [
    { currency: "INR", locale: "en-IN" },
    { currency: "USD", locale: "en-US" },
  ],
  EU: [
    { currency: "EUR", locale: "de-DE" },
    { currency: "EUR", locale: "fr-FR" },
    { currency: "GBP", locale: "en-GB" },
  ],
  US: [
    { currency: "USD", locale: "en-US" },
    { currency: "CAD", locale: "en-US" },
  ],
};

/** A workspace is "created" this many days before the persona's earliest seeded transaction. */
export const WORKSPACE_CREATED_BUFFER_DAYS_MIN = 1;
export const WORKSPACE_CREATED_BUFFER_DAYS_MAX = 14;
