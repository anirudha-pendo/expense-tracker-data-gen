# Usage Bot — Implementation Plan

Spec: `docs/superpowers/specs/2026-09-04-usage-bot-design.md`
Branch: `feat/usage-bot`

## Context

This repo is a React 19 + Vite SPA expense tracker with no backend. All data
lives in IndexedDB (`idb`). It is deployed to Vercel as a static SPA.

We are building a Playwright bot in a new top-level `bot/` directory. The bot
drives the real app through its real UI so that an analytics agent on the page
records genuine behaviour. It runs on GitHub Actions on a schedule and can also
be triggered remotely.

**A UI map of the whole app has already been written to
`.superpowers/sdd/ui-map.md`.** It records every interactive element, its label,
its attributes, the radix Select options, the dialog flows, the validation rules
and the per-route loading landmarks. Tasks that write selectors must read it
first rather than re-deriving it.

App facts implementers need:

| Fact | Value |
|---|---|
| IndexedDB name | `expense-tracker` |
| IndexedDB version | `2` |
| Object stores | `users`, `workspaces`, `transactions`, `categories`, `goals`, `budgets`, `attachments` — all `keyPath: "id"` |
| Session key | `localStorage["expense_tracker_session"]` → `{"userId": "...", "workspaceId": "..."}` |
| Password hashing | PBKDF2, SHA-256, 100,000 iterations, 256 bits, 16-byte salt, hex-encoded. See `src/lib/crypto.ts` |
| TypeScript types | `src/types/index.ts` — read it for exact field names |
| Routes | `/sign-in` `/sign-up` `/setup-workspace` `/` `/transactions` `/insights` `/goals` `/settings` |
| Dev server | `npm run dev` → `http://localhost:5173`. Dependencies are installed. |

## Global Constraints

These bind every task. A reviewer treats a violation as a defect.

1. **`bot/` has its own `package.json`.** Playwright and tsx must never appear in
   the app's root `package.json`. The app bundle stays untouched.
2. **No changes to `src/`.** The bot adapts to the app, never the reverse. If a
   selector is genuinely unreachable, report it rather than adding a
   `data-testid` to the app.
3. **Every tunable is a named exported constant in `bot/config.ts`.** No magic
   numbers anywhere else in `bot/`. Tuning must never require editing logic.
4. **All randomness goes through the seeded PRNG helper.** No bare `Math.random()`
   in `personas.ts` or in seed-data generation. Session-level jitter in
   `actions.ts` and `run.ts` may use the shared `rand` helpers, which must also
   be defined in one place.
5. **Real clicks only.** Navigation must click real links and buttons. Never use
   `history.pushState`, and never dispatch synthetic events, except inside the
   one-time IndexedDB seed. An analytics agent only sees real interactions.
6. **A failed session never aborts the run.** Every session is individually
   wrapped. Failures are counted and reported.
7. **No new tests.** The user has ruled that this is a throwaway test app and
   does not want test code written for it. `bot/selftest.ts` already exists from
   Tasks 1 and 2 and stays as-is — it is cheap, it already passes, and CI runs it
   before the browser step so a broken traffic curve fails in seconds instead of
   burning Actions minutes. **Do not add to it, and do not add any other test
   file, framework, or fixture.**
   This does NOT excuse the live verification runs. Tasks 3, 4 and 5 must still
   drive the real app against a running dev server and report what actually
   happened. That is not a test suite; it is the only proof the selectors work
   before CI runs headless.
8. **TypeScript, strict mode, no `any`.** Run `npx tsc --noEmit` inside `bot/`
   before reporting done.
9. **No secrets in the repo.** The app URL comes from an environment variable
   with a localhost default.

## Exact values

These are binding. Use them verbatim.

### `bot/config.ts` constants

```
APP_URL                 process.env.APP_URL ?? "http://localhost:5173"
HEADLESS                process.env.HEADLESS !== "false"
MAX_CONCURRENCY         6
BASE_SESSIONS_PER_RUN   8      // per region, before curve weighting
NEW_VISITOR_RATE        0.15
WEEKEND_MULTIPLIER      0.25
MAX_FAILURE_RATE        0.5    // exit non-zero above this
SESSION_TIMEOUT_MS      240000
THINK_MIN_MS            700
THINK_MAX_MS            3500
READ_PAUSE_MIN_MS       2500   // dashboard and insights linger
READ_PAUSE_MAX_MS       9000
FAILURE_DIR             "bot/failures"
```

### Region activity curves

