// The usage bot's entry point — the thing GitHub Actions actually invokes.
//
// It does four things, in order:
//   1. Builds a session plan for the current UTC hour from the follow-the-sun
//      traffic curve (`buildPlan`, exported and browser-free, which is what
//      makes BOT_DRY_RUN possible).
//   2. Launches one Chromium and runs the plan through a hand-rolled
//      concurrency pool bounded by MAX_CONCURRENCY.
//   3. Drives each session in its own BrowserContext — a seeded returning
//      persona, or a brand-new visitor signing up through the real UI.
//   4. Prints a summary and exits 1 only if the failure rate exceeds
//      MAX_FAILURE_RATE.
//
// Environment contract (Task 6's workflow depends on exactly these):
//   APP_URL       where the app is served (default http://localhost:5173)
//   HEADLESS      "false" to watch the run in a real window
//   BOT_NOW       ISO timestamp overriding the clock the plan is built from
//   BOT_SESSIONS  absolute override of the total session count
//   BOT_DRY_RUN   "true" prints the plan and exits 0 without a browser
//
// Rules this file exists to enforce, each learned the hard way and none of
// them safe to "simplify" away:
//   - `preparePage` runs on every page before its first navigation.
//   - A failed action does NOT end the session: it is counted, the UI is
//     reset, and the walk continues. Session length is analytics data.
//   - `signOut` is terminal — everything else needs an authenticated session.
//   - `clearFilters` logging `skipped:` is neither a failure nor a feature
//     use.
//   - A failed session never aborts the run, and its context is always
//     closed.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import {
  APP_URL,
  FAILURE_DIR,
  HEADLESS,
  MAX_CONCURRENCY,
  MAX_FAILURE_RATE,
  NAV_LANDMARK_TIMEOUT_MS,
  NEW_VISITOR_ABANDON_RATE,
  NEW_VISITOR_ACTIONS,
  NEW_VISITOR_ARCHETYPE,
  NEW_VISITOR_CURRENCY_CHANGE_RATE,
  NEW_VISITOR_LOCALE_CHANGE_RATE,
  NEW_VISITOR_RATE,
  NEW_VISITOR_SHOW_PASSWORD_RATE,
  NEW_VISITOR_WALK_MAX,
  NEW_VISITOR_WALK_MIN,
  REGION_CURVE,
  REGIONS,
  SCREENSHOT_TIMEOUT_MS,
  SEED_LANDMARK_TIMEOUT_MS,
  SESSION_TIMEOUT_MS,
  SIGNUP_USERNAME_MAX_LEN,
  USER_AGENTS,
  VIEWPORTS,
  makeRng,
  sessionsForHour,
  type Region,
  type Rng,
} from "./config";
import {
  ACTIONS,
  preparePage,
  resetUiState,
  selectOptionByText,
  think,
  type Action,
  type SessionCtx,
} from "./actions";
import { ARCHETYPES, PERSONAS, type ActionName, type Persona } from "./personas";
import { clearBrowserState, seedPersona } from "./seed";
import {
  CURRENCY_OPTION_LABELS,
  LOCALE_OPTION_LABELS,
  NEW_VISITOR_NAME_POOL,
  PERSONA_PASSWORD,
  REGION_WORKSPACE_OPTIONS,
  WORKSPACE_NAME_TEMPLATES,
} from "./seed-data";

// =============================================================================
// Plan
// =============================================================================

export type SessionKind = "returning" | "new-visitor";

export interface PlannedSession {
  /** 1-based, stable for the life of the run. Used in logs, screenshot names and the summary. */
  index: number;
  region: Region;
  kind: SessionKind;
  /**
   * For a returning session this is one of the 40 fixed PERSONAS. For a
   * new-visitor session it is a synthetic identity with the same shape, so
   * the walk and every action can treat both kinds identically — the actions
   * read `displayName`, `archetype` and nothing else off it.
   */
  persona: Persona;
  /** Seeds this session's PRNG. Derived from the plan's clock and the slot index, so a session is reproducible on its own and unaffected by what order the pool happens to run it in. */
  seed: string;
}

export interface SessionPlan {
  now: Date;
  total: number;
  perRegion: Record<Region, number>;
  sessions: PlannedSession[];
}

