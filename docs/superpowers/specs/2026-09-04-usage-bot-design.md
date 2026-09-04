# Usage Bot — Design Spec

Date: 2026-09-04
Status: Approved

## Purpose

Generate realistic, behavioural usage data for this expense-tracker app so that
Pendo/Novus analytics features can be tested against data that looks like a real
product's traffic.

The bot must produce all four of these, because all four are being tested:

| Need | What it requires |
|---|---|
| Core usage metrics | Believable volume and a realistic hourly curve |
| Retention and cohorts | Stable visitor identities that return across days |
| Funnels and paths | Multi-step flows that are sometimes abandoned |
| Segments and accounts | Multiple accounts of differing size, region and tier |

## Non-goals

- Installing the Pendo snippet. Novus raises its own PR for that. The bot must
  work whether or not the snippet is present.
- Any server-side event API. Pendo's behavioural capture is browser-side only;
  a server job could only emit track events, which is not behavioural data.
- Load testing. This is data shaping, not performance work.
- Asserting app correctness. A failed action is logged, not a test failure.

## Constraints

| Constraint | Value |
|---|---|
| App architecture | React SPA, client-only, no backend |
| Storage | IndexedDB, database `expense-tracker`, version 2 |
| Session | `localStorage["expense_tracker_session"]` = `{userId, workspaceId}` |
| Hosting | Vercel static, SPA rewrite |
| Repo | Private GitHub repo `anirudha-pendo/expense-tracker-data-gen` |
| CI budget | ~2,000 free Actions minutes/month. Start conservative, tune later. |
| Cron precision | GitHub cron is UTC-only and may drift 5–30 minutes |
| Cron lifetime | Scheduled workflows auto-disable after 60 days without a commit |

## Architecture

Runtime is **GitHub Actions + Playwright**, driving the deployed app in headless
Chromium. Real DOM clicks on the real production bundle, so whatever analytics
agent is on the page sees genuine behaviour.

```
bot/
  package.json        playwright + tsx, isolated from the app's dependencies
  tsconfig.json
  config.ts           app URL, tunables, the 24-hour traffic curve
  personas.ts         accounts, personas, archetypes, deterministic seed data
  seed.ts             writes a persona into IndexedDB + localStorage
  actions.ts          the UI action library
  run.ts              entry point: session planning, concurrency pool, reporting
  selftest.ts         assert-based checks for the pure logic
  README.md
.github/workflows/usage-bot.yml
```

### The identity problem and its solution

A fresh headless browser has an empty IndexedDB. Without intervention every
session would be a brand-new visitor, so Pendo would show 100% new users and
zero retention.

**Solution: seed the database before driving the UI.** Before clicking anything,
the bot writes a persona's user, workspace, categories, transactions, budgets
and goals directly into IndexedDB, writes the session into localStorage, then
reloads. The app comes up logged in as a returning user with months of history.

Rejected alternatives:

- *Caching Chrome profiles between runs.* GitHub cache keys are write-once,
  evict after 7 days and cap at 10 GB. A persona silently losing its profile is
  indistinguishable from a churned user, so retention charts would lie.
- *Fresh signup every session.* No retention, no cohorts. Fails the requirement.

### One run, end to end

1. Workflow fires — cron, `workflow_dispatch`, or `repository_dispatch`.
2. `run.ts` reads the current UTC hour and day of week.
3. The traffic curve yields a session count per region.
4. Sessions are assigned: ~85% returning personas, ~15% brand-new visitors.
5. One Chromium launches. Each session gets its own `BrowserContext`, which has
   isolated cookies, localStorage and IndexedDB — one context is one visitor.
6. Each session seeds (or signs up), then performs a weighted random walk of UI
   actions with human-like pauses.
7. A summary table prints. Exit code is non-zero only if the failure rate
   exceeds the configured threshold.

Contexts run in a bounded pool. A GitHub runner has 2 cores and 7 GB RAM, so
more than ~6 concurrent contexts distorts timing and therefore distorts the
"time on page" numbers the bot exists to produce.

