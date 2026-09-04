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
// Almost all of this is inert data — no randomness, no dates, no ids. The
// generation logic that draws from these tables via the seeded PRNG lives in
// `bot/personas.ts`. The one exception is the username/email generator below:
// handles have to be derived from a name rather than listed, so the pools and
// the small pure function that combines them belong together, here, next to
// every other content pool.

import { SIGNUP_USERNAME_MAX_LEN, SIGNUP_USERNAME_MIN_LEN, type Region, type Rng } from "./config";

// --- Persona identity & credentials ------------------------------------------

/**
 * Shared login password for every seeded persona. This is fixture data for a
 * throwaway dummy app seeded by a bot, not a real credential — see the "No
 * secrets in the repo" constraint, which this does not violate.
 */
export const PERSONA_PASSWORD = "UsageBot#2026";

// --- Username / email generation ---------------------------------------------
//
// Handles are DERIVED from a person's real name rather than listed, so a
// username and an email always belong to the same human and neither reads as
// a generated string. That is the whole point: analytics discards identity
// data that looks synthetic, and "first name + timestamp" was the clearest
// possible tell.
//
// Pure functions of (name, domain, rng) — same three arguments in, same
// identity out, so the 40 personas are stable run to run.

export interface Identity {
  username: string;
  email: string;
}

interface NameParts {
  first: string;
  last: string;
}

/**
 * Lowercase ASCII form of one name word: "Muller" from "Müller",
 * "fernandez" from "Fernández", "obrien" from "O'Brien". The app's username
 * rule is `[A-Za-z0-9_]` only, so anything a fold leaves behind is dropped
 * rather than substituted.
 */