/**
 * The synthetic account id a new visitor's persona carries. Nothing reads it
 * — sign-up mints the app's real User and Workspace ids — but `Persona`
 * requires the field, and a recognisable value beats an empty string when it
 * turns up in a log.
 */
const NEW_VISITOR_ACCOUNT_ID = "acct-new-visitor";

/**
 * Splits `total` across `weights` by largest remainder, so the parts always
 * sum to exactly `total`. Used only for BOT_SESSIONS, which has to be honoured
 * to the session while still landing in the regions the curve favours.
 */
function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((acc, w) => acc + w, 0);
  if (sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const parts = exact.map((value) => Math.floor(value));
  let remaining = total - parts.reduce((acc, p) => acc + p, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);
  for (const { index } of byRemainder) {
    if (remaining <= 0) break;
    parts[index] += 1;
    remaining -= 1;
  }
  return parts;
}

/**
 * A username no run has used before.
 *
 * `stamp` is a base-36 wall-clock reading, not randomness — the PRNG cannot
 * help here, because a deterministic username would collide with itself the
 * second time the same plan runs against the same app, and sign-up rejects a
 * taken username. The slot index keeps the names inside one run distinct.
 * The stem is trimmed so the whole thing stays inside the app's 3-30
 * character rule, and the pool's names are ASCII so it stays inside
 * `[A-Za-z0-9_]`.
 */
function newVisitorUsername(displayName: string, stamp: string, index: number): string {
  const suffix = `_${stamp}${index}`;
  const stem = displayName.split(" ")[0].toLowerCase().replace(/[^a-z0-9_]/g, "");
  return `${stem.slice(0, SIGNUP_USERNAME_MAX_LEN - suffix.length)}${suffix}`;
}

function newVisitorPersona(rng: Rng, region: Region, stamp: string, index: number): Persona {
  const displayName = rng.pick(NEW_VISITOR_NAME_POOL);
  return {
    id: `new-visitor-${index}`,
    username: newVisitorUsername(displayName, stamp, index),
    password: PERSONA_PASSWORD,
    displayName,
    accountId: NEW_VISITOR_ACCOUNT_ID,
    region,
    archetype: NEW_VISITOR_ARCHETYPE,
  };
}

/**
 * Builds the whole run's session plan. Pure: no browser, no I/O, no clock of
 * its own — everything comes from `now` and the seeded PRNG (bar the
 * collision-proofing stamp explained above). That is what lets BOT_DRY_RUN
 * print exactly what a real run would do.
 *
 * `totalOverride` is BOT_SESSIONS: an absolute total, split across the
 * regions in the same proportion the hour's curve gives them.
 */
export function buildPlan(now: Date, totalOverride: number | null = null): SessionPlan {
  const rng = makeRng(`plan:${now.toISOString()}`);
  const stamp = Date.now().toString(36);
  const hour = now.getUTCHours();

  const perRegion = {} as Record<Region, number>;
  if (totalOverride === null) {
    const curveCounts = sessionsForHour(now);
    for (const region of REGIONS) perRegion[region] = curveCounts[region];
  } else {
    const shares = apportion(
      totalOverride,
      REGIONS.map((region) => REGION_CURVE[region][hour]),
    );
    REGIONS.forEach((region, i) => {
      perRegion[region] = shares[i];
    });
  }

  const sessions: PlannedSession[] = [];
  // No persona is used twice in one run: a single visitor logging in twice in
  // the same minute from two browsers is not behaviour worth manufacturing.
  const usedPersonaIds = new Set<string>();

  for (const region of REGIONS) {
    for (let slot = 0; slot < perRegion[region]; slot++) {
      const index = sessions.length + 1;
      const seed = `session:${now.toISOString()}:${index}`;
      const candidates = PERSONAS.filter(
        (persona) => persona.region === region && !usedPersonaIds.has(persona.id),
      );
      // `chance` is drawn first either way, so exhausting a region's pool
      // (only reachable via a large BOT_SESSIONS) does not shift the PRNG
      // stream for the slots after it.
      const drewNewVisitor = rng.chance(NEW_VISITOR_RATE);
      if (drewNewVisitor || candidates.length === 0) {
        sessions.push({
          index,
          region,
          kind: "new-visitor",
          persona: newVisitorPersona(rng, region, stamp, index),
          seed,
        });
        continue;
      }
      const persona = rng.weighted(candidates, (p) => ARCHETYPES[p.archetype].showUpRate);
      usedPersonaIds.add(persona.id);
      sessions.push({ index, region, kind: "returning", persona, seed });
    }
  }

  return { now, total: sessions.length, perRegion, sessions };
}

