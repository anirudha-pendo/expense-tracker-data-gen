// All tunable values for the usage bot live here. Nothing outside this file
// should contain a magic number — if a behaviour needs tuning, it should be a
// constant exported from here.

// Type-only import: erased at compile time, so this does NOT create a runtime
// import cycle with personas.ts (which imports values from here). It buys the
// two new-visitor knobs below a compile error instead of a silent typo.
import type { ActionName, Archetype } from "./personas";

// --- Environment-driven basics -------------------------------------------

export const APP_URL: string = process.env.APP_URL ?? "http://localhost:5173";
export const HEADLESS: boolean = process.env.HEADLESS !== "false";

// --- Run shape --------------------------------------------------------------

export const MAX_CONCURRENCY = 6;
export const BASE_SESSIONS_PER_RUN = 8; // per region, before curve weighting
export const NEW_VISITOR_RATE = 0.15;
export const WEEKEND_MULTIPLIER = 0.25;
export const MAX_FAILURE_RATE = 0.5; // exit non-zero above this
// A 25-action power session (~2s think time + ~3s/action, plus readInsights
// dwells of 5-36s) can plausibly exceed 240s on a slow shared CI runner, and
// a session killed by its own timeout counts as a failure. Six minutes still
// sits well inside the 20-minute job ceiling at MAX_CONCURRENCY 6.
export const SESSION_TIMEOUT_MS = 360000;

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

// --- UI action timeouts -----------------------------------------------------
//
// Deliberately generous. The bot competes with its own think pauses, with
// sonner toasts that sit over the page header for ~4s before auto-dismissing,
// and with IndexedDB reads on a workspace carrying up to 180 transactions.
// A tight timeout here turns a slow render into a spurious action failure,
// which Task 5 would record as a real defect.

/** How long a navigation waits for the destination route's landmark to render. */
export const NAV_LANDMARK_TIMEOUT_MS = 20000;
/** How long a dialog gets to open, or to unmount after being dismissed. */
export const DIALOG_TIMEOUT_MS = 15000;
/** How long a success toast gets to appear after the click that triggers it. */
export const TOAST_TIMEOUT_MS = 15000;

// --- Abandonment ------------------------------------------------------------
//
// The per-action abandon *probability* is the persona's (`ctx.abandonRate`,
// from its archetype). These are the knobs for what abandoning looks like.

/** Given an abandonment, the chance it closes the dialog with Escape rather than the Cancel button. */
export const ABANDON_VIA_ESCAPE_RATE = 0.5;

// --- Transactions -----------------------------------------------------------

/** A newly entered transaction is dated somewhere in the last this-many days. */
export const TRANSACTION_BACKDATE_MAX_DAYS = 21;
/** Chance a newly entered transaction gets an optional note. */
export const TRANSACTION_NOTES_RATE = 0.25;
/** Chance a newly entered transaction is flagged recurring. */
export const TRANSACTION_RECURRING_RATE = 0.12;
/** Amount range used when a picked category has no entry in the seed-data amount tables (e.g. a category the bot itself created earlier). */
export const FALLBACK_AMOUNT_MIN = 5;
export const FALLBACK_AMOUNT_MAX = 250;
/** Edit/delete pick a row from the first this-many rows, the way a real user acts on what's on screen rather than scrolling to row 140. */
export const ROW_PICK_LIMIT = 12;
/** Chance an edit rewrites the description (the amount is always rewritten, so the form is guaranteed to change). */
export const EDIT_DESCRIPTION_RATE = 0.6;

// --- Filters ----------------------------------------------------------------

/** How many of the four filter controls one `filterTransactions` touches. */
export const FILTER_COUNT_MIN = 1;
export const FILTER_COUNT_MAX = 2;
/** The month filter picks a month between this many months back and the current one. */
export const FILTER_MONTH_LOOKBACK_MAX = 5;

// --- Goals ------------------------------------------------------------------
//
// Goal *names* and target ranges are reused from `seed-data.ts`'s
// GOAL_SEED_POOL so a bot-created goal is indistinguishable from a seeded
// one. Only the contribution amount needs its own range: reading the goal's
// target off the card would mean parsing a locale-formatted currency string.

export const CONTRIBUTION_AMOUNT_MIN = 25;
export const CONTRIBUTION_AMOUNT_MAX = 600;
/** Chance a contribution carries an optional note. */
export const CONTRIBUTION_NOTE_RATE = 0.4;

// --- Budgets ----------------------------------------------------------------

export const BUDGET_LIMIT_MIN = 100;
export const BUDGET_LIMIT_MAX = 1500;
/** Budget limits are rounded to a multiple of this. Also the nudge applied when the generated limit happens to equal the one already saved — the app's "Set" button stays disabled until the value actually changes. */
export const BUDGET_LIMIT_STEP = 50;

// --- Settings ---------------------------------------------------------------

/** Chance `updateWorkspace` also switches the currency select (it always renames the workspace, which is what makes the form dirty enough to save). */
export const WORKSPACE_CURRENCY_CHANGE_RATE = 0.25;
/** Chance `updateWorkspace` also switches the number-format/locale select. */
export const WORKSPACE_LOCALE_CHANGE_RATE = 0.25;

// --- Quick Add --------------------------------------------------------------

/** Chance the command palette is opened with Ctrl+K rather than the header button. */
export const QUICK_ADD_SHORTCUT_RATE = 0.5;
/** How long the command palette gets to lazily load the workspace's categories and render its chips. Shorter than DIALOG_TIMEOUT_MS on purpose: a palette with genuinely no matching category should fail fast and say so, not sit out a full dialog timeout. */
export const QUICK_ADD_CHIPS_TIMEOUT_MS = 5000;

