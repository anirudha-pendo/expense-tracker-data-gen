// The bot's UI action library: 19 things a persona can do in the running
// app, each one driving the real interface with real clicks so the analytics
// agent on the page records genuine page views, feature clicks, funnels and
// time-on-page. Nothing in here reaches into the app's state, its router or
// its database — if a user cannot do it by clicking, the bot does not do it.
//
// Every selector below comes from `docs/superpowers/ui-map.md`, which was
// built by reading each component's source. Two traps that map records and
// that this file leans on constantly:
//   - Radix `Select`s are not native `<select>` elements. Click the trigger,
//     then click the option by its accessible name inside the *portaled*
//     listbox (which lives on `document.body`, not inside the dialog).
//   - Labels repeat. "Delete", "Edit", "Cancel", "Save changes", "Actions",
//     "Add money" and "Set" all appear many times per page, so every one of
//     them is scoped to a row, a card or the currently-open dialog.
//
// Conventions every action follows:
//   - It leaves the app in a usable state: no dialog left open, no menu left
//     hanging.
//   - It ends with a think pause.
//   - It throws if it cannot find its target. Task 5's orchestrator decides
//     what a failure means; swallowing it here would hide real breakage.
//     The one non-error early return is a deliberate abandonment, which is a
//     successful outcome (it is the funnel drop-off data this project
//     exists to produce), plus the documented "nothing to do" skip in
//     `clearFilters`.
//   - All randomness goes through `ctx.rng`. No bare `Math.random()`.
//   - Every number it needs is an exported constant in `./config`.

import type { Locator, Page } from "playwright";
import {
  APP_URL,
  THINK_MIN_MS,
  THINK_MAX_MS,
  READ_PAUSE_MIN_MS,
  READ_PAUSE_MAX_MS,
  NAV_LANDMARK_TIMEOUT_MS,
  DIALOG_TIMEOUT_MS,
  TOAST_TIMEOUT_MS,
  ABANDON_VIA_ESCAPE_RATE,
  TRANSACTION_BACKDATE_MAX_DAYS,
  TRANSACTION_NOTES_RATE,
  TRANSACTION_RECURRING_RATE,
  FALLBACK_AMOUNT_MIN,
  FALLBACK_AMOUNT_MAX,
  ROW_PICK_LIMIT,
  EDIT_DESCRIPTION_RATE,
  FILTER_COUNT_MIN,
  FILTER_COUNT_MAX,
  FILTER_MONTH_LOOKBACK_MAX,
  CONTRIBUTION_AMOUNT_MIN,
  CONTRIBUTION_AMOUNT_MAX,
  CONTRIBUTION_NOTE_RATE,
  BUDGET_LIMIT_MIN,
  BUDGET_LIMIT_MAX,
  BUDGET_LIMIT_STEP,
  WORKSPACE_CURRENCY_CHANGE_RATE,
  WORKSPACE_LOCALE_CHANGE_RATE,
  QUICK_ADD_SHORTCUT_RATE,
  QUICK_ADD_CHIPS_TIMEOUT_MS,
  INSIGHTS_DWELL_PAUSES_MIN,
  INSIGHTS_DWELL_PAUSES_MAX,
  INSIGHTS_SCROLL_RATE,
  INSIGHTS_SCROLL_PX_MIN,
  INSIGHTS_SCROLL_PX_MAX,
  UI_RESET_MAX_ESCAPES,
  UI_RESET_SETTLE_MS,
  type Rng,
} from "./config";
import { ARCHETYPES, type ActionName, type Persona } from "./personas";
import {
  AMOUNT_ROUNDING_UNIT,
  CUSTOM_CATEGORY_SEEDS,
  DEFAULT_CATEGORY_SEEDS,
  EXPENSE_TRANSACTION_RATE,
  GOAL_DEADLINE_CHANCE,
  GOAL_DEADLINE_MONTHS_MAX,
  GOAL_DEADLINE_MONTHS_MIN,
  GOAL_SEED_POOL,
  SWATCH_PRESET_COLORS,
  WORKSPACE_NAME_TEMPLATES,
  type CategorySeed,
} from "./seed-data";

// =============================================================================
// Public types
// =============================================================================

export interface SessionCtx {
  persona: Persona;
  /** The session's seeded PRNG (`ReturnType<typeof makeRng>`). Every random choice an action makes goes through this, so a seed reproduces a session exactly. */
  rng: Rng;
  /** Probability, per multi-step action, that the persona bails out mid-flow. Comes from the persona's archetype. */
  abandonRate: number;
  log: (msg: string) => void;
}

export interface Action {
  /** Constrained to `ActionName` (not `string`) so a typo is a compile error rather than an action that silently never runs. */
  name: ActionName;
  /** Relative likelihood of this action being chosen. 0 means "not available right now". */
  weight: (ctx: SessionCtx) => number;
  run: (page: Page, ctx: SessionCtx) => Promise<void>;
}

// =============================================================================
// preparePage — the `__name` polyfill (do not delete: see below)
// =============================================================================

/**
 * Installs a no-op `window.__name` before any of the page's own scripts run.
 * Task 5 calls this once per page, straight after creating it and before the
 * first navigation.
 *
 * WHY THIS EXISTS — this looks like dead code and it is not. `tsx` (this
 * directory's TypeScript runner) transpiles with esbuild and forces
 * `keepNames` on, which rewrites every named function declaration and
 * const-bound arrow into a call to a `__name` helper that esbuild emits once
 * at *module* scope. Playwright serialises an `evaluate`/`waitForFunction`
 * callback with `.toString()` and ships only that callback's own body to the
 * browser, so the module-scope helper never travels with it: any named
 * function inside such a callback dies at runtime with
 * `ReferenceError: __name is not defined`. It type-checks clean, so
 * `tsc --noEmit` will not warn you. There is no tsx or esbuild flag that
 * turns this off — the upstream escape hatch was rejected. Defining a no-op
 * `__name` on the page kills the whole bug class centrally, and lets the
 * rest of the bot write ordinary code inside `evaluate`.
 */
export async function preparePage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __name?: <T>(target: T) => T };
    w.__name ??= (target) => target;
  });
}

// =============================================================================
// resetUiState — the recovery hatch for a failed action
// =============================================================================

/**
 * Every layer this app can leave floating over the page: the two radix
 * dialog kinds, a select's portaled listbox, and a dropdown menu.
 */