// =============================================================================
// Text formatting
// =============================================================================

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Column widths come from the content, so no layout number is ever hardcoded. */
function renderTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => row[column].length)),
  );
  const line = (cells: string[]): string =>
    cells.map((cell, column) => cell.padEnd(widths[column])).join("  ").trimEnd();
  return [line(headers), line(widths.map((width) => "-".repeat(width))), ...rows.map(line)].join("\n");
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function describeClock(now: Date): string {
  return `${now.toISOString()} (UTC hour ${now.getUTCHours()}, ${WEEKDAY_NAMES[now.getUTCDay()]})`;
}

function perRegionSummary(perRegion: Record<Region, number>): string {
  return REGIONS.map((region) => `${region} ${perRegion[region]}`).join(", ");
}

function formatPlan(plan: SessionPlan, totalOverride: number | null): string {
  const newVisitors = plan.sessions.filter((s) => s.kind === "new-visitor").length;
  const share = plan.total === 0 ? 0 : (newVisitors / plan.total) * 100;
  const lines = [
    "=== usage bot — DRY RUN (no browser launched) ===",
    `clock          ${describeClock(plan.now)}`,
    `app            ${APP_URL}`,
    `planned        ${plan.total} session(s) — ${perRegionSummary(plan.perRegion)}`,
    `new visitors   ${newVisitors} (${share.toFixed(0)}% of planned, target ${(NEW_VISITOR_RATE * 100).toFixed(0)}%)`,
    `count from     ${totalOverride === null ? "the traffic curve" : `BOT_SESSIONS=${totalOverride}`}`,
    "",
  ];
  if (plan.total > 0) {
    lines.push(
      renderTable(
        ["#", "region", "kind", "persona", "archetype", "account"],
        plan.sessions.map((session) => [
          String(session.index),
          session.region,
          session.kind,
          session.persona.username,
          session.persona.archetype,
          session.persona.accountId,
        ]),
      ),
    );
  } else {
    lines.push("(nothing planned for this hour)");
  }
  return lines.join("\n");
}

/** Playwright errors run to dozens of lines; the first one carries the meaning. The full text goes in the failure sidecar. */
function firstLine(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.split("\n")[0].trim();
}

function fullError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? `${err.name}: ${err.message}`;
  return String(err);
}

// =============================================================================
// Session execution
// =============================================================================

interface SessionCounters {
  /** Actions that ran to completion. An abandoned dialog counts (the drop-off is the data); a `skipped:` no-op does not. */
  actions: number;
  abandonments: number;
  skips: number;
  /** Actions that threw. The session survives them — see the header comment. */
  actionFailures: number;
}

interface SessionOutcome {
  planned: PlannedSession;
  ok: boolean;
  counters: SessionCounters;
  durationMs: number;
  error: string | null;
  url: string | null;
  screenshot: string | null;
}

/**
 * The session's log sink. It doubles as the abandonment/skip counter: the
 * actions already emit `abandoned:<name>` and `skipped:<name>` lines, so
 * counting here means the orchestrator never has to duplicate an action's
 * own knowledge of whether it went through.
 */
function makeSessionLogger(planned: PlannedSession, counters: SessionCounters): (msg: string) => void {
  const tag = `[#${String(planned.index).padStart(2, "0")} ${planned.region} ${planned.persona.username}]`;
  return (msg: string): void => {
    if (msg.startsWith("abandoned:")) counters.abandonments += 1;
    else if (msg.startsWith("skipped:")) counters.skips += 1;
    console.log(`${tag} ${msg}`);
  };
}

function actionByName(name: ActionName): Action {
  const action = ACTIONS.find((candidate) => candidate.name === name);
  if (action === undefined) throw new Error(`no action is registered under the name "${name}"`);
  return action;
}

/** Resolved once: the subset of ACTIONS a workspace with no data can actually perform. */
const NEW_VISITOR_ACTION_POOL: Action[] = NEW_VISITOR_ACTIONS.map(actionByName);

/**
 * Runs one action and books the result. Never throws: a thrown action is
 * counted, the page is cleared of whatever overlay the throw left open, and
 * the caller carries on with the next step.
 */