// --- Insights dwell ---------------------------------------------------------
//
// `readInsights` exists purely to produce time-on-page data, so its dwell is
// several read pauses long rather than one.

export const INSIGHTS_DWELL_PAUSES_MIN = 2;
export const INSIGHTS_DWELL_PAUSES_MAX = 4;
/** Chance a dwell pause is preceded by a scroll. Scrolling is not clicking — it keeps `readInsights` a read-only action while still looking alive. */
export const INSIGHTS_SCROLL_RATE = 0.7;
export const INSIGHTS_SCROLL_PX_MIN = 200;
export const INSIGHTS_SCROLL_PX_MAX = 900;

// --- Recovering from a failed action ----------------------------------------
//
// A failed action does not end the session (the walk continues and the
// failure is counted — ending early would truncate session length, which is
// itself analytics data the bot exists to make realistic), so whatever
// overlay the thrown action left open has to be cleared before the next one
// runs. These bound `resetUiState`'s effort so a page that will not clear
// costs a second, not a timeout.

/** How many Escape presses `resetUiState` will spend. Radix closes one layer per press, so a select listbox opened inside a dialog needs two. */
export const UI_RESET_MAX_ESCAPES = 5;
/** How long `resetUiState` lets a layer finish its close animation and unmount before re-checking. */
export const UI_RESET_SETTLE_MS = 400;


// --- Browser contexts -------------------------------------------------------
//
// One BrowserContext per session, so no two sessions share storage, cookies
// or a fingerprint. Both lists are deliberately desktop-only: the app has no
// distinct mobile layout to exercise, and a phone-sized viewport would change
// which controls are even on screen.

export interface ViewportSize {
  width: number;
  height: number;
}

/**
 * Every entry is comfortably wider than 1280. At 1280x720 the sonner toasts
 * (top-right, mounted app-wide) sit over the page header, and Playwright's
 * actionability checks patiently wait each one out — never a failure, but up
 * to ~4s added to any click that lands underneath one.
 */
export const VIEWPORTS: ViewportSize[] = [
  { width: 1536, height: 864 },
  { width: 1600, height: 900 },
  { width: 1680, height: 1050 },
  { width: 1920, height: 1080 },
];

/**
 * Chrome 151 on the three desktop platforms — 151 is the major version the
 * bundled Chromium actually reports, so the string never contradicts the
 * engine behind it. Overriding the UA at all also drops the "HeadlessChrome"
 * token the default carries.
 */
export const USER_AGENTS: string[] = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
];

// --- Failure capture --------------------------------------------------------

/**
 * Bounds the screenshot taken when a session fails. Deliberately short: the
 * common reason a session fails is that the page stopped responding to
 * Playwright, and a failure capture that hangs would defeat the per-session
 * timeout it is being taken because of.
 */
export const SCREENSHOT_TIMEOUT_MS = 15000;

// --- New-visitor sessions ---------------------------------------------------
//
// A NEW_VISITOR_RATE share of every run's slots signs up through the real UI
// instead of being seeded. The knobs are here; the name pool and the
// currency/locale option labels those sessions type are content, and live in
// seed-data.ts with every other content pool.

/**
 * Which archetype's action weights and abandon rate a brand-new visitor
 * borrows. `explorer` is the honest fit: wide navigation, opens a lot of
 * dialogs, abandons often. Its `sessionLength` is deliberately NOT used —
 * see NEW_VISITOR_WALK_MIN/MAX.
 */
export const NEW_VISITOR_ARCHETYPE: Archetype = "explorer";

/**
 * The abandon rate a new-visitor session uses instead of borrowing
 * `explorer`'s 0.45. Applied per multi-step action across a short walk,
 * 0.45 compounds to almost no completed flows, starving the
 * signup-to-first-transaction funnel of the completions that make its
 * drop-off readable. `explorer` itself is untouched — this only changes what
 * new-visitor sessions use.
 */
export const NEW_VISITOR_ABANDON_RATE = 0.3;

/**
 * How many actions a new visitor takes after finishing sign-up and workspace
 * setup. Shorter than any archetype's session length on purpose: signing up
 * and creating a workspace is already most of a first session.
 */
export const NEW_VISITOR_WALK_MIN = 3;
export const NEW_VISITOR_WALK_MAX = 7;

/**
 * The actions a genuinely fresh account can perform. A new workspace holds
 * the app's 12 default categories and nothing else — no transactions, no
 * goals, no budgets — so the actions that act on an existing row
 * (`editTransaction`, `deleteTransaction`, `contributeToGoal`) would throw
 * for a reason that is not a defect. `filterTransactions` / `clearFilters`
 * are left out as pointless against a one-row table, and `signOut` because
 * ending the walk on step one would waste the sign-up it just did.
 */
export const NEW_VISITOR_ACTIONS: ActionName[] = [
  "navigateDashboard",
  "navigateTransactions",
  "navigateInsights",
  "navigateGoals",
  "navigateSettings",
  "addTransaction",
  "addGoal",
  "addBudget",
  "addCategory",
  "updateProfile",
  "updateWorkspace",
  "useQuickAdd",
  "readInsights",
];

/** Chance the sign-up form's show/hide password toggle gets clicked. */
export const NEW_VISITOR_SHOW_PASSWORD_RATE = 0.35;
/** Chance workspace setup changes the currency select away from its "US Dollar (USD)" default. */
export const NEW_VISITOR_CURRENCY_CHANGE_RATE = 0.6;
/** Chance workspace setup changes the number-format select away from its "English (US)" default. */
export const NEW_VISITOR_LOCALE_CHANGE_RATE = 0.6;
/** The app's own zod rule (signUpSchema): username is 3-30 chars of [A-Za-z0-9_]. Generated usernames are trimmed to fit. */
export const SIGNUP_USERNAME_MAX_LEN = 30;