function asciiFold(word: string): string {
  return word
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Splits a display name into ASCII-folded first and last parts. Throws on a
 * name with no surname rather than quietly producing a one-word handle: every
 * caller supplies two words, so a single word means the pool or a PERSONA row
 * is wrong, and that is worth failing loudly at startup.
 */
function nameParts(displayName: string): NameParts {
  const words = displayName.trim().split(/\s+/).map(asciiFold).filter((word) => word.length > 0);
  if (words.length < 2) {
    throw new Error(`"${displayName}" has no usable surname — identities need a first and a last name`);
  }
  return { first: words[0], last: words[words.length - 1] };
}

/**
 * The three registers a real person picks a handle in. Drawing a register
 * first, then a pattern from it, is what keeps a username and an email
 * recognisably the same person's: someone terse enough to be `psharma` is
 * unlikely to hand out `priya.sharma@`.
 */
type IdentityStyle = "full" | "initialled" | "compact";

const IDENTITY_STYLES: IdentityStyle[] = ["full", "initialled", "compact"];

/** Username shapes. No dots and no "@" anywhere — the app rejects both. */
const USERNAME_PATTERNS: Record<IdentityStyle, ((name: NameParts) => string)[]> = {
  full: [
    ({ first, last }) => `${first}_${last}`,
    ({ first, last }) => `${first}${last}`,
    ({ first, last }) => `${last}_${first}`,
  ],
  initialled: [
    ({ first, last }) => `${first[0]}${last}`,
    ({ first, last }) => `${first}_${last[0]}`,
    ({ first, last }) => `${first}${last[0]}`,
  ],
  compact: [
    ({ first }) => first,
    ({ first, last }) => `${first}${last.slice(0, 2)}`,
    ({ first, last }) => `${first[0]}_${last}`,
  ],
};

/** Email local parts. Dots are the norm here, which is exactly why they read as real. */
const EMAIL_LOCAL_PATTERNS: Record<IdentityStyle, ((name: NameParts) => string)[]> = {
  full: [
    ({ first, last }) => `${first}.${last}`,
    ({ first, last }) => `${first}${last}`,
    ({ first, last }) => `${first}_${last}`,
  ],
  initialled: [
    ({ first, last }) => `${first[0]}.${last}`,
    ({ first, last }) => `${first}.${last[0]}`,
    ({ first, last }) => `${last}.${first[0]}`,
  ],
  compact: [
    ({ first }) => first,
    ({ first, last }) => `${first}${last[0]}`,
    ({ first, last }) => `${first[0]}${last}`,
  ],
};

/**
 * Chance the email is written in a different register from the username.
 * Non-zero because people genuinely are inconsistent — a work address is
 * assigned, a username is chosen — but low, so the two stay recognisably one
 * person's most of the time.
 */
const IDENTITY_STYLE_DRIFT_CHANCE = 0.25;
/** Chance a handle carries a number at all. Most people's do not. */
const IDENTITY_NUMBER_SUFFIX_CHANCE = 0.28;
/** Given a number, the chance it is the full year (`1991`) rather than two digits (`91`). */
const IDENTITY_FULL_YEAR_CHANCE = 0.3;
/** Given a numbered username, the chance the same number also shows up in the email. */
const IDENTITY_SHARED_NUMBER_CHANCE = 0.45;
/**
 * The number is a birth year, never a counter — `91` reads as a person, `2`
 * reads as a fixture. The range stops at 1999 on purpose: a 2001 birth year
 * abbreviates to `01`, which is indistinguishable from the sequential
 * numbering this work exists to get rid of.
 */
const IDENTITY_BIRTH_YEAR_MIN = 1974;
const IDENTITY_BIRTH_YEAR_MAX = 1999;

/**
 * Forces a generated username inside the app's 3-30 character rule. Short
 * handles (`tom`, `jan`) are grown with the surname rather than padded with
 * digits, which would look exactly like the fixture data this replaces; long
 * ones are cut and never left ending in an underscore.
 */
function fitUsername(candidate: string, name: NameParts): string {
  let username = candidate;
  if (username.length < SIGNUP_USERNAME_MIN_LEN) username = `${name.first}_${name.last}`;
  if (username.length > SIGNUP_USERNAME_MAX_LEN) {
    username = username.slice(0, SIGNUP_USERNAME_MAX_LEN).replace(/_+$/, "");
  }
  return username;
}

/**
 * A username and an email for one person on one domain.
 *
 * Both come off the same name and the same register draw, and the email is
 * nudged onto a different pattern whenever the two would otherwise come out
 * byte-identical — real people do not use one format in both places.
 */
export function buildIdentity(rng: Rng, displayName: string, domain: string): Identity {
  const name = nameParts(displayName);

  const style = rng.pick(IDENTITY_STYLES);
  const emailStyle = rng.chance(IDENTITY_STYLE_DRIFT_CHANCE) ? rng.pick(IDENTITY_STYLES) : style;

  const year = rng.int(IDENTITY_BIRTH_YEAR_MIN, IDENTITY_BIRTH_YEAR_MAX);
  const numbered = rng.chance(IDENTITY_NUMBER_SUFFIX_CHANCE);
  const suffix = !numbered
    ? ""
    : rng.chance(IDENTITY_FULL_YEAR_CHANCE)
      ? String(year)
      : String(year % 100).padStart(2, "0");
  const emailSuffix = suffix !== "" && rng.chance(IDENTITY_SHARED_NUMBER_CHANCE) ? suffix : "";

  const username = fitUsername(`${rng.pick(USERNAME_PATTERNS[style])(name)}${suffix}`, name);

  const localPatterns = EMAIL_LOCAL_PATTERNS[emailStyle];
  const localIndex = rng.int(0, localPatterns.length - 1);
  let local = `${localPatterns[localIndex](name)}${emailSuffix}`;
  // Same string in both places is the one shape that gives the generator
  // away, so step to the next pattern in the register rather than shipping it.
  if (local === username) {
    local = `${localPatterns[(localIndex + 1) % localPatterns.length](name)}${emailSuffix}`;
  }

  return { username, email: `${local}@${domain}` };
}

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

// --- New visitors -------------------------------------------------------------
//
// Content for the sign-up sessions the run orchestrator drives through the
// real UI. The knobs that decide how often those happen and what they do live
// in config.ts; the strings they type live here, next to every other content
// pool.

/**
 * First and last names a brand-new visitor signs up with, drawn independently
 * and combined, so the two pools multiply out to 48 x 40 = 1,920 distinct
 * people rather than the dozen a list of full names gave. Deliberately
 * disjoint from the 40 PERSONAS — a new visitor is a new person — and ASCII
 * throughout, since the app's username rule is `[A-Za-z0-9_]` only. A surname
 * is mandatory: the profile form's rename action needs one to offer its
 * "First L." variant.
 */
export const NEW_VISITOR_FIRST_NAMES: string[] = [
  "Alex", "Nadia", "Tom", "Grace", "Felix", "Mira", "Owen", "Hana",
  "Diego", "Elena", "Rahul", "Clara", "Nina", "Victor", "Amara", "Jonas",
  "Leah", "Omar", "Sofia", "Caleb", "Yuki", "Marta", "Dylan", "Ines",
  "Nikhil", "Bianca", "Theo", "Ayesha", "Gustav", "Naomi", "Elias", "Tara",
  "Mateo", "Zara", "Hugo", "Simone", "Ravi", "Beatrix", "Callum", "Anika",
  "Pierre", "Delia", "Samir", "Greta", "Noor", "Adrian", "Lena", "Kofi",
];

export const NEW_VISITOR_LAST_NAMES: string[] = [
  "Carter", "Haddad", "Whitfield", "Okafor", "Brandt", "Kowalczyk", "Bradley", "Sato",
  "Morales", "Vasquez", "Iyer", "Bergman", "Lindqvist", "Novak", "Delgado", "Osei",
  "Ferrara", "Bhattacharya", "Keane", "Moreau", "Vandenberg", "Salazar", "Nakamura", "Ellsworth",
  "Radich", "Baptiste", "Hollingsworth", "Aziz", "Quinn", "Tremblay", "Sandoval", "Fitzgerald",
  "Ibarra", "Grimaldi", "Petersen", "Chowdhury", "Marchetti", "Kessler", "Duval", "Ashworth",
];

/**
 * Where an individual signing up on their own keeps their mail. Real consumer
 * providers on purpose: a new visitor is not a company member, so an invented
 * company domain would be the wrong shape, and anything from the
 * example.com/test.com family is exactly the tell this work exists to remove.
 */
export const CONSUMER_EMAIL_DOMAINS: string[] = [
  "gmail.com",
  "outlook.com",
  "yahoo.com",
  "icloud.com",
  "proton.me",
  "hotmail.com",
  "fastmail.com",
  "gmx.net",
  "live.com",
  "zoho.com",
];

export interface VisitorIdentity extends Identity {
  displayName: string;
}

/** A whole new person: name, username, and an email on a consumer provider. */
export function buildNewVisitorIdentity(rng: Rng): VisitorIdentity {
  const displayName = `${rng.pick(NEW_VISITOR_FIRST_NAMES)} ${rng.pick(NEW_VISITOR_LAST_NAMES)}`;
  const domain = rng.pick(CONSUMER_EMAIL_DOMAINS);
  return { displayName, ...buildIdentity(rng, displayName, domain) };
}

// The exact option labels the app's Currency and Number Format selects
// render, keyed by the code stored on the workspace. Copied verbatim from the
// CURRENCIES / LOCALES arrays in
// src/features/workspace/components/workspace-setup-form.tsx — the bot has to
// click an option by its visible text, and REGION_WORKSPACE_OPTIONS above
// only carries codes. Complete for every option the app offers, so no
// REGION_WORKSPACE_OPTIONS entry can ever be unmapped.

export const CURRENCY_OPTION_LABELS: Record<string, string> = {
  USD: "US Dollar (USD)",
  EUR: "Euro (EUR)",
  GBP: "British Pound (GBP)",
  INR: "Indian Rupee (INR)",
  JPY: "Japanese Yen (JPY)",
  CAD: "Canadian Dollar (CAD)",
  AUD: "Australian Dollar (AUD)",
  CHF: "Swiss Franc (CHF)",
  CNY: "Chinese Yuan (CNY)",
};

export const LOCALE_OPTION_LABELS: Record<string, string> = {
  "en-US": "English (US)",
  "en-GB": "English (UK)",
  "en-IN": "English (India)",
  "de-DE": "German (Germany)",
  "fr-FR": "French (France)",
  "ja-JP": "Japanese (Japan)",
  "zh-CN": "Chinese (China)",
};