async function runStep(
  page: Page,
  ctx: SessionCtx,
  counters: SessionCounters,
  action: Action,
): Promise<void> {
  const skipsBefore = counters.skips;
  try {
    await action.run(page, ctx);
    if (counters.skips === skipsBefore) counters.actions += 1;
  } catch (err) {
    counters.actionFailures += 1;
    ctx.log(`failed:${action.name} — ${firstLine(err)}`);
    // Safe in a catch by contract: resetUiState never throws.
    await resetUiState(page, ctx.log);
  }
}

/** Weighted-picks and runs `steps` actions from `pool`, stopping early at signOut. */
async function driveWalk(
  page: Page,
  ctx: SessionCtx,
  counters: SessionCounters,
  pool: Action[],
  steps: number,
): Promise<void> {
  for (let step = 0; step < steps; step++) {
    const available = pool.filter((action) => action.weight(ctx) > 0);
    if (available.length === 0) {
      ctx.log("walk ended: no action is available to this persona");
      return;
    }
    const action = ctx.rng.weighted(available, (candidate) => candidate.weight(ctx));
    await runStep(page, ctx, counters, action);
    if (action.name === "signOut") {
      // Terminal whether or not it succeeded: every other action needs an
      // authenticated session, and a signOut that threw halfway may well
      // have signed out anyway.
      ctx.log("walk ended: signOut is terminal");
      return;
    }
  }
}

/**
 * The new-visitor path: wipe the browser, land on the app as a stranger, and
 * go through the real sign-up and workspace-setup forms. No seeding, no
 * shortcuts — a genuine first-time funnel is the whole point of these
 * sessions.
 */
async function signUpNewVisitor(page: Page, ctx: SessionCtx): Promise<void> {
  const { persona } = ctx;

  // clearBrowserState wipes storage but leaves the already-loaded page holding
  // the app's stale in-memory state, so a navigation has to follow it before
  // anything gets driven.
  await clearBrowserState(page);
  await page.goto(APP_URL);

  // Unauthenticated, so the app's route guard bounces us to /sign-in.
  const signInButton = page.getByRole("button", { name: "Sign in", exact: true });
  await signInButton.waitFor({ state: "visible", timeout: NAV_LANDMARK_TIMEOUT_MS });
  await think(page, ctx);

  // The real link, not a URL push — the sign-in -> sign-up hop is part of the
  // funnel this session exists to record.
  await page.getByRole("link", { name: "Create one", exact: true }).click();
  const createAccount = page.getByRole("button", { name: "Create account", exact: true });
  await createAccount.waitFor({ state: "visible", timeout: NAV_LANDMARK_TIMEOUT_MS });
  await think(page, ctx);

  await page.locator("#displayName").fill(persona.displayName);
  await page.locator("#username").fill(persona.username);
  await page.locator("#password").fill(persona.password);
  if (ctx.rng.chance(NEW_VISITOR_SHOW_PASSWORD_RATE)) {
    await page.getByRole("button", { name: "Show password", exact: true }).click();
  }
  await page.locator("#confirmPassword").fill(persona.password);
  await createAccount.click();

  // A successful sign-up always lands on /setup-workspace.
  const createWorkspace = page.getByRole("button", { name: "Create Workspace", exact: true });
  await createWorkspace.waitFor({ state: "visible", timeout: NAV_LANDMARK_TIMEOUT_MS });
  await think(page, ctx);

  const workspaceName = ctx.rng
    .pick(WORKSPACE_NAME_TEMPLATES)
    .replace("{name}", persona.displayName.split(" ")[0]);
  await page.locator("#workspace-name").fill(workspaceName);

  // Region-plausible money settings, picked from the app's own option lists.
  // Both selects already hold a valid default (USD / English (US)), so these
  // are extra interaction rather than a requirement for the form to submit.
  const money = ctx.rng.pick(REGION_WORKSPACE_OPTIONS[persona.region]);
  if (ctx.rng.chance(NEW_VISITOR_CURRENCY_CHANGE_RATE)) {
    await selectOptionByText(page, page.locator("#currency"), labelFor(CURRENCY_OPTION_LABELS, money.currency, "currency"));
  }
  if (ctx.rng.chance(NEW_VISITOR_LOCALE_CHANGE_RATE)) {
    await selectOptionByText(page, page.locator("#locale"), labelFor(LOCALE_OPTION_LABELS, money.locale, "locale"));
  }

  await createWorkspace.click();

  // Workspace creation redirects to the dashboard; wait for its data, not
  // just its heading (AppLayout paints the heading over skeletons).
  await page.getByRole("heading", { name: "Dashboard", level: 1 }).waitFor({ timeout: SEED_LANDMARK_TIMEOUT_MS });
  await page.getByText("Income", { exact: true }).first().waitFor({ timeout: SEED_LANDMARK_TIMEOUT_MS });
  ctx.log(`signed up as ${persona.username} and created "${workspaceName}"`);
  await think(page, ctx);
}