Indexed by UTC hour, 0–23. Values are 0–1.

```
IN: 0.04 0.03 0.02 0.06 0.30 0.60 0.85 1.00 0.90 0.80 0.85 0.90
    0.75 0.55 0.45 0.50 0.45 0.30 0.18 0.12 0.09 0.07 0.06 0.05

EU: 0.04 0.03 0.02 0.02 0.03 0.06 0.15 0.45 0.80 0.95 1.00 0.85
    0.70 0.85 0.90 0.80 0.60 0.40 0.30 0.25 0.20 0.14 0.09 0.06

US: 0.30 0.22 0.15 0.09 0.06 0.04 0.03 0.02 0.03 0.05 0.08 0.15
    0.35 0.70 0.90 1.00 0.95 0.85 0.80 0.85 0.75 0.60 0.45 0.38
```

Sessions for a region in an hour:
`Math.round(BASE_SESSIONS_PER_RUN * curve[region][utcHour] * weekendFactor)`
where `weekendFactor` is `WEEKEND_MULTIPLIER` on Saturday and Sunday (UTC),
otherwise `1`.

### Archetypes

| Archetype | showUpRate | sessionLength | abandonRate | historyMonths | historyTx |
|---|---|---|---|---|---|
| `power` | 0.85 | 12–25 | 0.10 | 12 | 180 |
| `regular` | 0.55 | 6–14 | 0.18 | 8 | 90 |
| `casual` | 0.25 | 3–8 | 0.30 | 4 | 30 |
| `explorer` | 0.40 | 8–20 | 0.45 | 2 | 15 |
| `churning` | 0.08 | 2–5 | 0.55 | 10 | 60 |

### Pool sizes

- 12 accounts: 3 large (6–8 members), 4 medium (3–4 members), 5 small (1–2).
- 40 personas total, distributed across those accounts.
- Account tiers: `free`, `pro`, `enterprise`.
- Account regions: `IN`, `EU`, `US`.

### Cron schedule (UTC)

`0 3`, `0 6`, `0 8`, `0 10`, `0 13`, `0 15`, `0 18`, `0 21` — all `* * *`.

---

## Task 1 — Bot scaffold, config, traffic curve, selftest harness

Create `bot/package.json`, `bot/tsconfig.json`, `bot/config.ts`,
`bot/selftest.ts`, and add `bot/node_modules`, `bot/failures` and
`.superpowers` to the root `.gitignore`.

`bot/package.json`:
- `"type": "module"`, private, name `expense-tracker-usage-bot`
- deps: `playwright`
- devDeps: `tsx`, `typescript`, `@types/node`
- scripts: `"run": "tsx run.ts"`, `"selftest": "tsx selftest.ts"`,
  `"typecheck": "tsc --noEmit"`

`bot/tsconfig.json`: strict, `moduleResolution: "bundler"`, `target: "ES2022"`,
`noEmit`, `types: ["node"]`.

`bot/config.ts` must export:
- every constant from **Exact values → config.ts constants**, verbatim
- `REGIONS` as `["IN", "EU", "US"] as const` and a `Region` type
- `REGION_CURVE: Record<Region, number[]>` with the arrays above. Each array is
  exactly 24 entries.
- `sessionsForRegion(region: Region, date: Date): number` implementing the
  formula above using UTC getters.
- `sessionsForHour(date: Date): Record<Region, number>`.
- `mulberry32(seed: number): () => number` — the seeded PRNG.
- `hashString(s: string): number` — a stable 32-bit string hash for seeding.
- `makeRng(seed: string)` returning an object with `next()`, `int(min, max)`
  (inclusive), `pick<T>(arr: T[]): T`, `weighted<T>(items, weightFn): T`, and
  `chance(p: number): boolean`.

Note `WEEKEND_MULTIPLIER` uses `date.getUTCDay()`; `0` is Sunday and `6` is
Saturday.

`bot/selftest.ts` is the single assert-based check script. In this task it must
cover:
- every region curve has exactly 24 entries, all between 0 and 1 inclusive
- each region's peak hour is the expected one: `IN` at 07, `EU` at 10, `US` at 15
- `sessionsForRegion` returns 0 for `IN` at 02:00 UTC on a weekday
- `sessionsForRegion` at a region's peak weekday hour equals
  `BASE_SESSIONS_PER_RUN`
- a Saturday returns fewer sessions than the same hour on a weekday
- `makeRng("x")` produces an identical first ten numbers as a second
  `makeRng("x")`, and a different sequence from `makeRng("y")`