const OVERLAY_SELECTOR = [
  '[data-slot="dialog-content"]',
  '[data-slot="alert-dialog-content"]',
  '[role="listbox"]',
  '[role="menu"]',
].join(", ");

/**
 * Dismisses whatever overlay the page is left holding, so the next action
 * starts from a page it can actually click.
 *
 * TASK 5 CALLS THIS FROM THE CATCH BLOCK AROUND AN ACTION. A failed action
 * does not end the session — the walk continues and the failure is counted,
 * because ending early would truncate session length, and session length is
 * itself analytics data this bot exists to make realistic. The actions' own
 * success and abandonment paths always close what they opened; their *error*
 * paths cannot, because a throw is by definition the point where they stopped
 * being in control. A select that threw mid-pick leaves its listbox open, a
 * submit that timed out leaves its dialog open, and a row menu that could not
 * find its item leaves the dropdown open. The worst of those is a leaked
 * quick-add palette: both Ctrl+K and the header button refuse to open over an
 * existing dialog, so one leak would poison every later `useQuickAdd` in the
 * session.
 *
 * Safe to call when nothing is open — it checks first and returns.
 *
 * IT NEVER THROWS. It runs inside a catch block, where raising would replace
 * the real failure with a meaningless one. If it cannot clear the page it
 * logs and returns, and the next action fails on its own terms with its own
 * message.
 */
export async function resetUiState(
  page: Page,
  log: (msg: string) => void = (msg) => console.warn(msg),
): Promise<void> {
  try {
    const overlays = page.locator(OVERLAY_SELECTOR);
    for (let attempt = 0; attempt < UI_RESET_MAX_ESCAPES; attempt++) {
      if ((await overlays.count()) === 0) return;
      // Radix closes one layer per Escape and unmounts it after its exit
      // animation, so this presses, lets the DOM settle, then re-counts —
      // rather than waiting on any single element, which would stall for the
      // full timeout whenever the layer that closed was not the one waited on.
      await page.keyboard.press("Escape");
      await page.waitForTimeout(UI_RESET_SETTLE_MS);
    }
    const remaining = await overlays.count();
    if (remaining > 0) {
      log(`resetUiState: ${remaining} overlay element(s) still open after ${UI_RESET_MAX_ESCAPES} Escape presses`);
    }
  } catch (err) {
    log(`resetUiState: could not clear the page (${err instanceof Error ? err.message.split("\n")[0] : String(err)})`);
  }
}

// =============================================================================
// Pacing
// =============================================================================

/** The short pause a person takes between two actions. Every action ends with one. */
export async function think(page: Page, ctx: SessionCtx): Promise<void> {
  await page.waitForTimeout(ctx.rng.int(THINK_MIN_MS, THINK_MAX_MS));
}

/** The longer pause a person takes while actually reading a screen. This is what produces time-on-page. */
export async function readPause(page: Page, ctx: SessionCtx): Promise<void> {
  await page.waitForTimeout(ctx.rng.int(READ_PAUSE_MIN_MS, READ_PAUSE_MAX_MS));
}

// =============================================================================
// Routes
// =============================================================================

type RouteName = "dashboard" | "transactions" | "insights" | "goals" | "settings";

interface RouteDef {
  path: string;
  /** Doubles as the nav link's accessible name and the AppLayout `<h1>` text — they are the same string for all five routes. */
  label: string;
  /**
   * Something that only exists once the route's data has actually rendered.
   * The `<h1>` alone is not enough: AppLayout paints it immediately while
   * the page below is still skeletons reading from IndexedDB.
   */
  landmark: (page: Page) => Locator;
}

const ROUTES: Record<RouteName, RouteDef> = {
  dashboard: {
    path: "/",
    label: "Dashboard",
    // SummaryCards renders skeletons while loading and the "Income" label only after.
    landmark: (page) => page.getByText("Income", { exact: true }).first(),
  },
  transactions: {
    path: "/transactions",
    label: "Transactions",
    // Either the table has rows (each with an "Actions" menu) or it says so.
    landmark: (page) =>
      page
        .getByRole("button", { name: "Actions", exact: true })
        .or(page.getByText("No transactions found."))
        .first(),
  },
  insights: {
    path: "/insights",
    label: "Insights",
    landmark: (page) =>
      page
        .getByText("End-of-Month Forecast")
        .or(page.getByText("No data to analyze yet"))
        .first(),
  },
  goals: {
    path: "/goals",
    label: "Goals",
    landmark: (page) =>
      page
        .getByRole("button", { name: "Add money", exact: true })
        .or(page.getByText("No savings goals yet"))
        .first(),
  },
  settings: {
    path: "/settings",
    label: "Settings",
    // ProfileForm has no loading state, so its input is the first thing on the page to be real.
    landmark: (page) => page.locator("#displayName"),
  },
};

/** Which of the five app routes the page is on, or null if it is somewhere else (sign-in, workspace setup). */
function currentRoute(page: Page): RouteName | null {
  const pathname = new URL(page.url()).pathname;
  for (const name of Object.keys(ROUTES) as RouteName[]) {
    if (ROUTES[name].path === pathname) return name;
  }
  return null;
}

async function waitForRoute(page: Page, route: RouteName): Promise<void> {
  const def = ROUTES[route];
  await page
    .getByRole("heading", { name: def.label, level: 1 })
    .waitFor({ state: "visible", timeout: NAV_LANDMARK_TIMEOUT_MS });
  await def.landmark(page).waitFor({ state: "visible", timeout: NAV_LANDMARK_TIMEOUT_MS });
}

/** Clicks the real nav link (never `history.pushState`) and waits for the destination's landmark. */
async function navigateTo(page: Page, route: RouteName): Promise<void> {
  await page.getByRole("link", { name: ROUTES[route].label, exact: true }).click();
  await waitForRoute(page, route);
}

/** Gets to `route`, clicking the nav link only if the page is not already there. */
async function ensureRoute(page: Page, route: RouteName): Promise<void> {
  if (currentRoute(page) === route) {
    await waitForRoute(page, route);
    return;
  }
  await navigateTo(page, route);
}

/**
 * Gets to *any* page that renders `AppLayout` — needed by the two actions
 * that use chrome rather than page content (quick add, sign out).
 */