function labelFor(labels: Record<string, string>, code: string, what: string): string {
  const label = labels[code];
  if (label === undefined) throw new Error(`no ${what} option label is mapped for "${code}"`);
  return label;
}

async function driveSession(
  page: Page,
  planned: PlannedSession,
  ctx: SessionCtx,
  counters: SessionCounters,
): Promise<void> {
  if (planned.kind === "returning") {
    // Writes the persona's history straight into IndexedDB and comes back on
    // a rendered dashboard, so the analytics agent sees a returning user.
    await seedPersona(page, planned.persona);
    const archetype = ARCHETYPES[planned.persona.archetype];
    const steps = ctx.rng.int(archetype.sessionLengthMin, archetype.sessionLengthMax);
    ctx.log(`walking ${steps} step(s)`);
    await driveWalk(page, ctx, counters, ACTIONS, steps);
    return;
  }

  await signUpNewVisitor(page, ctx);
  // First act of a fresh account is to put something in it. That is what a
  // real first session looks like, and it leaves the remaining steps a
  // workspace with data rather than an empty one.
  await runStep(page, ctx, counters, actionByName("addTransaction"));
  const steps = ctx.rng.int(NEW_VISITOR_WALK_MIN, NEW_VISITOR_WALK_MAX);
  ctx.log(`walking ${steps} step(s) as a new visitor`);
  await driveWalk(page, ctx, counters, NEW_VISITOR_ACTION_POOL, Math.max(0, steps - 1));
}

/** Rejects with `message` if `work` has not settled inside `ms`. */
async function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function captureFailure(
  page: Page,
  planned: PlannedSession,
  failureDir: string,
  err: unknown,
  log: (msg: string) => void,
): Promise<string | null> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = planned.persona.username.replace(/[^A-Za-z0-9_-]/g, "_");
  const base = path.join(failureDir, `${stamp}-s${planned.index}-${planned.region}-${safeName}`);
  try {
    await mkdir(failureDir, { recursive: true });
    // The note is written first: it cannot fail for the same reason the
    // screenshot might (a page that stopped answering), so a hung page still
    // leaves the URL and the error behind.
    await writeFile(
      `${base}.txt`,
      [
        `session   #${planned.index} (${planned.kind})`,
        `region    ${planned.region}`,
        `persona   ${planned.persona.username} (${planned.persona.archetype})`,
        `url       ${page.url()}`,
        `seed      ${planned.seed}`,
        "",
        fullError(err),
        "",
      ].join("\n"),
      "utf8",
    );
    await page.screenshot({ path: `${base}.png`, fullPage: true, timeout: SCREENSHOT_TIMEOUT_MS });
    return `${base}.png`;
  } catch (captureErr) {
    log(`could not capture the failure (${firstLine(captureErr)})`);
    return null;
  }
}

/**
 * One session, start to finish. Never throws: whatever goes wrong is recorded
 * in the outcome and the run carries on, and the context is closed on every
 * path including the ones that fail before a page exists.
 */