- `int(min, max)` never returns outside its bounds over 1,000 draws, and does
  return both `min` and `max` at least once

Print `selftest: N checks passed` and exit 0, or throw.

Verification: `npm install` inside `bot/`, then `npm run selftest` and
`npm run typecheck` both pass.

---

## Task 2 — Accounts, personas, archetypes, deterministic seed data

Create `bot/personas.ts`. Read `src/types/index.ts` first for exact field names
and shapes.

Export:
- `Archetype` type and `ARCHETYPES` record matching the table above exactly.
  Each archetype also carries `actionWeights: Record<string, number>`; use these
  behavioural axes: `power` favours adding transactions, insights, budgets and
  goals; `regular` is balanced around transactions and the dashboard; `casual`
  mostly views the dashboard with the occasional transaction; `explorer`
  navigates widely, opens settings and dialogs, and abandons often; `churning`
  glances at the dashboard and leaves.
- `Account` interface: `id`, `name`, `region`, `tier`, `size` (`small` |
  `medium` | `large`).
- `ACCOUNTS`: the 12 accounts described in **Pool sizes**.
- `Persona` interface: `id` (a stable UUID literal), `username`, `password`,
  `displayName`, `accountId`, `region`, `archetype`.
- `PERSONAS`: 40 personas. Every `id` is a hardcoded UUID v4 literal written out
  in the file — **not generated at runtime**, because retention depends on these
  never changing. Every persona shares the same password constant.
- `buildSeedData(persona: Persona): SeedData` where `SeedData` is
  `{ user, workspace, categories, transactions, budgets, goals }`, all typed
  against `src/types/index.ts` shapes but declared locally in `bot/` (do not
  import across the `bot/` and `src/` boundary — `bot/` has its own tsconfig).
  - All ids inside are derived deterministically from the persona id via
    `makeRng`, so repeated calls produce byte-identical output.
  - `user.passwordHash` and `user.salt` are left as empty strings here; Task 3
    fills them, because hashing is async and needs the browser's SubtleCrypto.
  - Transaction count and date spread come from the archetype's `historyTx` and
    `historyMonths`. Dates are spread across that window, weighted so recent
    months have more transactions than old ones.
  - Amounts and descriptions must be plausible for their category. A "Rent"
    expense is not 4 rupees.
  - Seed 6–10 categories per workspace, 2–4 budgets, 1–3 goals with
    contributions.

Extend `bot/selftest.ts` with:
- all 40 persona ids are unique and match a UUID v4 regex
- every `persona.accountId` resolves to an entry in `ACCOUNTS`
- every account has at least one persona, and large accounts have at least 6
- `buildSeedData` on the same persona twice yields deeply equal output
- `buildSeedData` on two different personas yields different user ids
- every transaction's `categoryId` resolves to one of the workspace's own
  categories, and every budget's `categoryId` does too
- transaction dates all fall inside the archetype's history window
- every archetype in the table is present in `ACTION_WEIGHTS`, and every weight
  is non-negative

Verification: `npm run selftest` and `npm run typecheck` pass.

---

## Task 3 — IndexedDB seeding and session bootstrap

Create `bot/seed.ts`.

Export `seedPersona(page: Page, persona: Persona): Promise<void>` which:
1. Navigates to `APP_URL` so the page has the right origin.
2. Builds the persona's seed data with `buildSeedData`.
3. Inside `page.evaluate`, hashes the persona password with PBKDF2 using the
   browser's `crypto.subtle`, matching `src/lib/crypto.ts` exactly: SHA-256,
   100,000 iterations, 256 derived bits, a 16-byte salt, hex encoding of both
   hash and salt. Verify the parameters by reading that file.
4. Inside `page.evaluate`, opens IndexedDB `expense-tracker` at version `2`,
   creating the object stores and indexes exactly as `src/lib/db/client.ts` does
   if the upgrade fires, and writes every seeded record.
5. Writes `localStorage["expense_tracker_session"]` as
   `{"userId": persona.id, "workspaceId": <workspace id>}`.
6. Reloads the page and waits for the dashboard landmark named in
   `.superpowers/sdd/ui-map.md`.

Also export `clearBrowserState(page: Page): Promise<void>` that deletes the
database and clears localStorage, for the new-visitor path.

The evaluate callback must be self-contained — it runs in the browser and cannot
close over Node imports. Pass everything it needs as a single serialisable
argument. `Blob` fields are not seeded, so all seeded records are structured
-cloneable.