async function ensureAppRoute(page: Page, ctx: SessionCtx): Promise<void> {
  const route = currentRoute(page);
  if (route !== null) {
    await waitForRoute(page, route);
    return;
  }
  // Nowhere to click: a non-app route (sign-in, workspace setup) has no nav
  // bar. A real browser navigation is the only honest way back.
  await page.goto(APP_URL);
  await waitForRoute(page, "dashboard");
  // Logged only after the wait: if the session is signed out this never
  // reaches here, and a "recovered" line above would have been a lie.
  ctx.log("recovered:navigated to the dashboard from a non-app route");
}

// =============================================================================
// Dialogs
// =============================================================================

/** The single open Radix Dialog, if any. The app never stacks two (quick add refuses to open over another). */
function openDialog(page: Page): Locator {
  return page.locator('[data-slot="dialog-content"]');
}

/** The single open Radix AlertDialog — only the three delete confirmations use one. */
function openAlertDialog(page: Page): Locator {
  return page.locator('[data-slot="alert-dialog-content"]');
}

/**
 * Waits for a dialog to open and, when `title` is given, asserts it is the
 * dialog we meant to open. Worth the extra check: the app reuses one
 * component for add and edit, and picking up the wrong one silently would
 * produce garbage data rather than a failure.
 */
async function waitForDialogOpen(page: Page, title?: string): Promise<Locator> {
  const dialog = openDialog(page);
  await dialog.waitFor({ state: "visible", timeout: DIALOG_TIMEOUT_MS });
  if (title !== undefined) {
    const titleEl = dialog.locator('[data-slot="dialog-title"]');
    await titleEl.waitFor({ state: "visible", timeout: DIALOG_TIMEOUT_MS });
    const actual = (await titleEl.innerText()).trim();
    if (actual !== title) {
      throw new Error(`expected the "${title}" dialog to open, but the open dialog is "${actual}"`);
    }
  }
  return dialog;
}

async function waitForDialogClosed(page: Page): Promise<void> {
  await openDialog(page).waitFor({ state: "hidden", timeout: DIALOG_TIMEOUT_MS });
}

/**
 * Bails out of an open dialog the way a person does — Escape or the Cancel
 * button — and records the drop-off. Callers fill a field or two first, so
 * the funnel shows a genuine partial completion rather than an instant
 * bounce.
 */
async function abandonDialog(page: Page, ctx: SessionCtx, name: ActionName): Promise<void> {
  if (ctx.rng.chance(ABANDON_VIA_ESCAPE_RATE)) {
    await page.keyboard.press("Escape");
  } else {
    await openDialog(page).getByRole("button", { name: "Cancel", exact: true }).click();
  }
  await waitForDialogClosed(page);
  ctx.log(`abandoned:${name}`);
}

async function abandonAlertDialog(page: Page, ctx: SessionCtx, name: ActionName): Promise<void> {
  if (ctx.rng.chance(ABANDON_VIA_ESCAPE_RATE)) {
    await page.keyboard.press("Escape");
  } else {
    await openAlertDialog(page).getByRole("button", { name: "Cancel", exact: true }).click();
  }
  await openAlertDialog(page).waitFor({ state: "hidden", timeout: DIALOG_TIMEOUT_MS });
  ctx.log(`abandoned:${name}`);
}

// =============================================================================
// Radix Select
// =============================================================================

/** Opens a Radix Select and returns its portaled listbox (which is attached to `<body>`, so it is never inside the dialog locator). */
async function openSelect(page: Page, trigger: Locator): Promise<Locator> {
  await trigger.click();
  const listbox = page.getByRole("listbox");
  await listbox.waitFor({ state: "visible", timeout: DIALOG_TIMEOUT_MS });
  return listbox;
}

/** Exported because the run orchestrator's sign-up flow drives the two Radix selects on the workspace-setup page, which is not an app route and so has no action of its own. */
export async function selectOptionByText(page: Page, trigger: Locator, option: string): Promise<void> {
  const listbox = await openSelect(page, trigger);
  await listbox.getByRole("option", { name: option, exact: true }).first().click();
  await listbox.waitFor({ state: "hidden", timeout: DIALOG_TIMEOUT_MS });
}

/**
 * Reads whatever options a select is actually offering right now and picks
 * one. Reading them beats hardcoding a list: the category selects are filtered
 * by the transaction type currently selected, and include any category the
 * bot itself created in an earlier session.
 */
async function selectRandomOption(
  page: Page,
  ctx: SessionCtx,
  trigger: Locator,
  exclude: string[] = [],
): Promise<string> {
  const listbox = await openSelect(page, trigger);
  const labels = (await listbox.getByRole("option").allInnerTexts())
    .map((text) => text.trim())
    .filter((text) => text.length > 0 && !exclude.includes(text));
  if (labels.length === 0) {
    throw new Error("a select opened with no selectable options");
  }
  const choice = ctx.rng.pick(labels);
  await listbox.getByRole("option", { name: choice, exact: true }).first().click();
  await listbox.waitFor({ state: "hidden", timeout: DIALOG_TIMEOUT_MS });
  return choice;
}

// =============================================================================
// Generated input
// =============================================================================

// Free text the bot types into the two optional note fields. These are not
// tunables — nobody turns them to change how the bot behaves — and they are
// not numbers, so they live next to the actions that type them rather than in
// config.ts. Transaction *descriptions* deliberately do not come from here:
// they reuse seed-data.ts's per-category pools, so a row the bot types is
// indistinguishable from a row that was seeded.
const TRANSACTION_NOTE_POOL = [
  "Paid by card",
  "Split with a flatmate",
  "Reimbursable",
  "One-off, not monthly",
  "Receipt in the folder",
];

const CONTRIBUTION_NOTE_POOL = [
  "Monthly top-up",
  "Bonus money",
  "Rounded up the savings",
  "Extra put aside this month",
];

const ALL_CATEGORY_SEEDS: CategorySeed[] = [...DEFAULT_CATEGORY_SEEDS, ...CUSTOM_CATEGORY_SEEDS];

function categorySeedByName(name: string): CategorySeed | undefined {
  return ALL_CATEGORY_SEEDS.find((seed) => seed.name === name);
}

/** yyyy-MM-dd — the format every native date input in this app expects. */
function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function recentDate(ctx: SessionCtx, maxDaysBack: number): string {
  const date = new Date();
  date.setDate(date.getDate() - ctx.rng.int(0, maxDaysBack));
  return toDateOnly(date);
}

function futureDate(ctx: SessionCtx, minMonths: number, maxMonths: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() + ctx.rng.int(minMonths, maxMonths));
  return toDateOnly(date);
}