async function runOneSession(
  browser: Browser,
  planned: PlannedSession,
  failureDir: string,
): Promise<SessionOutcome> {
  const startedAt = Date.now();
  const counters: SessionCounters = { actions: 0, abandonments: 0, skips: 0, actionFailures: 0 };
  const rng = makeRng(planned.seed);
  const viewport = rng.pick(VIEWPORTS);
  const userAgent = rng.pick(USER_AGENTS);
  const log = makeSessionLogger(planned, counters);
  const ctx: SessionCtx = {
    persona: planned.persona,
    rng,
    // A new visitor uses its own dedicated abandon rate rather than the
    // explorer archetype it otherwise borrows action weights from — see
    // NEW_VISITOR_ABANDON_RATE's comment in config.ts.
    abandonRate:
      planned.kind === "new-visitor"
        ? NEW_VISITOR_ABANDON_RATE
        : ARCHETYPES[planned.persona.archetype].abandonRate,
    log,
  };

  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let error: string | null = null;
  let url: string | null = null;
  let screenshot: string | null = null;

  try {
    context = await browser.newContext({ viewport, userAgent });
    page = await context.newPage();
    // MUST come before the first navigation: it installs the no-op `__name`
    // polyfill without which every page.evaluate in the bot (seeding
    // included) dies with `ReferenceError: __name is not defined`.
    await preparePage(page);
    log(`start ${planned.kind} as ${planned.persona.archetype} at ${viewport.width}x${viewport.height}`);
    await withTimeout(
      driveSession(page, planned, ctx, counters),
      SESSION_TIMEOUT_MS,
      `session exceeded SESSION_TIMEOUT_MS (${SESSION_TIMEOUT_MS}ms)`,
    );
    log(
      `done — ${counters.actions} action(s), ${counters.abandonments} abandoned, ` +
        `${counters.skips} skipped, ${counters.actionFailures} action failure(s)`,
    );
  } catch (err) {
    error = firstLine(err);
    log(`FAILED — ${error}`);
    if (page !== null) {
      url = page.url();
      screenshot = await captureFailure(page, planned, failureDir, err, log);
    }
  } finally {
    if (context !== null) {
      try {
        await context.close();
      } catch (closeErr) {
        log(`could not close the browser context (${firstLine(closeErr)})`);
      }
    }
  }

  return {
    planned,
    ok: error === null,
    counters,
    durationMs: Date.now() - startedAt,
    error,
    url,
    screenshot,
  };
}

/**
 * MAX_CONCURRENCY worker promises pulling from one shared index. Claiming an
 * index needs no lock: Node runs this on a single thread and there is no
 * `await` between reading `next` and incrementing it.
 */
async function runPool(
  browser: Browser,
  plan: SessionPlan,
  failureDir: string,
): Promise<SessionOutcome[]> {
  const outcomes = new Array<SessionOutcome>(plan.sessions.length);
  let next = 0;
  const workerCount = Math.min(MAX_CONCURRENCY, plan.sessions.length);
  const workers: Promise<void>[] = [];
  for (let worker = 0; worker < workerCount; worker++) {
    workers.push(
      (async () => {
        for (;;) {
          const index = next;
          next += 1;
          if (index >= plan.sessions.length) return;
          const planned = plan.sessions[index];
          try {
            outcomes[index] = await runOneSession(browser, planned, failureDir);
          } catch (err) {
            // runOneSession is written not to throw. This is the belt to that
            // braces: one session must never be able to take the run down,
            // and an unrecorded slot would leave a hole in `outcomes`.
            console.log(`[#${planned.index}] orchestrator error — ${firstLine(err)}`);
            outcomes[index] = {
              planned,
              ok: false,
              counters: { actions: 0, abandonments: 0, skips: 0, actionFailures: 0 },
              durationMs: 0,
              error: firstLine(err),
              url: null,
              screenshot: null,
            };
          }
        }
      })(),
    );
  }
  await Promise.all(workers);
  return outcomes;
}

// =============================================================================
// Summary
// =============================================================================

