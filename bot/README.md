# Usage bot

## What this is

This is a Playwright robot that clicks around the expense-tracker app like a
real person. It runs in a real Chromium browser and drives the real UI — real
clicks, real page loads, real typing. Whatever analytics tool watches the app
(Pendo/Novus) sees this as genuine user behaviour, because that is exactly
what it is. It exists so the app has realistic usage data — daily traffic
patterns, returning users, funnels people abandon halfway — instead of an
empty dashboard.

## Running it on your machine

Do these in order.

1. Start the app's dev server, from the **repo root** (not from `bot/`):

   ```
   npm run dev
   ```

   This serves the app at `http://localhost:5173`. Leave it running.

2. In a second terminal, install the bot's own dependencies, from `bot/`:

   ```
   cd bot
   npm install
   ```

3. Install the Chromium browser Playwright drives:

   ```
   npx playwright install chromium
   ```

4. Run the bot, watching it work in a real browser window:

   ```
   BOT_SESSIONS=3 HEADLESS=false npm run run
   ```

   `BOT_SESSIONS=3` runs up to 3 sessions instead of however many the
   traffic curve would plan for the current hour (up to, because the show-up
   gate can leave a slot with nobody to fill it). `HEADLESS=false` opens a
   visible Chromium window per session instead of running invisibly.

All four steps above were run against a live dev server while writing this
doc, and completed with 3/3 sessions succeeding, 27 actions performed, 0
failures.

To just see what a run *would* do without opening a browser at all, use
`BOT_DRY_RUN=true` instead of `HEADLESS=false`. This prints the session plan
(who, which region, new visitor or returning) and exits — nothing gets
clicked.

## Environment variables

These control one run. Set them before `npm run run`.

| Variable | What it does | Default |
|---|---|---|
| `APP_URL` | The URL of the app to drive. | `http://localhost:5173` |
| `HEADLESS` | Set to the exact string `false` to see the browser. Any other value (including leaving it unset) keeps it headless. | headless (true) |
| `BOT_NOW` | An ISO timestamp. Overrides "now" for planning, so you can test what a specific hour/day would plan. Must parse as a valid date, or the bot exits with an error. | the real current time |
| `BOT_SESSIONS` | A whole number, 0 or more. Overrides the total session count for this run — normally the traffic curve decides that. Sessions are still split across `IN`/`EU`/`US` in the same proportions the curve gives that hour. It is a **ceiling, not an exact count**: the show-up gate (below) can leave a region with nobody available, and those slots go unplanned. | unset — use the traffic curve |
| `BOT_DRY_RUN` | Set to the exact string `true` to print the planned sessions and exit 0 without launching a browser. | unset — a real run |

Note: the GitHub Actions workflow only wires up `APP_URL`, `BOT_SESSIONS` and
`BOT_DRY_RUN`. `HEADLESS` and `BOT_NOW` are local debugging knobs — the
workflow never sets them, so scheduled/remote runs are always headless and
always use the real clock.

## `config.ts` tunables

Every number that shapes the bot's behaviour lives in `config.ts` as a named
constant — nothing is a magic number buried in the code. Grouped below by
what they affect.

### Traffic shaping — how many sessions, and when

| Constant | What turning it does | Sensible range |
|---|---|---|
| `BASE_SESSIONS_PER_RUN` (8) | The base session count per region, before the hourly curve scales it down. Raising this raises volume everywhere, proportionally. | 4–20. Above that, check the job still fits `timeout-minutes: 20` in the workflow. |
| `WEEKEND_MULTIPLIER` (0.25) | Fraction of weekday traffic kept on Saturday/Sunday (UTC). | 0.1–0.5. 1 would mean no weekend dip at all. |
| `NEW_VISITOR_RATE` (0.15) | Fraction of planned sessions that sign up as a brand-new visitor instead of returning as a seeded persona. | 0.05–0.3. Too high and retention charts get noisy; 0 kills the sign-up funnel entirely. |
| `REGION_CURVE` (`IN`/`EU`/`US`, 24 values each, 0–1) | The hour-by-hour shape of each region's traffic within a day. Not a single number — see `config.ts` for all 72 values. | Each value is a fraction of that region's peak (1.0 = busiest hour). Edit individual hours to reshape a region's day. |
| `SHOW_UP_GATE_PERIOD` (`"day"`) | How often a persona rolls its archetype's `showUpRate` — see "The show-up gate" below. | `"day"` or `"run"`. Keep `"day"` while the workflow fires 8 times a day. |
| `SHOW_UP_SHORTFALL` (`"plan-fewer"`) | What happens when a region's planned slots outnumber the personas who turned up. `"plan-fewer"` leaves the slot unrun; `"new-visitor"` fills it with a fresh sign-up instead. | `"plan-fewer"` keeps the new-vs-returning mix honest; `"new-visitor"` holds volume at the cost of skewing it. |

