// Accounts, personas and archetypes for the usage bot, plus the generation
// logic that builds the deterministic seed data ("backstory") each persona's
// workspace carries before the bot ever drives a browser against it. The
// raw data tables that logic draws from (category amount ranges, goal name
// pools, etc.) live in `./seed-data` — that's seed data, not a behaviour
// tunable, so it's kept out of `./config` (which stays scannable knobs only).
//
// Persona ids are hardcoded UUID v4 literals, never generated at runtime.
// The app's own user id becomes the analytics visitor id, so a persona whose
// id changed between runs would look like a brand-new visitor every time —
// silently breaking every retention/cohort chart this bot exists to produce.
//
// `bot/` never imports from `src/` (separate tsconfig, separate module
// graph) — the record types below mirror `src/types/index.ts` field-for-field
// but are declared locally.

import {
  makeRng,
  type Rng,
  type Region,
  BUDGET_HEADROOM_MIN,
  BUDGET_HEADROOM_MAX,
} from "./config";
import {
  PERSONA_PASSWORD,
  DEFAULT_CATEGORY_SEEDS,
  CUSTOM_CATEGORY_SEEDS,
  CUSTOM_CATEGORY_COUNT_MIN,
  CUSTOM_CATEGORY_COUNT_MAX,
  SWATCH_PRESET_COLORS,
  EXPENSE_TRANSACTION_RATE,
  BUDGET_COUNT_MIN,
  BUDGET_COUNT_MAX,
  GOAL_COUNT_MIN,
  GOAL_COUNT_MAX,
  GOAL_CONTRIBUTION_COUNT_MIN,
  GOAL_CONTRIBUTION_COUNT_MAX,
  GOAL_CONTRIBUTION_PERCENT_MIN,
  GOAL_CONTRIBUTION_PERCENT_MAX,
  GOAL_CONTRIBUTION_LOOKBACK_MONTHS,
  GOAL_DEADLINE_CHANCE,
  GOAL_DEADLINE_MONTHS_MIN,
  GOAL_DEADLINE_MONTHS_MAX,
  GOAL_SEED_POOL,
  AMOUNT_ROUNDING_UNIT,
  WORKSPACE_NAME_TEMPLATES,
  REGION_WORKSPACE_OPTIONS,
  WORKSPACE_CREATED_BUFFER_DAYS_MIN,
  WORKSPACE_CREATED_BUFFER_DAYS_MAX,
  type CategorySeed,
} from "./seed-data";

// =============================================================================
// Local mirrors of src/types/index.ts (field-for-field; do not import src/)
// =============================================================================

export type TransactionType = "income" | "expense";
export type CategoryScope = "income" | "expense" | "both";

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarInitials: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  userId: string;
  name: string;
  currency: string;
  locale: string;
  createdAt: string;
}

export interface Category {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  scope: CategoryScope;
  isDefault: boolean;
}