function printSummary(plan: SessionPlan, outcomes: SessionOutcome[], wallClockMs: number): void {
  const succeeded = outcomes.filter((outcome) => outcome.ok).length;
  const failed = outcomes.length - succeeded;
  const sum = (pick: (counters: SessionCounters) => number): number =>
    outcomes.reduce((acc, outcome) => acc + pick(outcome.counters), 0);

  const regionRows = REGIONS.map((region) => {
    const forRegion = outcomes.filter((outcome) => outcome.planned.region === region);
    return [
      region,
      String(plan.perRegion[region]),
      String(forRegion.filter((outcome) => outcome.ok).length),
      String(forRegion.filter((outcome) => !outcome.ok).length),
      String(forRegion.filter((outcome) => outcome.planned.kind === "new-visitor").length),
      String(forRegion.reduce((acc, outcome) => acc + outcome.counters.actions, 0)),
      String(forRegion.reduce((acc, outcome) => acc + outcome.counters.abandonments, 0)),
      String(forRegion.reduce((acc, outcome) => acc + outcome.counters.actionFailures, 0)),
    ];
  });

  const lines = [
    "",
    "=== usage bot — run summary ===",
    `clock             ${describeClock(plan.now)}`,
    `app               ${APP_URL}`,
    `planned           ${plan.total} — ${perRegionSummary(plan.perRegion)}`,
    `succeeded         ${succeeded}`,
    `failed            ${failed}`,
    `actions performed ${sum((c) => c.actions)}`,
    `abandonments      ${sum((c) => c.abandonments)}`,
    `skipped no-ops    ${sum((c) => c.skips)}`,
    `action failures   ${sum((c) => c.actionFailures)}`,
    `duration          ${formatDuration(wallClockMs)}`,
    "",
    renderTable(
      ["region", "planned", "ok", "failed", "new", "actions", "abandons", "actionFails"],
      regionRows,
    ),
  ];

  const failures = outcomes.filter((outcome) => !outcome.ok);
  if (failures.length > 0) {
    lines.push("", "failed sessions:");
    for (const failure of failures) {
      lines.push(
        `  #${failure.planned.index} ${failure.planned.region} ${failure.planned.persona.username} (${failure.planned.kind})`,
        `    url        ${failure.url ?? "(no page)"}`,
        `    error      ${failure.error ?? "(none)"}`,
        `    screenshot ${failure.screenshot ?? "(not captured)"}`,
      );
    }
  }

  console.log(lines.join("\n"));
}

// =============================================================================
// Environment
// =============================================================================

function readNow(): Date {
  const raw = process.env.BOT_NOW;
  if (raw === undefined || raw === "") return new Date();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`BOT_NOW is not a valid ISO timestamp: "${raw}"`);
  }
  return parsed;
}

function readSessionsOverride(): number | null {
  const raw = process.env.BOT_SESSIONS;
  if (raw === undefined || raw === "") return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`BOT_SESSIONS must be a non-negative whole number, got "${raw}"`);
  }
  return parsed;
}

// FAILURE_DIR is resolved against this file's own directory, never
// process.cwd(): the workflow uploads `bot/failures/` as its artifact, and a
// run started from the repo root would otherwise scatter screenshots there.
const BOT_DIR = path.dirname(fileURLToPath(import.meta.url));

// =============================================================================
// Entry point
// =============================================================================

async function main(): Promise<number> {
  const now = readNow();
  const totalOverride = readSessionsOverride();
  const plan = buildPlan(now, totalOverride);

  if (process.env.BOT_DRY_RUN === "true") {
    console.log(formatPlan(plan, totalOverride));
    return 0;
  }

  if (plan.total === 0) {
    console.log(
      `=== usage bot ===\nclock ${describeClock(now)}\nNo sessions planned for this hour — nothing to do.`,
    );
    // An empty plan is a successful run, not a 0/0 failure.
    return 0;
  }

  console.log(
    [
      "=== usage bot ===",
      `clock       ${describeClock(now)}`,
      `app         ${APP_URL}`,
      `planned     ${plan.total} — ${perRegionSummary(plan.perRegion)}`,
      `concurrency ${Math.min(MAX_CONCURRENCY, plan.total)}`,
      `headless    ${HEADLESS}`,
      "",
    ].join("\n"),
  );

  const failureDir = path.resolve(BOT_DIR, FAILURE_DIR);
  const startedAt = Date.now();
  const browser = await chromium.launch({ headless: HEADLESS });
  let outcomes: SessionOutcome[];
  try {
    outcomes = await runPool(browser, plan, failureDir);
  } finally {
    await browser.close();
  }

  printSummary(plan, outcomes, Date.now() - startedAt);

  const failed = outcomes.filter((outcome) => !outcome.ok).length;
  const failureRate = failed / plan.total;
  if (failureRate > MAX_FAILURE_RATE) {
    console.log(
      `\nfailure rate ${(failureRate * 100).toFixed(0)}% exceeds MAX_FAILURE_RATE ${(MAX_FAILURE_RATE * 100).toFixed(0)}% — exiting 1`,
    );
    return 1;
  }
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error(`usage bot could not run: ${firstLine(err)}`);
    console.error(fullError(err));
    process.exitCode = 1;
  });