### Concurrency and limits

| Constant | What turning it does | Sensible range |
|---|---|---|
| `MAX_CONCURRENCY` (6) | How many browser contexts (sessions) run at once. | 2–6 on a standard GitHub-hosted runner (2 CPU, 7 GB RAM). Higher distorts timing, which distorts the "time on page" data the bot exists to produce. |
| `MAX_FAILURE_RATE` (0.5) | Above this fraction of failed *sessions*, the whole run exits non-zero (fails the CI job). | 0.2–0.6. Too low and a couple of flaky sessions turn CI red for no reason. |
| `MAX_ACTION_FAILURE_RATE` (0.3) | Above this fraction of failed *actions* (across the whole run), the run exits non-zero — even though every session "succeeded". This is the check that catches an app redesign that broke the selectors: without it the bot would report eight green, empty runs a day forever. A run that completes zero actions from a non-empty plan always exits 1, whatever this is set to. | 0.15–0.4. A healthy run measures 0. |
| `SIGN_OUT_MIN_WALK_FRACTION` (0.75) | How much of a walk must be behind it before `signOut` — which ends the session — can be drawn at all. At 0 a 25-step power session had a 36% chance of ending early, averaging 14.8 steps against a planned 18.6; at 0.75 that is 10% and 18.3. | 0–1. 0 restores the old behaviour; 1 allows sign-out only as the very last step. |
| `ROW_PICK_LIMIT` (12) | Edit/delete pick a transaction from the first this-many rows on screen, like a real user would. | 5–20. |
| `UI_RESET_MAX_ESCAPES` (5) | How many Escape presses the recovery code spends trying to close whatever a failed action left open. | 3–8. |
| `FILTER_COUNT_MIN` / `FILTER_COUNT_MAX` (1–2) | How many of the four transaction filters one `filterTransactions` action touches at once. | 1–4 (4 is every filter at once). |
| `FILTER_MONTH_LOOKBACK_MAX` (5) | The month filter picks a month up to this many months back. | 1–12. |

### Timing and think pauses

| Constant | What turning it does | Sensible range |
|---|---|---|
| `THINK_MIN_MS` / `THINK_MAX_MS` (700–3500) | The short pause after every single action — the "a person doesn't click instantly" delay. | 300–5000ms. Lower makes sessions faster but less human. |
| `READ_PAUSE_MIN_MS` / `READ_PAUSE_MAX_MS` (2500–9000) | The longer pause used when a persona is actually reading a screen (dashboard, insights). | 1000–15000ms. This is most of what makes "time on page" data realistic. |
| `INSIGHTS_DWELL_PAUSES_MIN` / `INSIGHTS_DWELL_PAUSES_MAX` (2–4) | How many read-pauses `readInsights` strings together — it exists purely to produce dwell time. | 1–6. |
| `INSIGHTS_SCROLL_PX_MIN` / `INSIGHTS_SCROLL_PX_MAX` (200–900) | How far the page scrolls during an insights dwell pause. | 100–2000. |
| `UI_RESET_SETTLE_MS` (400) | How long the recovery code waits between Escape presses for a closing dialog's animation to finish. | 200–800ms. |

### Probabilities (0–1, all "chance of X")