/** yyyy-MM — the format the transactions month filter expects. */
function recentMonth(ctx: SessionCtx, maxMonthsBack: number): string {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - ctx.rng.int(0, maxMonthsBack));
  return date.toISOString().slice(0, 7);
}

/** A currency amount with cents, as the string a number input wants. Always > 0, which is what every amount field's zod rule requires. */
function centsAmount(ctx: SessionCtx, min: number, max: number): string {
  const CENTS_PER_UNIT = 100;
  return (ctx.rng.int(min * CENTS_PER_UNIT, max * CENTS_PER_UNIT) / CENTS_PER_UNIT).toFixed(2);
}

/** A round amount, the way people actually type targets and budget limits. */
function roundedAmount(ctx: SessionCtx, min: number, max: number, unit: number): string {
  return String(Math.max(unit, Math.round(ctx.rng.int(min, max) / unit) * unit));
}

function descriptionFor(ctx: SessionCtx, categoryName: string): string {
  const seed = categorySeedByName(categoryName);
  // A category the bot created in an earlier session has no seed row; its own
  // name is a perfectly plausible description and is always inside the
  // 1-100 character rule (categories cap at 40).
  return seed ? ctx.rng.pick(seed.descriptions) : categoryName;
}

function amountFor(ctx: SessionCtx, categoryName: string): string {
  const seed = categorySeedByName(categoryName);
  return seed
    ? centsAmount(ctx, seed.amountMin, seed.amountMax)
    : centsAmount(ctx, FALLBACK_AMOUNT_MIN, FALLBACK_AMOUNT_MAX);
}

// The quick-add parser's very first step strips any standalone `income` or
// `expense` token as an explicit type keyword, before whatever is left
// becomes the transaction's description. Three of the pooled descriptions
// ("Interest income", "Tutoring income", "Expense reimbursement") therefore do
// NOT survive intact, so the bot cannot expect the toast to name the string it
// typed. Mirroring that one rule here is what makes the expected toast text
// exact — checked against the app's own `parseQuickAdd` over all 87 pooled
// descriptions.
//
// MIRRORED RULE — keep in lockstep with the reserved-word stripping in
// `src/features/quick-add/lib/parser.ts` (the `tokens.filter(...)` step in
// `parseQuickAdd` doing the inline `lower === "income" || lower === "expense"`
// check, lines 126-135; there is no TYPE_KEYWORDS constant). If that parser
// ever changes which tokens it strips, or stops stripping them, this list and
// `parsedDescription` below go stale silently: nothing here imports from src/
// (separate tsconfig, separate module graph) and `tsc --noEmit` cannot see the
// drift. The symptom would be `useQuickAdd` failing its toast assertion on a
// handful of descriptions. If you are editing that parser, edit this too.
const QUICK_ADD_TYPE_KEYWORDS = ["income", "expense"];

function parsedDescription(typed: string): string {
  return typed
    .split(/\s+/)
    .filter((token) => !QUICK_ADD_TYPE_KEYWORDS.includes(token.toLowerCase()))
    .join(" ");
}

function pickDistinct<T>(ctx: SessionCtx, items: T[], count: number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  while (picked.length < count && pool.length > 0) {
    picked.push(pool.splice(ctx.rng.int(0, pool.length - 1), 1)[0]);
  }
  return picked;
}

/** The persona's first name, for the workspace-name templates. */
function firstName(persona: Persona): string {
  return persona.displayName.split(" ")[0];
}

// =============================================================================
// Transactions page helpers
// =============================================================================

/**
 * The real data rows of the transactions table. Filtering on the per-row
 * "Actions" menu excludes both the loading skeleton rows and the single
 * "No transactions found." row, neither of which has one.
 */
function transactionRows(page: Page): Locator {
  return page
    .locator("tbody tr")
    .filter({ has: page.getByRole("button", { name: "Actions", exact: true }) });
}

/**
 * Picks a row to edit or delete, from the top of the table — a person acts on
 * what is on screen, not on row 140.
 */
async function pickTransactionRow(page: Page, ctx: SessionCtx): Promise<Locator> {
  const rows = transactionRows(page);
  let count = await rows.count();

  if (count === 0) {
    // A filter left behind by an earlier action can hide every row. Clearing
    // it is exactly what a person does before giving up.
    const clear = page.getByRole("button", { name: "Clear filters", exact: true });
    if (await clear.isVisible()) {
      await clear.click();
      await ROUTES.transactions.landmark(page).waitFor({ state: "visible", timeout: NAV_LANDMARK_TIMEOUT_MS });
      count = await rows.count();
    }
  }

  if (count === 0) {
    throw new Error("the transactions table has no rows to act on");
  }
  return rows.nth(ctx.rng.int(0, Math.min(count, ROW_PICK_LIMIT) - 1));
}

