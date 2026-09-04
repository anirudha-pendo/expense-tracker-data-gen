// Seed-data tables for the usage bot's personas: per-category amount ranges
// and description pools, goal name/target pools, and the assorted small
// pools/counts `bot/personas.ts` draws from when building a persona's
// workspace backstory.
//
// This is deliberately separate from `bot/config.ts`. `config.ts` holds
// *tunables* — knobs someone turns to change the bot's behaviour (run
// shape, pacing, the region traffic curve, the archetype table). Plausible
// price ranges for groceries and rent are not knobs; nobody tunes them.
// They're seed data, so they live here instead, keeping `config.ts` short
// and scannable.
//
// All of this is inert data — no randomness, no dates, no ids. The actual
// generation logic (which draws from these tables via the seeded PRNG) lives
// in `bot/personas.ts`.

import type { Region } from "./config";

// --- Persona identity & credentials ------------------------------------------

/**
 * Shared login password for every seeded persona. This is fixture data for a
 * throwaway dummy app seeded by a bot, not a real credential — see the "No
 * secrets in the repo" constraint, which this does not violate.
 */
export const PERSONA_PASSWORD = "UsageBot#2026";

// --- Categories ---------------------------------------------------------------

export interface CategorySeed {
  name: string;
  color: string;
  scope: "income" | "expense" | "both";
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
// `GoalFormDialog` (src/features/goals/components/goal-form.tsx). The two
// palettes are byte-identical in the app, which is why one constant serves
// both — and why it is named for the swatch row rather than for categories.
// Reused here so a custom category's or a goal's color is one a real user
// could actually have clicked.
export const SWATCH_PRESET_COLORS: string[] = [
  "#ef4444", "#f97316", "#f59e0b", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280", "#84cc16",
];

/** Fraction of seeded transactions that are expense (vs income). */
export const EXPENSE_TRANSACTION_RATE = 0.85;

// --- Budgets --------------------------------------------------------------
//
// The budget *limit* itself is derived from expected monthly spend (average
// transaction amount x expected transactions/month) scaled by a headroom
// factor — that's a genuine behaviour tunable, so it lives in `config.ts`
// as `BUDGET_HEADROOM_MIN`/`MAX`, not here.

export const BUDGET_COUNT_MIN = 2;
export const BUDGET_COUNT_MAX = 4;

// --- Goals ------------------------------------------------------------------

export const GOAL_COUNT_MIN = 1;
export const GOAL_COUNT_MAX = 3;
export const GOAL_CONTRIBUTION_COUNT_MIN = 1;
export const GOAL_CONTRIBUTION_COUNT_MAX = 5;
/** Each contribution is this many percent of the goal's target amount. */
export const GOAL_CONTRIBUTION_PERCENT_MIN = 5;
export const GOAL_CONTRIBUTION_PERCENT_MAX = 25;
/** Contributions are dated within this many months of "now", capped by the persona's history window. */
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

// --- Workspace ----------------------------------------------------------------

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