| Constant | What it's the chance of | Sensible range |
|---|---|---|
| `ABANDON_VIA_ESCAPE_RATE` (0.5) | An abandoned dialog closes via Escape rather than the Cancel button. | 0–1. |
| `TRANSACTION_NOTES_RATE` (0.25) | A new transaction gets an optional note. | 0–1. |
| `TRANSACTION_RECURRING_RATE` (0.12) | A new transaction is flagged recurring. | 0–1. |
| `EDIT_DESCRIPTION_RATE` (0.6) | Editing a transaction also rewrites its description (the amount always changes). | 0–1. |
| `CONTRIBUTION_NOTE_RATE` (0.4) | A goal contribution gets an optional note. | 0–1. |
| `WORKSPACE_CURRENCY_CHANGE_RATE` / `WORKSPACE_LOCALE_CHANGE_RATE` (0.25 each) | Updating workspace settings also changes the currency / number-format select. | 0–1. |
| `QUICK_ADD_SHORTCUT_RATE` (0.5) | The quick-add palette is opened with Ctrl+K rather than the header button. | 0–1. |
| `INSIGHTS_SCROLL_RATE` (0.7) | An insights dwell pause is preceded by a scroll. | 0–1. |
| `NEW_VISITOR_SHOW_PASSWORD_RATE` (0.35) | A signing-up visitor clicks "Show password". | 0–1. |
| `NEW_VISITOR_CURRENCY_CHANGE_RATE` / `NEW_VISITOR_LOCALE_CHANGE_RATE` (0.6 each) | Workspace setup changes the currency/locale away from its default. | 0–1. |
| `NEW_VISITOR_ABANDON_RATE` (0.3) | A new visitor bails out of a multi-step flow mid-way. Used instead of the borrowed `explorer` archetype's own 0.45 — see the code comment for why. | 0.1–0.5. |

### Timeouts (all in milliseconds)

| Constant | What it bounds | Sensible range |
|---|---|---|
| `SESSION_TIMEOUT_MS` (360000 = 6 min) | The whole session. A session that runs longer is killed and counted as a failure. | 120000–600000. Must stay well under the workflow's 20-minute job ceiling. |
| `SEED_LANDMARK_TIMEOUT_MS` (30000) | How long seeding waits for the dashboard to render after writing IndexedDB and reloading. | 10000–60000. |
| `NAV_LANDMARK_TIMEOUT_MS` (20000) | How long a page navigation waits for the destination route to actually render. | 5000–30000. |
| `DIALOG_TIMEOUT_MS` (15000) | How long a dialog gets to open, or to finish closing. | 5000–30000. |
| `TOAST_TIMEOUT_MS` (15000) | How long a success toast gets to appear after a save. | 5000–30000. |
| `QUICK_ADD_CHIPS_TIMEOUT_MS` (5000) | How long the quick-add palette gets to load its category chips. Shorter on purpose — a genuinely empty result should fail fast. | 2000–10000. |
| `SCREENSHOT_TIMEOUT_MS` (15000) | How long a failure screenshot gets to be taken. Short on purpose — a hung page is usually *why* the session is failing. | 5000–20000. |

There are a few more small pools not listed above (transaction backdating,
goal/budget amount ranges, browser viewport/user-agent lists, new-visitor
walk length). They follow the same "everything is a named constant in
`config.ts`" rule — read the file directly if you need one of those.

## The show-up gate

Not every persona turns up every day, and that is the whole point.

Each archetype carries a `showUpRate` — `power` 0.85, `regular` 0.55,
`explorer` 0.40, `casual` 0.25, `churning` 0.08. Before the planner fills a
region's slots, every persona in that region rolls that number **once**.
Only the ones who pass can be picked; the pick among them is then weighted by
the same rate, so a power user is still likelier to be the one who gets a
scarce slot.

Two details that matter:

- **The roll happens once per UTC day, not once per run.** The workflow fires
  eight times a day. A per-run roll compounds — a stated 8% becomes
  `1 - 0.92^8` = 49% of days — which is how a `churning` persona ended up
  active on 36% of days and the retention curve ran flat at 85-91% for a
  month. The roll is seeded on the persona's id plus the date, so all eight of
  a day's runs (eight separate processes, on eight separate runners, sharing
  no state) independently agree on who is around today.
- **A slot nobody can fill is not run.** See `SHOW_UP_SHORTFALL`. This is why
  `planned` in the run summary can sit below `requested`, and why
  `BOT_SESSIONS` is a ceiling.

Measured over 28 simulated days across the 8 real cron hours, the gate moves
days-active per archetype from 91/81/72/59/36% (power/regular/explorer/casual/
churning) to 83/49/31/20/4%, and the averaged cohort retention curve from a
near-flat ~78% to a genuine drop to ~52%. Total planned volume falls about
11%.