/** Opens a row's "Actions" dropdown and clicks one of its two items. */
async function openRowMenuItem(page: Page, row: Locator, item: "Edit" | "Delete"): Promise<void> {
  await row.getByRole("button", { name: "Actions", exact: true }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
}

// The transactions filter bar holds the page's only two Radix Selects, in
// source order: type first, then category. Neither has an id, a name or an
// aria-label (see the ui map), so position within the bar is the only handle
// the app gives us.
function filterTypeTrigger(page: Page): Locator {
  return page.locator('[data-slot="select-trigger"]').nth(0);
}

function filterCategoryTrigger(page: Page): Locator {
  return page.locator('[data-slot="select-trigger"]').nth(1);
}

// =============================================================================
// The actions
// =============================================================================

// --- Navigation --------------------------------------------------------------

/**
 * Navigation always clicks the link even when the page is already open — a
 * person does re-click the tab they are on, and the click is the event the
 * analytics agent is here to see.
 */
async function runNavigateDashboard(page: Page, ctx: SessionCtx): Promise<void> {
  await navigateTo(page, "dashboard");
  await readPause(page, ctx); // the dashboard is a screen people actually read
  await think(page, ctx);
}

async function runNavigateTransactions(page: Page, ctx: SessionCtx): Promise<void> {
  await navigateTo(page, "transactions");
  await think(page, ctx);
}

async function runNavigateInsights(page: Page, ctx: SessionCtx): Promise<void> {
  await navigateTo(page, "insights");
  await readPause(page, ctx);
  await think(page, ctx);
}

async function runNavigateGoals(page: Page, ctx: SessionCtx): Promise<void> {
  await navigateTo(page, "goals");
  await think(page, ctx);
}

async function runNavigateSettings(page: Page, ctx: SessionCtx): Promise<void> {
  await navigateTo(page, "settings");
  await think(page, ctx);
}

// --- Transactions --------------------------------------------------------------

async function runAddTransaction(page: Page, ctx: SessionCtx): Promise<void> {
  await ensureRoute(page, "transactions");
  await page.getByRole("button", { name: "Add Transaction", exact: true }).click();
  const dialog = await waitForDialogOpen(page, "Add Transaction");

  if (ctx.rng.chance(ctx.abandonRate)) {
    // Typed the description, then thought better of it.
    await dialog.locator("#description").fill(descriptionFor(ctx, ctx.rng.pick(ALL_CATEGORY_SEEDS).name));
    await abandonDialog(page, ctx, "addTransaction");
    await think(page, ctx);
    return;
  }

  // The type tab MUST be chosen before the category: switching it clears the
  // category field and changes which categories the select even offers.
  const isExpense = ctx.rng.chance(EXPENSE_TRANSACTION_RATE);
  await dialog.getByRole("tab", { name: isExpense ? "Expense" : "Income", exact: true }).click();

  const categoryName = await selectRandomOption(page, ctx, dialog.locator("#category"));

  await dialog.locator("#description").fill(descriptionFor(ctx, categoryName));
  await dialog.locator("#amount").fill(amountFor(ctx, categoryName));
  await dialog.locator("#date").fill(recentDate(ctx, TRANSACTION_BACKDATE_MAX_DAYS));

  if (ctx.rng.chance(TRANSACTION_RECURRING_RATE)) {
    // A Radix Switch, not a checkbox — `.check()` does not apply.
    await dialog.locator("#isRecurring").click();
  }
  if (ctx.rng.chance(TRANSACTION_NOTES_RATE)) {
    await dialog.locator("#notes").fill(ctx.rng.pick(TRANSACTION_NOTE_POOL));
  }

  await dialog.getByRole("button", { name: "Add transaction", exact: true }).click();
  // The dialog only closes on a successful save; a rejected one stays open.
  await waitForDialogClosed(page);
  await think(page, ctx);
}

async function runEditTransaction(page: Page, ctx: SessionCtx): Promise<void> {
  await ensureRoute(page, "transactions");
  const row = await pickTransactionRow(page, ctx);
  await openRowMenuItem(page, row, "Edit");
  const dialog = await waitForDialogOpen(page, "Edit Transaction");

  if (ctx.rng.chance(ctx.abandonRate)) {
    await dialog.locator("#amount").fill(centsAmount(ctx, FALLBACK_AMOUNT_MIN, FALLBACK_AMOUNT_MAX));
    await abandonDialog(page, ctx, "editTransaction");
    await think(page, ctx);
    return;
  }

  // The type tab is deliberately left alone: switching it would blank the
  // category the row already has and force a re-pick for no behavioural gain.
  // The amount always changes, so the form is always genuinely edited.
  await dialog.locator("#amount").fill(centsAmount(ctx, FALLBACK_AMOUNT_MIN, FALLBACK_AMOUNT_MAX));
  if (ctx.rng.chance(EDIT_DESCRIPTION_RATE)) {
    const seed = ctx.rng.pick(ALL_CATEGORY_SEEDS);
    await dialog.locator("#description").fill(ctx.rng.pick(seed.descriptions));
  }

  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await waitForDialogClosed(page);
  await think(page, ctx);
}

async function runDeleteTransaction(page: Page, ctx: SessionCtx): Promise<void> {
  await ensureRoute(page, "transactions");
  const row = await pickTransactionRow(page, ctx);
  await openRowMenuItem(page, row, "Delete");

  const alert = openAlertDialog(page);
  await alert.waitFor({ state: "visible", timeout: DIALOG_TIMEOUT_MS });

  if (ctx.rng.chance(ctx.abandonRate)) {
    // Backing out of a confirmation is the purest funnel drop-off there is.
    await abandonAlertDialog(page, ctx, "deleteTransaction");
    await think(page, ctx);
    return;
  }

  await alert.getByRole("button", { name: "Delete", exact: true }).click();
  await alert.waitFor({ state: "hidden", timeout: DIALOG_TIMEOUT_MS });
  await think(page, ctx);
}

async function runFilterTransactions(page: Page, ctx: SessionCtx): Promise<void> {
  await ensureRoute(page, "transactions");

  type FilterKind = "search" | "type" | "category" | "month";
  const wanted = pickDistinct<FilterKind>(
    ctx,
    ["search", "type", "category", "month"],
    ctx.rng.int(FILTER_COUNT_MIN, FILTER_COUNT_MAX),
  );

  for (const kind of wanted) {
    if (kind === "search") {
      // Search for a word that is actually on screen — that is what people do,
      // and it keeps the result set non-empty for whatever runs next.
      const rows = transactionRows(page);
      const count = await rows.count();
      if (count === 0) {
        await selectOptionByText(page, filterTypeTrigger(page), ctx.rng.pick(["Income", "Expense"]));
        continue;
      }
      const cellText = await rows.nth(ctx.rng.int(0, Math.min(count, ROW_PICK_LIMIT) - 1)).locator("td").first().innerText();
      const term = cellText.trim().split(/\s+/)[0];
      await page.getByPlaceholder("Search transactions...").fill(term);
    } else if (kind === "type") {
      await selectOptionByText(page, filterTypeTrigger(page), ctx.rng.pick(["Income", "Expense"]));
    } else if (kind === "category") {
      await selectRandomOption(page, ctx, filterCategoryTrigger(page), ["All categories"]);
    } else {
      await page.locator('input[type="month"]').fill(recentMonth(ctx, FILTER_MONTH_LOOKBACK_MAX));
    }
  }

  // The clear button only renders while a filter is active, so its appearance
  // is proof the filter landed rather than a click into the void.
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .waitFor({ state: "visible", timeout: DIALOG_TIMEOUT_MS });

  await readPause(page, ctx); // scanning the filtered list
  await think(page, ctx);
}

async function runClearFilters(page: Page, ctx: SessionCtx): Promise<void> {
  await ensureRoute(page, "transactions");

  const clear = page.getByRole("button", { name: "Clear filters", exact: true });
  if (!(await clear.isVisible())) {
    // The app only renders this button when a filter is active. Nothing to
    // clear is a state, not a failure — a person who walks up to an unfiltered
    // list simply does not click it.
    ctx.log("skipped:clearFilters (no filter was active)");
    await think(page, ctx);
    return;
  }

  await clear.click();
  await clear.waitFor({ state: "hidden", timeout: DIALOG_TIMEOUT_MS });
  await think(page, ctx);
}

// --- Goals and budgets ----------------------------------------------------------

async function runAddGoal(page: Page, ctx: SessionCtx): Promise<void> {
  await ensureRoute(page, "goals");
  await page.getByRole("button", { name: "New Goal", exact: true }).click();
  const dialog = await waitForDialogOpen(page, "New Goal");

  const seed = ctx.rng.pick(GOAL_SEED_POOL);

  if (ctx.rng.chance(ctx.abandonRate)) {
    // Named the goal, never picked a target.
    await dialog.locator("#goal-name").fill(seed.name);
    await abandonDialog(page, ctx, "addGoal");
    await think(page, ctx);
    return;
  }

  await dialog.locator("#goal-name").fill(seed.name);
  await dialog.locator("#goal-target").fill(roundedAmount(ctx, seed.targetMin, seed.targetMax, AMOUNT_ROUNDING_UNIT));
  if (ctx.rng.chance(GOAL_DEADLINE_CHANCE)) {
    await dialog.locator("#goal-deadline").fill(futureDate(ctx, GOAL_DEADLINE_MONTHS_MIN, GOAL_DEADLINE_MONTHS_MAX));
  }
  // The colour field has no free-text input on this form — only the ten preset
  // swatches, each labelled with its own hex.
  const color = ctx.rng.pick(SWATCH_PRESET_COLORS);
  await dialog.getByRole("button", { name: `Color ${color}`, exact: true }).click();

  await dialog.getByRole("button", { name: "Create goal", exact: true }).click();
  await waitForDialogClosed(page);
  await think(page, ctx);
}

async function runContributeToGoal(page: Page, ctx: SessionCtx): Promise<void> {
  await ensureRoute(page, "goals");

  // "Add money" repeats once per goal card with identical text, so pick by index.
  const addMoney = page.getByRole("button", { name: "Add money", exact: true });
  const count = await addMoney.count();
  if (count === 0) {
    throw new Error("no goal cards to contribute to");
  }
  await addMoney.nth(ctx.rng.int(0, count - 1)).click();

  // The title is `Add to "{goal name}"` with curly quotes, so it is not
  // checked against a fixed string.
  const dialog = await waitForDialogOpen(page);

  if (ctx.rng.chance(ctx.abandonRate)) {
    // Wrote the note, never filled in the amount the form actually requires.
    await dialog.locator("#contribution-note").fill(ctx.rng.pick(CONTRIBUTION_NOTE_POOL));
    await abandonDialog(page, ctx, "contributeToGoal");
    await think(page, ctx);
    return;
  }

  await dialog
    .locator("#contribution-amount")
    .fill(centsAmount(ctx, CONTRIBUTION_AMOUNT_MIN, CONTRIBUTION_AMOUNT_MAX));
  // The date field already defaults to today, which is what a person leaves it as.
  if (ctx.rng.chance(CONTRIBUTION_NOTE_RATE)) {
    await dialog.locator("#contribution-note").fill(ctx.rng.pick(CONTRIBUTION_NOTE_POOL));
  }

  await dialog.getByRole("button", { name: "Add contribution", exact: true }).click();
  await waitForDialogClosed(page);
  await think(page, ctx);
}

// The dynamic part of every budget row input's aria-label. Used both to find
// the rows and to read back which category a picked row belongs to.
const BUDGET_LABEL_PREFIX = "Monthly budget for ";

async function runAddBudget(page: Page, ctx: SessionCtx): Promise<void> {
  await ensureRoute(page, "settings");

  const inputs = page.locator(`input[aria-label^="${BUDGET_LABEL_PREFIX}"]`);
  await inputs.first().waitFor({ state: "visible", timeout: NAV_LANDMARK_TIMEOUT_MS });
  const count = await inputs.count();
  const input = inputs.nth(ctx.rng.int(0, count - 1));

  const label = await input.getAttribute("aria-label");
  if (label === null) {
    throw new Error("a budget row input lost its aria-label");
  }
  const categoryName = label.slice(BUDGET_LABEL_PREFIX.length);

  // BudgetManager keeps its "Set" button disabled until the typed value
  // differs from the saved one, so a limit that happens to match gets nudged.
  const existing = await input.inputValue();
  let limit = Number(roundedAmount(ctx, BUDGET_LIMIT_MIN, BUDGET_LIMIT_MAX, BUDGET_LIMIT_STEP));
  if (String(limit) === existing) limit += BUDGET_LIMIT_STEP;

  await input.fill(String(limit));

  if (ctx.rng.chance(ctx.abandonRate)) {
    // No dialog to close here — abandoning a budget means typing a limit and
    // walking away without pressing Set, which is exactly what is left behind.
    ctx.log("abandoned:addBudget");
    await think(page, ctx);
    return;
  }

  // "Set" is identical on every row, so it is scoped to the row that owns
  // this input — by role within the row's container, not by DOM sibling
  // order, which a wrapper element or a reordered Clear button would break.
  await input.locator("xpath=..").getByRole("button", { name: "Set", exact: true }).click();
  await page
    .getByText(`Budget set for ${categoryName}`)
    .first()
    .waitFor({ state: "visible", timeout: TOAST_TIMEOUT_MS });
  await think(page, ctx);
}

// --- Settings --------------------------------------------------------------

/** Plausible variations of a persona's own name, so a rename is a rename and not a corruption. */
function displayNameVariants(persona: Persona): string[] {
  const parts = persona.displayName.split(" ");
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  const variants = [persona.displayName, first];
  if (last.length > 0) variants.push(`${first} ${last[0]}.`);
  return variants;
}

async function runUpdateProfile(page: Page, ctx: SessionCtx): Promise<void> {
  await ensureRoute(page, "settings");

  // "Save changes" exists on both the Profile and the Workspace form on this
  // page, so everything is scoped to the form that owns #displayName.
  const form = page.locator("form").filter({ has: page.locator("#displayName") });
  const input = form.locator("#displayName");
  await input.waitFor({ state: "visible", timeout: NAV_LANDMARK_TIMEOUT_MS });

  // The Save button stays disabled until react-hook-form sees the field as
  // dirty, so the new name has to actually differ from the current one.
  const existing = await input.inputValue();
  const candidates = displayNameVariants(ctx.persona).filter((name) => name !== existing);
  if (candidates.length === 0) {
    throw new Error(`no display-name variant differs from the current "${existing}"`);
  }
  const next = ctx.rng.pick(candidates);

  await input.click();
  await input.fill(next);

  if (ctx.rng.chance(ctx.abandonRate)) {
    // Retyped the name, never pressed Save. Nothing to close — the edit just
    // sits there unsaved, which is what a real half-finished edit looks like.
    ctx.log("abandoned:updateProfile");
    await think(page, ctx);
    return;
  }

  await form.getByRole("button", { name: "Save changes", exact: true }).click();
  // The form re-reads the user from the database after saving and prints the
  // name above the field — a success signal that cannot be a stale toast.
  await form.getByText(next, { exact: true }).first().waitFor({ state: "visible", timeout: TOAST_TIMEOUT_MS });
  await think(page, ctx);
}

async function runUpdateWorkspace(page: Page, ctx: SessionCtx): Promise<void> {
  await ensureRoute(page, "settings");

  const form = page.locator("form").filter({ has: page.locator("#workspace-name") });
  const input = form.locator("#workspace-name");
  await input.waitFor({ state: "visible", timeout: NAV_LANDMARK_TIMEOUT_MS });

  const existing = await input.inputValue();
  const candidates = WORKSPACE_NAME_TEMPLATES.map((template) =>
    template.replace("{name}", firstName(ctx.persona)),
  ).filter((name) => name !== existing);
  if (candidates.length === 0) {
    throw new Error(`no workspace-name template differs from the current "${existing}"`);
  }
  const next = ctx.rng.pick(candidates);

  await input.fill(next);

  if (ctx.rng.chance(ctx.abandonRate)) {
    ctx.log("abandoned:updateWorkspace");
    await think(page, ctx);
    return;
  }

  // The name change alone already makes the form dirty; these are extra
  // realism, not a requirement for the Save button to enable.
  if (ctx.rng.chance(WORKSPACE_CURRENCY_CHANGE_RATE)) {
    await selectRandomOption(page, ctx, form.locator("#currency-setting"));
  }
  if (ctx.rng.chance(WORKSPACE_LOCALE_CHANGE_RATE)) {
    await selectRandomOption(page, ctx, form.locator("#locale-setting"));
  }

  await form.getByRole("button", { name: "Save changes", exact: true }).click();
  // The nav bar reads the workspace name straight off the updated record.
  await page
    .locator("nav")
    .getByText(next, { exact: true })
    .first()
    .waitFor({ state: "visible", timeout: TOAST_TIMEOUT_MS });
  await think(page, ctx);
}

// The three options of the category dialog's "Applies to" select, verbatim.
const CATEGORY_SCOPE_LABELS = ["Expense", "Income", "Both"];

async function runAddCategory(page: Page, ctx: SessionCtx): Promise<void> {
  await ensureRoute(page, "settings");

  // CategoryManager renders skeletons until its categories load; the button
  // does not exist before that.
  const addButton = page.getByRole("button", { name: "Add Category", exact: true });
  await addButton.waitFor({ state: "visible", timeout: NAV_LANDMARK_TIMEOUT_MS });
  await addButton.click();

  const dialog = await waitForDialogOpen(page, "New Category");
  const seed = ctx.rng.pick(CUSTOM_CATEGORY_SEEDS);

  if (ctx.rng.chance(ctx.abandonRate)) {
    await dialog.locator("#cat-name").fill(seed.name);
    await abandonDialog(page, ctx, "addCategory");
    await think(page, ctx);
    return;
  }

  await dialog.locator("#cat-name").fill(seed.name);
  // The dialog's only select. Its trigger has no id, so it is scoped to the dialog.
  await selectOptionByText(page, dialog.locator('[data-slot="select-trigger"]'), ctx.rng.pick(CATEGORY_SCOPE_LABELS));
  // Of the three controls bound to `color`, the preset swatches are the only
  // one Playwright can drive cleanly (`fill()` does not work on input[type=color]).
  const color = ctx.rng.pick(SWATCH_PRESET_COLORS);
  await dialog.getByRole("button", { name: `Color ${color}`, exact: true }).click();

  await dialog.getByRole("button", { name: "Add category", exact: true }).click();
  await waitForDialogClosed(page);
  await think(page, ctx);
}

// --- Quick Add --------------------------------------------------------------

async function runUseQuickAdd(page: Page, ctx: SessionCtx): Promise<void> {
  await ensureAppRoute(page, ctx);

  if (ctx.rng.chance(QUICK_ADD_SHORTCUT_RATE)) {
    // The app's own handler accepts either modifier, and refuses to open over
    // another dialog — which is why no action leaves one open.
    await page.keyboard.press("Control+k");
  } else {
    await page.getByRole("button", { name: "Open quick add", exact: true }).click();
  }

  const dialog = openDialog(page);
  await dialog.waitFor({ state: "visible", timeout: DIALOG_TIMEOUT_MS });
  const input = dialog.getByLabel("Quick add transaction");
  await input.waitFor({ state: "visible", timeout: DIALOG_TIMEOUT_MS });

  const seed = ctx.rng.pick(ALL_CATEGORY_SEEDS);
  const description = ctx.rng.pick(seed.descriptions);
  const phrase = `${description} ${amountFor(ctx, seed.name)}`;

  if (ctx.rng.chance(ctx.abandonRate)) {
    // Typed the entry, closed the palette without pressing Enter. The palette
    // has no Cancel button (and no close X), so Escape is the only exit.
    await input.fill(phrase);
    await page.keyboard.press("Escape");
    await waitForDialogClosed(page);
    ctx.log("abandoned:useQuickAdd");
    await think(page, ctx);
    return;
  }

  await input.fill(phrase);

  // The palette saves on Enter and only when it has BOTH an amount and a
  // resolved category — and it fails silently when it does not (its own hint
  // text is misleading about which one is missing). Clicking a category chip
  // removes the guesswork. The chips are the only buttons in this dialog: it
  // is rendered with `showCloseButton={false}` and has no submit button.
  const chips = dialog.locator("button");
  // The chips only exist once the palette has lazily loaded the workspace's
  // categories, so this waits — but swallows the timeout, because zero chips
  // is a real (if rare) state the app can be in: they are one per category
  // *matching the parsed type*. The count check below is what reports it, and
  // it reports it as itself rather than as an opaque wait timeout.
  await chips.first().waitFor({ state: "visible", timeout: QUICK_ADD_CHIPS_TIMEOUT_MS }).catch(() => undefined);
  const chipNames = (await chips.allInnerTexts()).map((text) => text.trim()).filter((text) => text.length > 0);
  if (chipNames.length === 0) {
    throw new Error(`the quick add palette offered no category chips for "${phrase}"`);
  }
  const chipChoice = ctx.rng.pick(chipNames);
  await dialog.getByRole("button", { name: chipChoice, exact: true }).first().click();

  await input.press("Enter");
  // Matched on the exact description this entry will be saved under, not on an
  // `Added:` prefix — a toast left over from an earlier quick add would
  // satisfy a prefix and let a silent non-save pass. The app names the
  // transaction `parsed.description || category.name`, so an entry whose
  // description was entirely type keywords is named after the chip instead.
  const savedAs = parsedDescription(description) || chipChoice;
  await page.getByText(`Added: ${savedAs}`).first().waitFor({ state: "visible", timeout: TOAST_TIMEOUT_MS });

  // The palette deliberately stays open after a save, for rapid entry.
  await page.keyboard.press("Escape");
  await waitForDialogClosed(page);
  await think(page, ctx);
}

// --- Reading and leaving ------------------------------------------------------

/**
 * A long, click-free dwell on the insights page. This action produces no
 * events of its own by design — its entire output is time on page, which is
 * why it pauses several times over rather than once, and scrolls (scrolling
 * is not clicking) so the dwell looks like reading rather than an idle tab.
 */
async function runReadInsights(page: Page, ctx: SessionCtx): Promise<void> {
  await ensureRoute(page, "insights");

  const startedAt = Date.now();
  const pauses = ctx.rng.int(INSIGHTS_DWELL_PAUSES_MIN, INSIGHTS_DWELL_PAUSES_MAX);
  for (let i = 0; i < pauses; i++) {
    if (ctx.rng.chance(INSIGHTS_SCROLL_RATE)) {
      await page.mouse.wheel(0, ctx.rng.int(INSIGHTS_SCROLL_PX_MIN, INSIGHTS_SCROLL_PX_MAX));
    }
    await readPause(page, ctx);
  }
  ctx.log(`readInsights: dwelled ${Date.now() - startedAt}ms over ${pauses} pause(s)`);

  await think(page, ctx);
}

/**
 * Terminal: everything else in this file needs an authenticated session, so
 * Task 5 ends the session walk as soon as this runs. There is no confirmation
 * dialog — the click signs out immediately and the router redirects.
 */
async function runSignOut(page: Page, ctx: SessionCtx): Promise<void> {
  await ensureAppRoute(page, ctx);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .waitFor({ state: "visible", timeout: NAV_LANDMARK_TIMEOUT_MS });
  await think(page, ctx);
}

// =============================================================================
// The registry
// =============================================================================

/** An action's likelihood comes from its persona's archetype — the single table in personas.ts, so weights are tuned in one place. */
function archetypeWeight(name: ActionName): (ctx: SessionCtx) => number {
  return (ctx) => ARCHETYPES[ctx.persona.archetype].actionWeights[name];
}

/**
 * Keying by `ActionName` makes the compiler check that all 19 exist, that
 * none is misspelled, and — because each value's `name` is narrowed to its
 * own key — that no entry is filed under the wrong name.
 */
type ActionMap = { [K in ActionName]: Action & { name: K } };

const ACTION_MAP: ActionMap = {
  navigateDashboard: {
    name: "navigateDashboard",
    weight: archetypeWeight("navigateDashboard"),
    run: runNavigateDashboard,
  },
  navigateTransactions: {
    name: "navigateTransactions",
    weight: archetypeWeight("navigateTransactions"),
    run: runNavigateTransactions,
  },
  navigateInsights: {
    name: "navigateInsights",
    weight: archetypeWeight("navigateInsights"),
    run: runNavigateInsights,
  },
  navigateGoals: {
    name: "navigateGoals",
    weight: archetypeWeight("navigateGoals"),
    run: runNavigateGoals,
  },
  navigateSettings: {
    name: "navigateSettings",
    weight: archetypeWeight("navigateSettings"),
    run: runNavigateSettings,
  },
  addTransaction: {
    name: "addTransaction",
    weight: archetypeWeight("addTransaction"),
    run: runAddTransaction,
  },
  editTransaction: {
    name: "editTransaction",
    weight: archetypeWeight("editTransaction"),
    run: runEditTransaction,
  },
  deleteTransaction: {
    name: "deleteTransaction",
    weight: archetypeWeight("deleteTransaction"),
    run: runDeleteTransaction,
  },
  filterTransactions: {
    name: "filterTransactions",
    weight: archetypeWeight("filterTransactions"),
    run: runFilterTransactions,
  },
  clearFilters: {
    name: "clearFilters",
    weight: archetypeWeight("clearFilters"),
    run: runClearFilters,
  },
  addGoal: {
    name: "addGoal",
    weight: archetypeWeight("addGoal"),
    run: runAddGoal,
  },
  contributeToGoal: {
    name: "contributeToGoal",
    weight: archetypeWeight("contributeToGoal"),
    run: runContributeToGoal,
  },
  addBudget: {
    name: "addBudget",
    weight: archetypeWeight("addBudget"),
    run: runAddBudget,
  },
  updateProfile: {
    name: "updateProfile",
    weight: archetypeWeight("updateProfile"),
    run: runUpdateProfile,
  },
  updateWorkspace: {
    name: "updateWorkspace",
    weight: archetypeWeight("updateWorkspace"),
    run: runUpdateWorkspace,
  },
  addCategory: {
    name: "addCategory",
    weight: archetypeWeight("addCategory"),
    run: runAddCategory,
  },
  useQuickAdd: {
    name: "useQuickAdd",
    weight: archetypeWeight("useQuickAdd"),
    run: runUseQuickAdd,
  },
  readInsights: {
    name: "readInsights",
    weight: archetypeWeight("readInsights"),
    run: runReadInsights,
  },
  signOut: {
    name: "signOut",
    weight: archetypeWeight("signOut"),
    run: runSignOut,
  },
};

/** All 19 actions. Order is the declaration order above, which is the order the brief lists them in. */
export const ACTIONS: Action[] = Object.values(ACTION_MAP);