## Behaviour model

### Accounts

A fixed pool of workspaces. Each has an id, name, region, tier and a target
member count. Accounts exist so analytics can be sliced by account, so they must
differ meaningfully in size and activity.

### Personas

A fixed pool of visitors. Each persona has a **stable UUID** — this is what makes
retention work. Each belongs to one account, has one home region and one
archetype.

### Archetypes

An archetype is a behaviour profile, not a label. It controls:

| Property | Effect |
|---|---|
| `showUpRate` | Chance of appearing in an hour their region is active |
| `sessionLength` | Min and max number of actions per session |
| `actionWeights` | Relative preference for each action |
| `abandonRate` | Chance of opening a multi-step flow and quitting mid-way |
| `historyVolume` | How much seeded history the persona carries |

Required archetypes: `power`, `regular`, `casual`, `explorer`, `churning`.
`churning` has a low and declining `showUpRate`, which is what makes retention
curves bend instead of running flat.

### Determinism

Seed data is generated from a seeded PRNG keyed on the persona's id. The same
persona gets the same history on every run. This keeps account-size metadata
stable across runs and makes failures reproducible.

### Funnel drop-off

Multi-step flows (open dialog → fill → submit) are abandoned with probability
`abandonRate`: the bot opens the dialog, fills part of it, then closes it. This
is what produces genuine funnel drop-off rather than a 100% completion rate.

### Think time

Randomised pauses between actions, with longer "reading" pauses on the dashboard
and insights pages. Without these, every session lasts two seconds and every
engagement metric is wrong.

## Traffic shaping

Follow-the-sun across three regions: `IN`, `EU`, `US`. Each region has a
24-element array of activity weights indexed by UTC hour, peaking in its own
local working hours. Weekends are scaled down by a single multiplier.

Session count for a region in a given hour:

```
round(baseSessionsPerRun × regionCurve[region][utcHour] × weekendMultiplier)
```

Every input to that formula lives in `config.ts` as a named constant. Tuning the
bot must never require editing logic.

Cron entries are chosen to cover each region's peak. The count starts
conservative to fit the free minute budget and is raised by editing the workflow
once real usage is measured.

## Remote trigger

Three ways in, all on the same workflow:

| Method | Use |
|---|---|
| `workflow_dispatch` | Run button in the GitHub UI, or `gh workflow run` |
| `repository_dispatch` | `curl` with a PAT, callable from anywhere |
| `schedule` | The cron entries |

`workflow_dispatch` accepts optional inputs to override the session count and to
run in dry-run mode (plan the sessions and print them without launching a
browser).

A `concurrency` group prevents a manual run from stacking on top of a scheduled
one.

## Error handling

- Every session is wrapped individually. One failure never aborts the run.
- On failure the bot captures a screenshot and the page URL, saved to a
  directory the workflow uploads as an artifact.
- The run exits non-zero only when the failure rate exceeds
  `MAX_FAILURE_RATE`, so a couple of flaky sessions do not turn CI red.
- A hard per-session timeout stops a hung session from consuming the job.
- The job has a `timeout-minutes` ceiling as a final backstop.

## Testing

The bot has no framework and no fixtures. It has `bot/selftest.ts`: an
assert-based script covering the pure logic that can break silently.

Required coverage:

- The traffic curve produces zero sessions at a region's dead hours and peak
  sessions at its peak hours.
- Weekend scaling is applied.
- The seeded PRNG is deterministic: the same persona yields identical seed data
  across two calls.
- Persona and account references are consistent: every persona's `accountId`
  resolves to a real account.
- Every persona id is unique, and every id is a valid UUID.
- The session plan honours the new-visitor rate and the requested count.

`selftest.ts` runs in CI before the browser step, so a broken curve fails fast
and cheap.

## Documentation

`bot/README.md` covers: running locally against a dev server, the meaning of
each tunable, how to trigger remotely with `gh` and with `curl`, how to read the
run summary, and the two GitHub cron caveats (drift, and the 60-day auto-disable).