## Triggering it remotely

The workflow (`.github/workflows/usage-bot.yml`) accepts three kinds of
trigger: the cron schedule, `workflow_dispatch` (manual), and
`repository_dispatch` (an API call from anywhere).

### From the GitHub UI

Go to the repo's **Actions** tab → **Usage Bot** workflow → **Run workflow**
button. You can optionally set a session count and dry-run there.

### With the GitHub CLI (`gh`)

```
gh workflow run usage-bot.yml \
  --repo anirudha-pendo/expense-tracker-data-gen \
  -f sessions=5 \
  -f dry_run=false
```

Both `-f` flags are optional. Omit `sessions` to use the traffic curve, and
omit `dry_run` (or set it `true`) to control whether a browser actually
launches.

Needs: `gh auth login` as a user with write access to the repo (or a
`GH_TOKEN` environment variable set to a token with the same access).

### With `curl` (`repository_dispatch`)

```
curl -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/anirudha-pendo/expense-tracker-data-gen/dispatches \
  -d '{"event_type":"run-usage-bot"}'
```

`run-usage-bot` is the exact event type the workflow listens for
(`repository_dispatch: types: [run-usage-bot]`). Replace `<YOUR_TOKEN>` with
a real personal access token — never commit a real token to this repo.

Needs: a personal access token (classic) with the `repo` scope, or a
fine-grained token with `Contents: read and write` access to this repo,
belonging to a user with write access.

To set the same two knobs the Run workflow button offers, put them in
`client_payload` — `github.event.inputs` is empty for this event type, so the
workflow reads both places:

```
curl -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/anirudha-pendo/expense-tracker-data-gen/dispatches \
  -d '{"event_type":"run-usage-bot","client_payload":{"sessions":"5","dry_run":"true"}}'
```

Both `client_payload` keys are optional and both are strings. Omit
`sessions` to use the traffic curve; omit `dry_run` (or send `"false"`) to
launch a real browser.

## Required setup: `APP_URL`

The workflow does nothing sensible until `APP_URL` is set as a **repository
variable** (not a secret — it's a public URL, not something to hide).

What actually happens when it is not set: GitHub renders an unset
`${{ vars.APP_URL }}` as the **empty string**, not as "undefined". `config.ts`
therefore uses `||`, not `??`, so an empty value falls back to
`http://localhost:5173` — which does not exist on a GitHub-hosted runner, so
every session fails immediately. (With `??` the empty string would have been
accepted as-is and the bot would have driven an empty URL, which is worse and
much harder to diagnose.)

If `APP_URL` is set but malformed — a typo, a missing scheme, an `ftp://`
address — `run.ts` refuses to start at all, prints what is wrong and exits 1
in about a second, rather than producing one near-identical navigation error
per session.

Set it once:

```
gh variable set APP_URL --repo anirudha-pendo/expense-tracker-data-gen --body "https://your-deployed-app.example.com"
```

Or in the UI: repo → **Settings** → **Secrets and variables** → **Actions**
→ **Variables** tab → **New repository variable** → name it `APP_URL`.

## Changing the traffic shape, and raising volume

To reshape traffic, edit `config.ts`:

- `BASE_SESSIONS_PER_RUN` — scales every region's volume up or down together.
- `REGION_CURVE` — reshapes which hours are busy for a given region.
- `WEEKEND_MULTIPLIER` — how much weekends dip.
- `NEW_VISITOR_RATE` — the resulting mix of new sign-ups vs. returning users.
- `SHOW_UP_GATE_PERIOD` / `SHOW_UP_SHORTFALL` — how much of each hour's plan
  the show-up gate is allowed to drop (see "The show-up gate" above). This is
  the knob that trades volume against how sharply retention curves fall.

To change *how often* the whole plan runs, edit the `cron:` list in
`.github/workflows/usage-bot.yml` (currently 8 runs/day, one per
follow-the-sun peak).

### The minutes arithmetic

This repo is private, so GitHub Actions minutes are metered: **2,000 free
minutes/month**. The formula:

```
monthly minutes = (runs per day) x (minutes per run) x 30
```

The current schedule is 8 runs/day → 240 runs/month. That means the ceiling
on minutes per run, to stay inside the free tier, is:

```
2000 / 240 ≈ 8.3 minutes per run
```

We have not yet measured a real run's minutes in GitHub Actions — a local
run against a dev server (see "Running it on your machine" above) isn't
representative, because it skips checkout, `npm ci`, and (on a cache miss)
the Chromium download, and it hits `localhost` instead of a real deployed
URL over the network. To get the real number: after the workflow has run a
few times, open the repo's **Actions** tab, click a run, and read the job's
duration — or check **Settings → Billing → Usage** for total Actions
minutes used, divided by the number of runs.

Once you know that real number, two examples of what to do with it:

- **If a run takes ~6 minutes:** 8 × 6 × 30 = 1,440 minutes/month — under
  budget. You have room to add 2–3 more cron entries, or raise
  `BASE_SESSIONS_PER_RUN`.
- **If a run takes ~10 minutes:** 8 × 10 × 30 = 2,400 minutes/month — over
  budget. Remove a cron entry, or lower `BASE_SESSIONS_PER_RUN`, until the
  arithmetic fits.

Also watch the job's `timeout-minutes: 20` ceiling in the workflow — raising
`BASE_SESSIONS_PER_RUN` too far can make a single run too slow to finish
inside that window, independent of the monthly budget.

**Making the repo public removes the 2,000-minute cap entirely** — public
repos get free Actions minutes with no metered limit on standard runners.
That's a real lever if the free-tier budget becomes the binding constraint,
not just a "raise the numbers" one.

## Two GitHub cron caveats

Both of these are GitHub platform behaviour, not something this repo
controls:

1. **Schedules drift.** A `cron: "0 6 * * *"` entry does not fire at exactly
   06:00:00 UTC. GitHub queues scheduled workflows and runs them when a
   runner is free, which can be 5–30 minutes late. Don't rely on exact
   timing for anything downstream.
2. **Scheduled workflows auto-disable after 60 days of repo inactivity.** If
   nobody commits anything to this repository for 60 days, GitHub turns off
   the `schedule:` trigger automatically. `workflow_dispatch` and
   `repository_dispatch` keep working; only the cron stops firing. A commit
   of any kind resets the clock.

## Reading the run summary

Every run prints a summary to the job's log (the "Run usage bot" step's
output) — there is no separate GitHub "job summary" page, just this text in
the log:

```
=== usage bot — run summary ===
clock             <ISO timestamp> (UTC hour, weekday)
app               <APP_URL used>
requested         <slots the curve asked for> — IN <n>, EU <n>, US <n>
planned           <slots actually run> — IN <n>, EU <n>, US <n>
succeeded         <count>
failed            <count>
actions performed <count>
abandonments      <count>
skipped no-ops    <count>
action failures   <count>
duration          <wall clock time>

region  planned  ok  failed  new  actions  abandons  actionFails
------  -------  --  ------  ---  -------  --------  -----------
IN      ...
EU      ...
US      ...
```

`requested` is what the traffic curve (or `BOT_SESSIONS`) asked for.
`planned` is what survived the show-up gate — `planned` below `requested`
means fewer personas turned up that hour, which is the gate working, not a
fault.

If any session failed, a `failed sessions:` block follows, listing each
one's index, region, persona, the page URL it was on, the error's first
line, and the path to its screenshot (if one was captured).

### Where failure screenshots land

On the runner, a failed session writes a `.txt` note (session details, full
error, URL) and a `.png` screenshot into `bot/failures/`.

The workflow's **"Upload failure artifacts"** step uploads that whole
directory as an artifact named `usage-bot-failures-<run id>-<run attempt>`,
downloadable from the run's summary page in the Actions tab.

That step runs `if: always()`, deliberately. The "Run usage bot" step only
exits non-zero above `MAX_FAILURE_RATE` (50%), so an isolated 1-in-18 session
failure leaves the job green — and under `if: failure()` its screenshot would
have been thrown away with the runner, which is exactly the failure you would
most want to look at. `if-no-files-found: ignore` means a clean run uploads
nothing and costs nothing.

## When the run exits non-zero

Three separate conditions, any one of which turns the job red:

| Condition | Constant | What it means |
|---|---|---|
| Too many sessions threw | `MAX_FAILURE_RATE` (0.5) | Seeding, sign-up or the page itself is broken for most sessions. |
| Too many actions threw | `MAX_ACTION_FAILURE_RATE` (0.3) | Sessions complete, but the UI underneath them has moved — selectors no longer match. |
| A non-empty plan completed zero actions | — | The strongest form of the above: the bot ran and produced nothing. |