**Verification is live, not theoretical.** Start `npm run dev` from the repo
root, write a throwaway script that launches Playwright with `HEADLESS=false`
off, seeds one `power` persona and one `casual` persona, and confirm by reading
the page that: the dashboard renders logged in as that persona, the transactions
page lists the seeded transactions, the insights page renders charts with data,
and the goals page shows the seeded goals. Report exactly what you observed.
Delete the throwaway script before committing.

---

## Task 4 — The UI action library

Create `bot/actions.ts`. **Read `.superpowers/sdd/ui-map.md` first** — it
already contains every selector, label, dialog flow and validation rule you need.

Define and export:

```ts
export interface SessionCtx {
  persona: Persona;
  rng: ReturnType<typeof makeRng>;
  abandonRate: number;
  log: (msg: string) => void;
}

export interface Action {
  name: string;
  weight: (ctx: SessionCtx) => number;   // 0 means not available right now
  run: (page: Page, ctx: SessionCtx) => Promise<void>;
}

export const ACTIONS: Action[];
```

Implement at least these actions. Names must match the keys used in
`ACTION_WEIGHTS` from Task 2.

Navigation: `navigateDashboard`, `navigateTransactions`, `navigateInsights`,
`navigateGoals`, `navigateSettings`.

Transactions: `addTransaction`, `editTransaction`, `deleteTransaction`,
`filterTransactions`, `clearFilters`.

Goals and budgets: `addGoal`, `contributeToGoal`, `addBudget`.

Settings: `updateProfile`, `updateWorkspace`, `addCategory`.

Other: `useQuickAdd` (the command palette), `readInsights` (a long pause on the
insights page, no clicking — this is what produces time-on-page data),
`signOut`.

Rules:
- Navigation clicks the real nav link and then waits for that route's landmark.
  An action whose page is already open returns weight 0 or navigates first.
- Every multi-step action checks `ctx.rng.chance(ctx.abandonRate)` after opening
  its dialog. If true, it fills only some fields, closes the dialog with Escape
  or the cancel button, logs `abandoned:<name>`, and returns without error. This
  is the funnel drop-off requirement and is not optional.
- `deleteTransaction` must handle the AlertDialog confirmation. Check the ui map
  for the exact confirm button text. Do not leave a dialog open.
- Inputs are react-hook-form controlled. Use Playwright's `fill()`. Never assign
  `.value`.
- Radix Selects need a click on the trigger, then a click on the option by its
  exact text. The ui map lists the available options per select.
- Generated input must satisfy the app's zod validation. The ui map lists the
  rules.
- Export a `think(page, ctx)` helper using `THINK_MIN_MS`/`THINK_MAX_MS` and a
  `readPause(page, ctx)` helper using the read-pause constants. Every action
  ends with a think pause.
- An action that cannot find its target throws. `run.ts` handles it.

Verification: start the dev server, write a throwaway script that seeds one
persona then executes **every** action in `ACTIONS` once in a sensible order,
with abandonment forced off, and then again with abandonment forced on. Report
which actions passed and which failed on each pass. Delete the throwaway script
before committing. Do not report DONE with any action unverified.

---

## Task 5 — The run orchestrator

Create `bot/run.ts`, the entry point.

Flow:
1. Read `now` (or `process.env.BOT_NOW` as an ISO string override, for testing).
2. `sessionsForHour(now)` gives a per-region count.
3. Build the session plan. For each region, for each of its N slots, pick a
   persona from that region weighted by `showUpRate`, without repeating a
   persona inside one run. With probability `NEW_VISITOR_RATE` the slot becomes
   a new-visitor session instead.
4. Honour `process.env.BOT_SESSIONS` as an absolute override of the total count,
   and `process.env.BOT_DRY_RUN === "true"` to print the plan and exit 0 without
   launching a browser.
5. Launch one Chromium. Run the plan through a concurrency pool bounded by
   `MAX_CONCURRENCY`. Do not use a third-party pool library; a small loop of
   workers pulling from a shared index is enough.
6. Each session: new `BrowserContext` with a randomised viewport and a plausible
   desktop user agent, one page.
   - Returning persona: `seedPersona`, then the action walk.
   - New visitor: `clearBrowserState`, then the sign-up and workspace-setup flow
     through the real UI, then a short action walk. Generate a fresh username
     each time so signup never collides.
   - Action walk: pick `sessionLength` from the archetype, then repeatedly
     weighted-pick an available action from `ACTIONS` and run it.
   - Wrap the whole session in `Promise.race` against `SESSION_TIMEOUT_MS`.
   - On any error: capture a screenshot to `FAILURE_DIR`, record the page URL
     and error message, continue.
   - Always close the context, even on failure.