export interface Transaction {
  id: string;
  workspaceId: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  description: string;
  date: string;
  isRecurring: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface GoalContribution {
  id: string;
  amount: number;
  date: string;
  note?: string;
}

export interface Goal {
  id: string;
  workspaceId: string;
  name: string;
  targetAmount: number;
  deadline?: string;
  color: string;
  icon?: string;
  contributions: GoalContribution[];
  createdAt: string;
  updatedAt: string;
}

export interface Budget {
  id: string;
  workspaceId: string;
  categoryId: string;
  monthlyLimit: number;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Archetypes and action weights
// =============================================================================

export type Archetype = "power" | "regular" | "casual" | "explorer" | "churning";

/**
 * The 19 UI actions Task 4 implements. Keeping this a string-literal union
 * (rather than plain `string`) means a typo in an archetype's weights is a
 * compile error instead of an action silently getting weight 0 and never
 * being exercised.
 */
export type ActionName =
  | "navigateDashboard"
  | "navigateTransactions"
  | "navigateInsights"
  | "navigateGoals"
  | "navigateSettings"
  | "addTransaction"
  | "editTransaction"
  | "deleteTransaction"
  | "filterTransactions"
  | "clearFilters"
  | "addGoal"
  | "contributeToGoal"
  | "addBudget"
  | "updateProfile"
  | "updateWorkspace"
  | "addCategory"
  | "useQuickAdd"
  | "readInsights"
  | "signOut";

/**
 * Per-archetype relative weights for each of the 19 actions, keyed by
 * archetype so `ARCHETYPES[x].actionWeights` and this table always agree.
 * Behavioural axes (per the brief):
 *  - power: favours adding transactions, insights, budgets and goals.
 *  - regular: balanced around transactions and the dashboard.
 *  - casual: mostly views the dashboard with the occasional transaction.
 *  - explorer: navigates widely, opens settings and dialogs, abandons often.
 *  - churning: glances at the dashboard and leaves.
 * Every archetype gives `signOut` a small but non-zero weight (Task 5 treats
 * it as a terminal action that ends the session walk).
 */
export const ACTION_WEIGHTS: Record<Archetype, Record<ActionName, number>> = {
  power: {
    navigateDashboard: 10,
    navigateTransactions: 12,
    navigateInsights: 10,
    navigateGoals: 6,
    navigateSettings: 4,
    addTransaction: 18,
    editTransaction: 6,
    deleteTransaction: 2,
    filterTransactions: 6,
    clearFilters: 2,
    addGoal: 4,
    contributeToGoal: 5,
    addBudget: 5,
    updateProfile: 1,
    updateWorkspace: 1,
    addCategory: 2,
    useQuickAdd: 8,
    readInsights: 10,
    signOut: 3,
  },
  regular: {
    navigateDashboard: 18,
    navigateTransactions: 16,
    navigateInsights: 6,
    navigateGoals: 5,
    navigateSettings: 4,
    addTransaction: 14,
    editTransaction: 5,
    deleteTransaction: 2,
    filterTransactions: 6,
    clearFilters: 2,
    addGoal: 2,
    contributeToGoal: 2,
    addBudget: 2,
    updateProfile: 1,
    updateWorkspace: 1,
    addCategory: 1,
    useQuickAdd: 5,
    readInsights: 5,
    signOut: 3,
  },
  casual: {
    navigateDashboard: 40,
    navigateTransactions: 12,
    navigateInsights: 3,
    navigateGoals: 2,
    navigateSettings: 2,
    addTransaction: 8,
    editTransaction: 1,
    deleteTransaction: 1,
    filterTransactions: 2,
    clearFilters: 1,
    addGoal: 1,
    contributeToGoal: 1,
    addBudget: 1,
    updateProfile: 1,
    updateWorkspace: 1,
    addCategory: 1,
    useQuickAdd: 3,
    readInsights: 2,
    signOut: 3,
  },
  explorer: {
    navigateDashboard: 10,
    navigateTransactions: 10,
    navigateInsights: 8,
    navigateGoals: 10,
    navigateSettings: 14,
    addTransaction: 6,
    editTransaction: 3,
    deleteTransaction: 2,
    filterTransactions: 6,
    clearFilters: 4,
    addGoal: 6,
    contributeToGoal: 3,
    addBudget: 4,
    updateProfile: 4,
    updateWorkspace: 4,
    addCategory: 5,
    useQuickAdd: 4,
    readInsights: 6,
    signOut: 3,
  },
  churning: {
    navigateDashboard: 60,
    navigateTransactions: 6,
    navigateInsights: 2,
    navigateGoals: 1,
    navigateSettings: 1,
    addTransaction: 2,
    editTransaction: 0,
    deleteTransaction: 0,
    filterTransactions: 1,
    clearFilters: 0,
    addGoal: 0,
    contributeToGoal: 0,
    addBudget: 0,
    updateProfile: 0,
    updateWorkspace: 0,
    addCategory: 0,
    useQuickAdd: 1,
    readInsights: 1,
    signOut: 5,
  },
};

export interface ArchetypeDef {
  /** Chance this persona's session actually happens on a given planned visit. */
  showUpRate: number;
  sessionLengthMin: number;
  sessionLengthMax: number;
  /** Chance a session ends early instead of walking to a natural stop. */
  abandonRate: number;
  /** How many months of transaction backstory this persona's workspace carries. */
  historyMonths: number;
  /** How many historical transactions are seeded across that window. */
  historyTx: number;
  actionWeights: Record<ActionName, number>;
}

/** Exact values from the plan — see task-2-brief.md "Shared reference". */
export const ARCHETYPES: Record<Archetype, ArchetypeDef> = {
  power: {
    showUpRate: 0.85,
    sessionLengthMin: 12,
    sessionLengthMax: 25,
    abandonRate: 0.1,
    historyMonths: 12,
    historyTx: 180,
    actionWeights: ACTION_WEIGHTS.power,
  },
  regular: {
    showUpRate: 0.55,
    sessionLengthMin: 6,
    sessionLengthMax: 14,
    abandonRate: 0.18,
    historyMonths: 8,
    historyTx: 90,
    actionWeights: ACTION_WEIGHTS.regular,
  },
  casual: {
    showUpRate: 0.25,
    sessionLengthMin: 3,
    sessionLengthMax: 8,
    abandonRate: 0.3,
    historyMonths: 4,
    historyTx: 30,
    actionWeights: ACTION_WEIGHTS.casual,
  },
  explorer: {
    showUpRate: 0.4,
    sessionLengthMin: 8,
    sessionLengthMax: 20,
    abandonRate: 0.45,
    historyMonths: 2,
    historyTx: 15,
    actionWeights: ACTION_WEIGHTS.explorer,
  },
  churning: {
    showUpRate: 0.08,
    sessionLengthMin: 2,
    sessionLengthMax: 5,
    abandonRate: 0.55,
    historyMonths: 10,
    historyTx: 60,
    actionWeights: ACTION_WEIGHTS.churning,
  },
};

// =============================================================================
// Accounts
// =============================================================================

export type AccountTier = "free" | "pro" | "enterprise";
export type AccountSize = "small" | "medium" | "large";

export interface Account {
  id: string;
  name: string;
  region: Region;
  tier: AccountTier;
  size: AccountSize;
}

// 12 accounts: 3 large (6-8 members), 4 medium (3-4), 5 small (1-2) — see
// PERSONAS below for the membership that adds up to exactly these sizes and
// to 40 personas total.
export const ACCOUNTS: Account[] = [
  { id: "acct-in-large-1", name: "Bengaluru FinCollective", region: "IN", tier: "enterprise", size: "large" },
  { id: "acct-eu-large-1", name: "Berlin Ledger Guild", region: "EU", tier: "enterprise", size: "large" },
  { id: "acct-us-large-1", name: "Austin Money Circle", region: "US", tier: "enterprise", size: "large" },

  { id: "acct-in-medium-1", name: "Mumbai Budget Co-op", region: "IN", tier: "pro", size: "medium" },
  { id: "acct-eu-medium-1", name: "Amsterdam Thrift Club", region: "EU", tier: "pro", size: "medium" },
  { id: "acct-us-medium-1", name: "Denver Household Fund", region: "US", tier: "pro", size: "medium" },
  { id: "acct-in-medium-2", name: "Pune Freelancers Guild", region: "IN", tier: "free", size: "medium" },

  { id: "acct-eu-small-1", name: "Lisbon Two-Person Ledger", region: "EU", tier: "free", size: "small" },
  { id: "acct-us-small-1", name: "Seattle Roommate Split", region: "US", tier: "free", size: "small" },
  { id: "acct-in-small-1", name: "Jaipur Solo Saver", region: "IN", tier: "free", size: "small" },
  { id: "acct-eu-small-2", name: "Dublin Solo Saver", region: "EU", tier: "pro", size: "small" },
  { id: "acct-us-small-2", name: "Chicago Solo Saver", region: "US", tier: "free", size: "small" },
];

// =============================================================================
// Personas
// =============================================================================

export interface Persona {
  /** Hardcoded UUID v4 literal — becomes the app's User.id and analytics visitor id. Never generate at runtime. */
  id: string;
  username: string;
  password: string;
  displayName: string;
  accountId: string;
  region: Region;
  archetype: Archetype;
}

// 40 personas across the 12 accounts above. Every id below is a fixed UUID
// v4 literal — do not regenerate these. Distribution of archetypes:
// power 5, regular 14, casual 11, explorer 6, churning 4 (= 40).
export const PERSONAS: Persona[] = [
  // acct-in-large-1 (IN, enterprise, large) — 7 members
  { id: "14bd5777-7ab5-42f9-8001-ea2642f2261b", username: "priya_sharma", password: PERSONA_PASSWORD, displayName: "Priya Sharma", accountId: "acct-in-large-1", region: "IN", archetype: "power" },
  { id: "2ee1e350-1eec-4ca3-9538-3f244e101130", username: "arjun_reddy", password: PERSONA_PASSWORD, displayName: "Arjun Reddy", accountId: "acct-in-large-1", region: "IN", archetype: "power" },
  { id: "dc3e5455-d819-4009-8764-a4f4eeeed7f5", username: "neha_gupta", password: PERSONA_PASSWORD, displayName: "Neha Gupta", accountId: "acct-in-large-1", region: "IN", archetype: "regular" },
  { id: "03b541ed-98d3-4467-b00e-cb899d71f415", username: "rohan_kapoor", password: PERSONA_PASSWORD, displayName: "Rohan Kapoor", accountId: "acct-in-large-1", region: "IN", archetype: "regular" },
  { id: "09a2aa02-ac1a-4bba-bad8-41e825d38cd6", username: "sneha_joshi", password: PERSONA_PASSWORD, displayName: "Sneha Joshi", accountId: "acct-in-large-1", region: "IN", archetype: "regular" },
  { id: "9c53a9fa-dc61-4caa-a125-e9edbc44ed89", username: "aditya_rao", password: PERSONA_PASSWORD, displayName: "Aditya Rao", accountId: "acct-in-large-1", region: "IN", archetype: "casual" },
  { id: "d9317785-0bfc-4939-82ab-d2eb02fdce22", username: "ishita_verma", password: PERSONA_PASSWORD, displayName: "Ishita Verma", accountId: "acct-in-large-1", region: "IN", archetype: "explorer" },

  // acct-eu-large-1 (EU, enterprise, large) — 7 members
  { id: "6d8e8395-16cf-477e-a856-a66f798090e9", username: "lukas_mueller", password: PERSONA_PASSWORD, displayName: "Lukas Müller", accountId: "acct-eu-large-1", region: "EU", archetype: "power" },
  { id: "4117ff5e-6f82-4052-884c-9edefa68b54c", username: "sophie_dubois", password: PERSONA_PASSWORD, displayName: "Sophie Dubois", accountId: "acct-eu-large-1", region: "EU", archetype: "regular" },
  { id: "2faefa29-b2df-41ff-a9db-8aa1be32991d", username: "marco_rossi", password: PERSONA_PASSWORD, displayName: "Marco Rossi", accountId: "acct-eu-large-1", region: "EU", archetype: "regular" },
  { id: "e47e1dd9-53cf-4e00-9e94-c5d3d94abca5", username: "emma_andersson", password: PERSONA_PASSWORD, displayName: "Emma Andersson", accountId: "acct-eu-large-1", region: "EU", archetype: "regular" },
  { id: "7dc01f49-0c97-4c79-be1f-d2a18108c74f", username: "jan_kowalski", password: PERSONA_PASSWORD, displayName: "Jan Kowalski", accountId: "acct-eu-large-1", region: "EU", archetype: "casual" },
  { id: "5c7069d0-a448-4fe5-891b-e54153321439", username: "isabel_fernandez", password: PERSONA_PASSWORD, displayName: "Isabel Fernández", accountId: "acct-eu-large-1", region: "EU", archetype: "casual" },
  { id: "c0ecde04-ff45-4087-b361-cdf5000c603a", username: "thomas_weber", password: PERSONA_PASSWORD, displayName: "Thomas Weber", accountId: "acct-eu-large-1", region: "EU", archetype: "churning" },

  // acct-us-large-1 (US, enterprise, large) — 6 members
  { id: "7190ae91-812b-4656-be69-2115e68a18f5", username: "jason_miller", password: PERSONA_PASSWORD, displayName: "Jason Miller", accountId: "acct-us-large-1", region: "US", archetype: "power" },
  { id: "5f925e27-8fc5-463e-a5c0-73338ddfda3e", username: "ashley_brown", password: PERSONA_PASSWORD, displayName: "Ashley Brown", accountId: "acct-us-large-1", region: "US", archetype: "regular" },
  { id: "ac767086-1eea-4d63-8134-c9a519f44ee1", username: "michael_davis", password: PERSONA_PASSWORD, displayName: "Michael Davis", accountId: "acct-us-large-1", region: "US", archetype: "regular" },
  { id: "fa3b8990-15dd-418e-88c5-cf3694c451db", username: "jessica_wilson", password: PERSONA_PASSWORD, displayName: "Jessica Wilson", accountId: "acct-us-large-1", region: "US", archetype: "casual" },
  { id: "281de50b-98e5-4558-819a-027d9d3ade61", username: "brian_thompson", password: PERSONA_PASSWORD, displayName: "Brian Thompson", accountId: "acct-us-large-1", region: "US", archetype: "casual" },
  { id: "ca4d00e4-fa92-4a22-96fd-a5bc29308317", username: "sarah_martinez", password: PERSONA_PASSWORD, displayName: "Sarah Martinez", accountId: "acct-us-large-1", region: "US", archetype: "explorer" },

  // acct-in-medium-1 (IN, pro, medium) — 4 members
  { id: "70d62be8-2186-46a5-bc40-e6aa5774bda6", username: "kavya_menon", password: PERSONA_PASSWORD, displayName: "Kavya Menon", accountId: "acct-in-medium-1", region: "IN", archetype: "regular" },
  { id: "a00015af-a239-445f-90de-c2b60f32aebb", username: "vikram_nair", password: PERSONA_PASSWORD, displayName: "Vikram Nair", accountId: "acct-in-medium-1", region: "IN", archetype: "regular" },
  { id: "8c11ecec-4241-4635-b304-c58ee364f7e8", username: "divya_pillai", password: PERSONA_PASSWORD, displayName: "Divya Pillai", accountId: "acct-in-medium-1", region: "IN", archetype: "casual" },
  { id: "2ca6f1f0-2702-47ee-844e-0b58cf6d38ff", username: "karan_malhotra", password: PERSONA_PASSWORD, displayName: "Karan Malhotra", accountId: "acct-in-medium-1", region: "IN", archetype: "explorer" },

  // acct-eu-medium-1 (EU, pro, medium) — 3 members
  { id: "0eb18de7-1f21-4171-9c78-3834a3c9669f", username: "charlotte_laurent", password: PERSONA_PASSWORD, displayName: "Charlotte Laurent", accountId: "acct-eu-medium-1", region: "EU", archetype: "regular" },
  { id: "7464fb66-d588-4f20-ab67-0b6cad83f3a6", username: "erik_johansson", password: PERSONA_PASSWORD, displayName: "Erik Johansson", accountId: "acct-eu-medium-1", region: "EU", archetype: "casual" },
  { id: "23e819f2-5736-41d1-85e4-3b9681cc2524", username: "anna_nowak", password: PERSONA_PASSWORD, displayName: "Anna Nowak", accountId: "acct-eu-medium-1", region: "EU", archetype: "churning" },

  // acct-us-medium-1 (US, pro, medium) — 3 members
  { id: "fc006b84-04c6-43cc-955f-6b70676113ff", username: "kevin_anderson", password: PERSONA_PASSWORD, displayName: "Kevin Anderson", accountId: "acct-us-medium-1", region: "US", archetype: "regular" },
  { id: "6fb5a2c4-c250-4201-b824-84d4b02d90c7", username: "lauren_taylor", password: PERSONA_PASSWORD, displayName: "Lauren Taylor", accountId: "acct-us-medium-1", region: "US", archetype: "casual" },
  { id: "36d06518-e886-401c-af12-0fc33a770752", username: "ryan_cooper", password: PERSONA_PASSWORD, displayName: "Ryan Cooper", accountId: "acct-us-medium-1", region: "US", archetype: "explorer" },

  // acct-in-medium-2 (IN, free, medium) — 3 members
  { id: "03d8cdf9-28b1-4873-b5f4-61bd8f90fce5", username: "meera_krishnan", password: PERSONA_PASSWORD, displayName: "Meera Krishnan", accountId: "acct-in-medium-2", region: "IN", archetype: "casual" },
  { id: "616c1b38-f4e6-4616-995a-9f9e7c8f8892", username: "siddharth_chatterjee", password: PERSONA_PASSWORD, displayName: "Siddharth Chatterjee", accountId: "acct-in-medium-2", region: "IN", archetype: "casual" },
  { id: "3c54b4a5-9c56-4974-8a38-9af23c97e6ea", username: "pooja_bhatt", password: PERSONA_PASSWORD, displayName: "Pooja Bhatt", accountId: "acct-in-medium-2", region: "IN", archetype: "churning" },

  // acct-eu-small-1 (EU, free, small) — 2 members
  { id: "02eed5fd-f854-41fa-9e34-78355b1b823b", username: "lucas_silva", password: PERSONA_PASSWORD, displayName: "Lucas Silva", accountId: "acct-eu-small-1", region: "EU", archetype: "regular" },
  { id: "d1ce793d-122c-4cae-b6ef-d8d33cbc689a", username: "freya_larsen", password: PERSONA_PASSWORD, displayName: "Freya Larsen", accountId: "acct-eu-small-1", region: "EU", archetype: "explorer" },

  // acct-us-small-1 (US, free, small) — 2 members
  { id: "008e5bbe-e2f1-4983-b405-22572998fb66", username: "megan_white", password: PERSONA_PASSWORD, displayName: "Megan White", accountId: "acct-us-small-1", region: "US", archetype: "casual" },
  { id: "13408d47-e02f-4c8e-aa58-fd68935bbd2f", username: "tyler_scott", password: PERSONA_PASSWORD, displayName: "Tyler Scott", accountId: "acct-us-small-1", region: "US", archetype: "churning" },

  // acct-in-small-1 (IN, free, small) — 1 member
  { id: "9453fcf2-04c7-4f71-b20f-6e4317437044", username: "vivek_shah", password: PERSONA_PASSWORD, displayName: "Vivek Shah", accountId: "acct-in-small-1", region: "IN", archetype: "power" },

  // acct-eu-small-2 (EU, pro, small) — 1 member
  { id: "93d9aa9d-d100-48d9-88eb-b744d4643d20", username: "nikolai_petrov", password: PERSONA_PASSWORD, displayName: "Nikolai Petrov", accountId: "acct-eu-small-2", region: "EU", archetype: "explorer" },

  // acct-us-small-2 (US, free, small) — 1 member
  { id: "005b9d97-1bf4-4687-bb23-3f25674dff0b", username: "derek_johnson", password: PERSONA_PASSWORD, displayName: "Derek Johnson", accountId: "acct-us-small-2", region: "US", archetype: "regular" },
];

// =============================================================================
// Deterministic seed data
// =============================================================================

export interface SeedData {
  user: User;
  workspace: Workspace;
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** "Year-month" as a single increasing integer (year * 12 + month), so month arithmetic never has to deal with `Date` rollover surprises. */
function ymFromDate(date: Date): number {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function daysInMonth(ym: number): number {
  const year = Math.floor(ym / 12);
  const month = ym - year * 12;
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function dateFromYm(ym: number, day: number, hour: number, minute: number): Date {
  const year = Math.floor(ym / 12);
  const month = ym - year * 12;
  return new Date(Date.UTC(year, month, day, hour, minute, 0, 0));
}

/** yyyy-MM-dd, the format the app's native date inputs and Transaction.date use. */
function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function avatarInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase();
}

/** A deterministic, UUID-v4-shaped id built purely from `rng` draws — never `crypto.randomUUID()` or `Math.random()`. */
function deterministicId(rng: Rng): string {
  const hex = (n: number) => Array.from({ length: n }, () => rng.int(0, 15).toString(16)).join("");
  const variant = (8 + rng.int(0, 3)).toString(16); // one of 8, 9, a, b
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}

/** Picks `count` distinct items from `items` (without replacement), deterministically via `rng`. */
function pickDistinct<T>(rng: Rng, items: T[], count: number): T[] {
  const pool = items.slice();
  const n = Math.min(count, pool.length);
  const result: T[] = [];
  for (let i = 0; i < n; i++) {
    const index = rng.int(0, pool.length - 1);
    result.push(pool[index]);
    pool.splice(index, 1);
  }
  return result;
}

function roundToUnit(value: number, unit: number): number {
  return Math.round(value / unit) * unit;
}

/**
 * Picks a date within the last `lookbackMonths` months of `now`, weighted so
 * more recent months are more likely than older ones — a flat spread looks
 * synthetic in exactly the charts this data exists to populate. Never later
 * than `now` itself.
 */
function pickHistoryDate(rng: Rng, lookbackMonths: number, now: Date): Date {
  const nowYm = ymFromDate(now);
  const monthsAgoOptions = Array.from({ length: lookbackMonths }, (_, i) => i);
  // monthsAgo = 0 is the most recent month; weight decreases as it gets older.
  const monthsAgo = rng.weighted(monthsAgoOptions, (m) => lookbackMonths - m);
  const targetYm = nowYm - monthsAgo;
  const maxDay = monthsAgo === 0 ? now.getUTCDate() : daysInMonth(targetYm);
  const day = rng.int(1, maxDay);
  const hour = rng.int(0, 23);
  const minute = rng.int(0, 59);
  const when = dateFromYm(targetYm, day, hour, minute);
  // When monthsAgo === 0 and day === now's day, hour/minute are still drawn
  // from the full day — clamp so a "historical" record can never carry a
  // timestamp later than `now` itself.
  return new Date(Math.min(when.getTime(), now.getTime()));
}

interface CategoryEntry {
  category: Category;
  seed: CategorySeed;
}

function buildCategories(rng: Rng, workspaceId: string): CategoryEntry[] {
  const entries: CategoryEntry[] = DEFAULT_CATEGORY_SEEDS.map((seed) => ({
    seed,
    category: {
      id: deterministicId(rng),
      workspaceId,
      name: seed.name,
      color: seed.color,
      scope: seed.scope,
      isDefault: true,
    },
  }));

  const customCount = rng.int(CUSTOM_CATEGORY_COUNT_MIN, CUSTOM_CATEGORY_COUNT_MAX);
  const customPicks = pickDistinct(rng, CUSTOM_CATEGORY_SEEDS, customCount);
  for (const seed of customPicks) {
    entries.push({
      seed,
      category: {
        id: deterministicId(rng),
        workspaceId,
        name: seed.name,
        color: seed.color,
        scope: seed.scope,
        isDefault: false,
      },
    });
  }

  return entries;
}

function buildTransactions(
  rng: Rng,
  workspaceId: string,
  categoryEntries: CategoryEntry[],
  historyMonths: number,
  historyTx: number,
  now: Date,
): Transaction[] {
  const expensePool = categoryEntries.filter((e) => e.seed.scope === "expense" || e.seed.scope === "both");
  const incomePool = categoryEntries.filter((e) => e.seed.scope === "income" || e.seed.scope === "both");

  const transactions: Transaction[] = [];
  for (let i = 0; i < historyTx; i++) {
    const type: TransactionType = rng.chance(EXPENSE_TRANSACTION_RATE) ? "expense" : "income";
    const entry = rng.pick(type === "expense" ? expensePool : incomePool);
    const amountCents = rng.int(entry.seed.amountMin * 100, entry.seed.amountMax * 100);
    const amount = amountCents / 100;
    const description = rng.pick(entry.seed.descriptions);
    const when = pickHistoryDate(rng, historyMonths, now);
    const timestamp = when.toISOString();

    transactions.push({
      id: deterministicId(rng),
      workspaceId,
      type,
      amount,
      categoryId: entry.category.id,
      description,
      date: toDateOnly(when),
      isRecurring: rng.chance(entry.seed.recurringRate),
      notes: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  return transactions;
}

function buildBudgets(
  rng: Rng,
  workspaceId: string,
  categoryEntries: CategoryEntry[],
  transactions: Transaction[],
  historyMonths: number,
  workspaceCreatedAt: string,
): Budget[] {
  const expenseEntries = categoryEntries.filter((e) => e.seed.scope === "expense" || e.seed.scope === "both");
  const count = rng.int(BUDGET_COUNT_MIN, BUDGET_COUNT_MAX);
  const chosen = pickDistinct(rng, expenseEntries, count);

  return chosen.map((entry) => {
    const categoryTx = transactions.filter((t) => t.categoryId === entry.category.id && t.type === "expense");
    const hasHistory = categoryTx.length > 0;
    const averageAmount = hasHistory
      ? categoryTx.reduce((sum, t) => sum + t.amount, 0) / categoryTx.length
      : (entry.seed.amountMin + entry.seed.amountMax) / 2;
    // A category can end up with zero seeded transactions over a short
    // history window; assume at least one a month rather than dividing by
    // its true (zero) rate, so the limit still lands on a reachable number.
    const txPerMonth = hasHistory ? categoryTx.length / historyMonths : 1;
    const expectedMonthlySpend = averageAmount * txPerMonth;
    // Headroom varies per persona/category so some run comfortably under
    // budget (> 1) and others cross it (< 1) — budget-threshold analytics
    // needs some seeded data that actually exceeds its limit.
    const headroom = BUDGET_HEADROOM_MIN + rng.next() * (BUDGET_HEADROOM_MAX - BUDGET_HEADROOM_MIN);
    const monthlyLimit = roundToUnit(expectedMonthlySpend * headroom, AMOUNT_ROUNDING_UNIT) || AMOUNT_ROUNDING_UNIT;
    return {
      id: deterministicId(rng),
      workspaceId,
      categoryId: entry.category.id,
      monthlyLimit,
      createdAt: workspaceCreatedAt,
      updatedAt: workspaceCreatedAt,
    };
  });
}

function buildGoals(
  rng: Rng,
  workspaceId: string,
  historyMonths: number,
  workspaceCreatedAt: string,
  now: Date,
): Goal[] {
  const nowYm = ymFromDate(now);
  const count = rng.int(GOAL_COUNT_MIN, GOAL_COUNT_MAX);
  const chosenSeeds = pickDistinct(rng, GOAL_SEED_POOL, count);
  const lookbackMonths = Math.min(historyMonths, GOAL_CONTRIBUTION_LOOKBACK_MONTHS);

  return chosenSeeds.map((seed) => {
    const targetAmount = roundToUnit(rng.int(seed.targetMin, seed.targetMax), AMOUNT_ROUNDING_UNIT);
    const color = rng.pick(SWATCH_PRESET_COLORS);

    const contributionCount = rng.int(GOAL_CONTRIBUTION_COUNT_MIN, GOAL_CONTRIBUTION_COUNT_MAX);
    const contributions: GoalContribution[] = [];
    let contributedSoFar = 0;
    for (let i = 0; i < contributionCount && contributedSoFar < targetAmount; i++) {
      const percent = rng.int(GOAL_CONTRIBUTION_PERCENT_MIN, GOAL_CONTRIBUTION_PERCENT_MAX);
      const rawAmount = roundToUnit((targetAmount * percent) / 100, AMOUNT_ROUNDING_UNIT) || AMOUNT_ROUNDING_UNIT;
      // Trim (never exceed) the remaining amount to fund, so a goal can be
      // fully funded but never overfunded past its target — an overfunded
      // goal renders as a progress bar past 100%, which reads as a bug.
      const remaining = targetAmount - contributedSoFar;
      const amount = Math.min(rawAmount, remaining);
      const when = pickHistoryDate(rng, lookbackMonths, now);
      contributions.push({
        id: deterministicId(rng),
        amount,
        date: toDateOnly(when),
      });
      contributedSoFar += amount;
    }
    contributions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    const createdAt = contributions.length > 0 ? `${contributions[0].date}T00:00:00.000Z` : workspaceCreatedAt;
    const updatedAt =
      contributions.length > 0 ? `${contributions[contributions.length - 1].date}T00:00:00.000Z` : workspaceCreatedAt;

    const goal: Goal = {
      id: deterministicId(rng),
      workspaceId,
      name: seed.name,
      targetAmount,
      color,
      contributions,
      createdAt,
      updatedAt,
    };

    if (rng.chance(GOAL_DEADLINE_CHANCE)) {
      const monthsAhead = rng.int(GOAL_DEADLINE_MONTHS_MIN, GOAL_DEADLINE_MONTHS_MAX);
      goal.deadline = toDateOnly(dateFromYm(nowYm + monthsAhead, now.getUTCDate(), 0, 0));
    }

    return goal;
  });
}

/**
 * Builds a persona's full workspace backstory: user, workspace, categories,
 * historical transactions, budgets and goals. Every id and random choice is
 * derived from `makeRng(persona.id)`, and every date is computed as an
 * offset backwards from the `now` argument rather than the wall clock — so
 * this is a pure function of `(persona, now)` and returns byte-identical
 * output every time it's called with the same two arguments.
 *
 * `now` is deliberately required, not defaulted: an implicit `new Date()`
 * would silently reintroduce a non-deterministic function, and it would also
 * mean seeded history goes stale — a persona seeded once and never
 * re-seeded would look increasingly inactive as real time passed. Callers
 * pass the real current time; tests pass a fixed `Date` and get
 * byte-identical output across calls.
 *
 * `user.passwordHash` and `user.salt` are left empty; Task 3 fills them in
 * (hashing needs the browser's SubtleCrypto, which isn't available here).
 */
export function buildSeedData(persona: Persona, now: Date): SeedData {
  const rng = makeRng(persona.id);
  const archetypeDef = ARCHETYPES[persona.archetype];
  const nowYm = ymFromDate(now);

  const workspaceId = deterministicId(rng);
  const workspaceOption = rng.pick(REGION_WORKSPACE_OPTIONS[persona.region]);
  const nameTemplate = rng.pick(WORKSPACE_NAME_TEMPLATES);
  const firstName = persona.displayName.trim().split(/\s+/)[0] ?? persona.displayName;
  const workspaceName = nameTemplate.replace("{name}", firstName);

  const earliestYm = nowYm - (archetypeDef.historyMonths - 1);
  const earliestDate = dateFromYm(earliestYm, 1, 0, 0);
  const bufferDays = rng.int(WORKSPACE_CREATED_BUFFER_DAYS_MIN, WORKSPACE_CREATED_BUFFER_DAYS_MAX);
  const workspaceCreatedAt = new Date(earliestDate.getTime() - bufferDays * MS_PER_DAY).toISOString();

  const workspace: Workspace = {
    id: workspaceId,
    userId: persona.id,
    name: workspaceName,
    currency: workspaceOption.currency,
    locale: workspaceOption.locale,
    createdAt: workspaceCreatedAt,
  };

  const user: User = {
    id: persona.id,
    username: persona.username,
    displayName: persona.displayName,
    avatarInitials: avatarInitials(persona.displayName),
    passwordHash: "",
    salt: "",
    createdAt: workspaceCreatedAt,
  };

  const categoryEntries = buildCategories(rng, workspaceId);
  const transactions = buildTransactions(
    rng,
    workspaceId,
    categoryEntries,
    archetypeDef.historyMonths,
    archetypeDef.historyTx,
    now,
  );
  const budgets = buildBudgets(
    rng,
    workspaceId,
    categoryEntries,
    transactions,
    archetypeDef.historyMonths,
    workspaceCreatedAt,
  );
  const goals = buildGoals(rng, workspaceId, archetypeDef.historyMonths, workspaceCreatedAt, now);

  return {
    user,
    workspace,
    categories: categoryEntries.map((entry) => entry.category),
    transactions,
    budgets,
    goals,
  };
}