The last two exist because a session counts as successful whenever it does not
throw, and a failed *action* is deliberately swallowed so the walk can carry
on. Without them, an app redesign that broke every selector would produce
eight green, empty runs a day, indefinitely.

## How the seeding works, and why

**The problem:** a fresh headless browser starts with an empty database. If
every session just used the app normally, every single one would look like
a brand-new visitor — 100% new users, 0% retention, forever.

**The fix:** before a "returning" session clicks anything, `seed.ts` writes
that persona's entire history — user, workspace, categories, transactions,
budgets, goals — straight into the browser's IndexedDB, writes the matching
session into `localStorage`, then reloads the page. The app comes up already
signed in, as a user with months of history, without a single sign-up form
ever being touched.

**Why the persona IDs must never change:** each of the 40 personas in
`personas.ts` has a hardcoded UUID, written once and never regenerated. That
ID becomes the app's `User.id`, which becomes the analytics tool's visitor
ID. If a persona's ID changed between runs, the same "person" would show up
as a brand-new visitor every single time — silently destroying every
retention and cohort chart this bot exists to produce. This is the single
most important rule in this codebase: **never regenerate a persona's ID.**

**Personas share workspaces, because a workspace is an account.** The 12
entries in `ACCOUNTS` (3 sizes, 3 tiers, 3 regions, 1 to 7 members each) are
the accounts analytics slices by. `buildSeedData` derives the workspace id
from the persona's `accountId`, not from the persona, and takes the workspace
name and the currency/locale straight off the account — so all seven members
of "Bengaluru FinCollective" seed the same workspace id and see the same
workspace name in the nav, while their transactions, budgets, goals and
categories stay their own. Each member is in its own isolated browser context,
so nothing is shared at runtime; what is shared is the identity the analytics
tool groups them by.

**Not every session is seeded.** `NEW_VISITOR_RATE` (15%) of sessions
deliberately skip seeding and go through the real sign-up and
workspace-setup forms instead, as a genuinely new person. This exists so
new-visitor and onboarding-funnel data — sign-up completion, workspace
creation, first transaction — actually shows up in the analytics too,
instead of only ever seeing 40 people who have already been using the app
for months.

## Gotchas for future maintainers

Two environment traps live in this code. Both look like dead code if you
don't know why they're there. Do not remove either.

### 1. The `__name` polyfill in `preparePage()`

`tsx` (this directory's TypeScript runner) transpiles code through esbuild
with `keepNames` forced on. That rewrites every named function into a call
to a `__name` helper esbuild defines once at module scope.

`page.evaluate()` (used all over `actions.ts` and `seed.ts`) serialises its
callback with `.toString()` and ships only that function's own text into the
browser — the module-scope `__name` helper never travels with it. Any named
function inside such a callback then throws
`ReferenceError: __name is not defined` at runtime, and `tsc --noEmit` will
not catch it, because it type-checks fine.

`preparePage()` in `actions.ts` fixes this centrally: it installs a no-op
`window.__name` on every page before its first navigation. **Do not delete
it** — without it, every `page.evaluate` in the bot (seeding included)
breaks.

### 2. `clearBrowserState` uses CDP, not `indexedDB.deleteDatabase()`

The app's own `getDB()` caches a single IndexedDB connection, but nothing
stops several of the app's data-fetching hooks from racing to open their own
connection on first mount before that cache is set. Only the last one
survives in the cache — any earlier connection from that race is never
closed. `indexedDB.deleteDatabase()` waits indefinitely for *every* open
connection to close before it resolves (that's the IndexedDB spec, not a
bug) — which means it hangs forever in this app, verified live.

`clearBrowserState` (in `seed.ts`) works around this by clearing storage
through the Chrome DevTools Protocol (`Storage.clearDataForOrigin`) instead,
which acts below the page's JavaScript entirely and isn't affected by the
leaked connection.

This is also why the bot is Chromium-only — CDP sessions are a
Chromium-specific feature. That's a deliberate tradeoff, not an oversight:
losing Firefox/WebKit coverage buys a working `clearBrowserState` instead of
a hung one.