7. Print a summary: total planned, succeeded, failed, actions performed,
   abandonments, wall-clock duration, and a per-region breakdown.
8. Exit 1 if `failed / total > MAX_FAILURE_RATE`, otherwise exit 0. A run with
   zero planned sessions is a success, not a failure.

**Do not add tests.** Still export the planning function separately from the
browser code — that separation is what makes `BOT_DRY_RUN` possible and keeps
`run.ts` readable, not a testing concern.

Verification, all against a running dev server, reported verbatim:
1. `npm run typecheck` passes.
2. `BOT_DRY_RUN=true BOT_NOW=<a known peak UTC timestamp> npm run run` — paste
   the printed plan. Confirm by eye: no persona appears twice, every persona
   sits in the region it was picked for, and the total matches what the traffic
   curve implies for that hour.
3. `BOT_DRY_RUN=true BOT_NOW=<a dead-hours UTC timestamp> npm run run` — confirm
   the plan is near-empty.
4. `BOT_DRY_RUN=true BOT_SESSIONS=25 npm run run` — confirm the override is
   honoured and the new-visitor slots are roughly `NEW_VISITOR_RATE` of the
   total.
5. `BOT_SESSIONS=4 npm run run` for real against the dev server — paste the
   summary output, including any failures.

---

## Task 6 — GitHub Actions workflow

Create `.github/workflows/usage-bot.yml`.

Triggers:
- `schedule` with the eight cron entries from **Exact values**. Add a comment
  next to each naming which region peak it covers.
- `workflow_dispatch` with inputs `sessions` (string, optional, maps to
  `BOT_SESSIONS`) and `dry_run` (boolean, default false, maps to
  `BOT_DRY_RUN`).
- `repository_dispatch` with `types: [run-usage-bot]`.

Job:
- `runs-on: ubuntu-latest`, `timeout-minutes: 20`
- `concurrency: { group: usage-bot, cancel-in-progress: false }` so a manual run
  never stacks on a scheduled one
- checkout; `actions/setup-node` v4 with Node 22 and npm cache keyed on
  `bot/package-lock.json`
- `npm ci` in `bot/`
- cache `~/.cache/ms-playwright` keyed on the Playwright version resolved from
  `bot/package-lock.json`
- `npx playwright install --with-deps chromium` — chromium only, never `all`
- run `npm run selftest` **before** the browser step, so broken logic fails in
  seconds instead of minutes
- run `npm run run` with `APP_URL: ${{ vars.APP_URL }}` and the dispatch inputs
  mapped to `BOT_SESSIONS` / `BOT_DRY_RUN`
- `actions/upload-artifact` v4 for `bot/failures/`, with `if: failure()` and
  `if-no-files-found: ignore`

Do not commit any secret. `APP_URL` is a repository variable, not a secret.

Verification: validate the YAML parses (`node -e` with a YAML parse, or
`actionlint` if available). State plainly that the workflow cannot be executed
locally and has not been run.

---

## Task 7 — Documentation

Create `bot/README.md`. Plain, simple English. Short sentences. Tables over
paragraphs. It must cover:

- What the bot is for, in three sentences.
- Running locally: start the dev server, `npm install` in `bot/`, then
  `BOT_SESSIONS=3 HEADLESS=false npm run run` to watch it work.
- A table of every environment variable and every `config.ts` tunable, with what
  each one does and a sensible range.
- How to trigger remotely, with copy-pasteable commands for both `gh workflow
  run` and `curl` against the `repository_dispatch` endpoint, using the real
  repo name `anirudha-pendo/expense-tracker-data-gen`.
- How to change the traffic shape, and how to raise volume once the Actions
  minute budget is known. Include the arithmetic: runs per day × minutes per run
  = monthly minutes, against a 2,000-minute free tier.
- The two GitHub cron caveats: drift of 5–30 minutes, and scheduled workflows
  auto-disabling after 60 days with no commits to the repo.
- How to read the run summary and where failure screenshots land.
- A short "how the seeding works and why" section, so the next reader
  understands why personas have hardcoded UUIDs and must not be regenerated.

Also add a short `## Usage bot` section to the root `README.md` pointing at
`bot/README.md`.

Verification: every command in the README has been run, or is explicitly marked
as not runnable locally.
