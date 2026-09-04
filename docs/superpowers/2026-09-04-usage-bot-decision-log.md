# SDD ledger — plan: docs/superpowers/plans/2026-09-04-usage-bot-plan.md

Spec: docs/superpowers/specs/2026-09-04-usage-bot-design.md
Branch: feat/usage-bot
UI map (shared input for tasks 3/4/5): docs/superpowers/ui-map.md

## Pre-flight scan

### Task pairs sharing a file or interface

| Pair | Producer → consumer | Found |
|---|---|---|
| T1 → T2 | `config.ts` exports `makeRng`, `hashString` → `personas.ts` seeds from them | OK |
| T1 → T3 | `config.ts` `APP_URL` → `seed.ts` | OK |
| T1 → T4 | `config.ts` `THINK_*`, `READ_PAUSE_*` → `actions.ts` helpers | OK |
| T1 → T5 | `config.ts` all tunables + `sessionsForHour` → `run.ts` | OK |
| T1 → T6 | T1's `npm install` produces `bot/package-lock.json`; T6 keys its npm and Playwright caches on it | **CONFLICT A** — lockfile must be committed by T1 or T6's cache keys break |
| T1/T2/T5 | All three write `bot/selftest.ts` | **RISK** — T2 and T5 must extend, never replace. Carried into both dispatches. |
| T2 → T3 | `Persona`, `buildSeedData`, `SeedData` with empty `passwordHash`/`salt` → filled in browser by T3 | OK, contract stated in plan |
| T2 → T4 | `ARCHETYPES[*].actionWeights` keys must equal `ACTIONS[*].name` | **CONFLICT B** — T2 writes the keys before T4 exists |
| T2 → T5 | `PERSONAS`, `ARCHETYPES` → planning and walk | OK |
| T3 → T5 | `seedPersona`, `clearBrowserState` → session bootstrap | OK |
| T4 → T5 | `ACTIONS`, `SessionCtx`, `think`, `readPause` → action walk | OK |
| T5 → T6 | `BOT_SESSIONS`, `BOT_DRY_RUN`, `APP_URL` env contract → workflow env mapping | OK |
| T5 → T6 | `FAILURE_DIR` output path → `upload-artifact` path `bot/failures/` | **CONFLICT C** — path resolution mismatch |
| T1 → T6 | T1 gitignores `bot/failures`; T6 uploads it as an artifact | OK — artifacts do not require git tracking |
| T7 | Only task touching root `README.md` | OK |

### Per-task internal consistency

| Task | Own text vs own text | Found |
|---|---|---|
| T1 | selftest asserts peak == `BASE_SESSIONS_PER_RUN`; peak weight is 1.00 and base is 8 → 8. Asserts `IN` at 02:00 is 0; 8 × 0.02 = 0.16 → rounds to 0. | Consistent |
| T2 | Archetype table matches spec table; pool sizes sum (3×7 + 4×3.5 + 5×1.5 ≈ 42) against a stated 40 personas | Consistent — 40 is reachable within the stated member ranges |
| T3 | Seeds then reloads and waits for the dashboard landmark, but an unauthenticated app first redirects to `/sign-in` | **RISK** — must wait for the post-session redirect, not the first paint. Noted in dispatch. |
| T4 | Lists `signOut` alongside actions that require being signed in | **CONFLICT D** — a mid-walk `signOut` breaks every later action |
| T5 | "zero planned sessions is a success" vs `failed / total > MAX_FAILURE_RATE`; 0/0 is `NaN` | Plan already states the zero case explicitly | 
| T6 | Caches keyed on a lockfile T1 must commit | Covered by Conflict A |
| T7 | Verification demands every command be run, but the workflow cannot run locally | Consistent — plan already allows marking it not runnable |

### Rulings

Ruling: T1 must commit `bot/package-lock.json` (run `npm install` in `bot/`, do not gitignore the lockfile) — T6's npm and Playwright cache keys resolve against it, and `npm ci` in CI fails outright without it — if wrong, CI caching silently misses and the job gets ~40s slower, no correctness impact.

Ruling: T2 must use exactly the action names listed in Task 4 of the plan as its `actionWeights` keys, and T4 must not rename or add actions without a matching weights entry; T2's selftest gains a cross-check once T4 lands — resolved this way because the plan's Task 4 list is the more concrete artifact and the spec does not name actions — if wrong, an unnamed action gets weight 0 and is silently never exercised, which the T4 verification pass would catch.

Ruling: `FAILURE_DIR` is `"failures"`, resolved at runtime against the `bot/` directory via `import.meta.url`, not the literal string `"bot/failures"` from the plan's constants table — `npm run run` executes with cwd `bot/`, so the plan's literal would write to `bot/bot/failures` and the workflow's `upload-artifact` path would find nothing — this overrides the plan's Exact Values entry — if wrong, failure screenshots land in the wrong folder and never reach the artifact.

Ruling: `signOut` is terminal — it may only be selected as the final action of a walk, and the walk ends immediately after it — the plan lists it among ordinary actions but every other action requires an authenticated session, so a mid-walk sign-out would fail the rest of the session and inflate the failure rate — if wrong, sign-out events are underrepresented in the analytics data relative to a real product.

Ruling: T3's post-seed wait targets the authenticated dashboard landmark **after** the app's session redirect settles, not the first navigation response — the app renders `/sign-in` before reading localStorage — if wrong, seeding appears to fail intermittently on slow CI runners.

## Progress

Task 1: dispatched (model sonnet, BASE ef20c27) — scaffold, config, traffic curve, selftest harness
Note: `scripts/task-brief` extracts only a task's own section, so the plan's shared "## Exact values" block was missing from every brief. Appended it to all 7 brief files and re-sent it to the running Task 1 agent.
UI map: Explore agent had no write tool; controller wrote `docs/superpowers/ui-map.md` from its returned content. Available for T3/T4/T5.
Task 1: implementer DONE (commit 46ff121, 7/7 selftest, tsc clean). Task reviewer dispatched (sonnet, ef20c27..46ff121).
Task 1: review clean — spec compliant, 0 Critical, 0 Important, 3 Minor.
Task 1: minor (deferred): tsconfig.json carries conventional fields beyond the brief's five (module/esModuleInterop/skipLibCheck etc.) — harmless.
Task 1: minor (deferred): selftest.ts duplicates the `{IN:7,EU:10,US:15}` peak map at two call sites.
Task 1: minor (deferred): bot devDeps resolve to typescript ^7.0.2 / @types/node ^26.4.1 while the app root pins typescript ~6.0.2 — isolated tsconfig so no interference, but a version skew worth a glance at final review.
Task 1: complete (commits ef20c27..46ff121, review clean)

Ruling: T2 seeds the app's own 12 default categories (expense: Food & Dining, Transport, Shopping, Entertainment, Health, Housing, Utilities, Other Expense; income: Salary, Freelance, Investment, Other Income, all `isDefault: true`) plus 0-3 custom ones, instead of the plan's "6-10 categories per workspace" — the app itself seeds exactly those 12 on workspace creation, so a seeded persona carrying a different set would look impossible and would break the Category Manager's disabled-delete behaviour on defaults — if wrong, seeded workspaces carry a couple more categories than a hand-made one would.
Task 2: dispatched (model sonnet, BASE 46ff121) — accounts, personas, archetypes, deterministic seed data

Ruling: user instructed mid-run "don't write tests, this is just a test app". Dropped all further test writing — Task 5's selftest additions are removed from the plan and no new test file, framework or fixture may be added. Kept the existing `bot/selftest.ts` from T1/T2 rather than deleting it: it already passes, cost nothing more, and CI runs it before the browser step so a broken traffic curve fails in seconds instead of burning Actions minutes. Kept the live verification runs in T3/T4/T5 — those are not tests, they are the only proof the selectors work before headless CI. Spec Testing section and plan Global Constraint 7 rewritten; task-5 brief regenerated — if wrong, there is slightly more scaffolding in the repo than the user wanted, deletable in one command.
Task 2: implementer DONE (commit bcdcfa2, 16 selftest checks, tsc clean) with 2 concerns; both ruled on and sent back before review.

Ruling: `buildSeedData` takes an explicit `now: Date` parameter instead of anchoring history to the constant 2026-09-04 — a fixed anchor means seeded history rots as real time passes (empty current month, no MoM data, zero budget progress), which is exactly the opposite of the active-product data this bot exists to produce; determinism is preserved because the same persona + same `now` still yields byte-identical output, and the parameter is deliberately not defaulted so no implicit `new Date()` can sneak back in — if wrong, callers must thread a date through, a small ergonomic cost.

Ruling: per-category amount tables and goal data move out of `config.ts` back into the persona/seed-data module — Global Constraint 3 exists so a tuner opens one small scannable file, and ~300 lines of grocery prices defeats that; price ranges are seed data, not knobs — if wrong, the amount tables sit one file further from the constants that shape them.
Task 2: fix round 1/5 (2 addressed, 0 open — `now: Date` param added non-defaulted; price tables moved to new bot/seed-data.ts, config.ts byte-identical to Task 1; commits bcdcfa2..1829930)
Task 2: task reviewer dispatched (sonnet, 46ff121..1829930)
Task 2: review — spec largely compliant; 1 Important (pickHistoryDate can stamp createdAt/updatedAt later than `now`), 4 Minor. Controller resolved the reviewer's 2 unverifiable items directly: all 12 DEFAULT_CATEGORY_SEEDS colors match src/lib/db/repositories/categories.repo.ts exactly — no gap.
Task 2: minor (deferred): selftest re-declares ~10 lines of local date math rather than exporting internals from personas.ts — deliberate, acceptable.
Task 2: minor (deferred): goal deadline reuses now's day-of-month for a future month, so day 29-31 can roll into the next month. Cosmetic.

Ruling: promoted two Minors into fix round 2 alongside the Important finding — (a) cap goal contributions at target, because a progress bar past 100% reads as a rendering bug in exactly the UI this data exists to populate; (b) derive budget monthlyLimit from expected monthly spend (avg amount x expected tx/month x a headroom constant, PRNG-varied per persona) instead of 5x the per-transaction average, because at 5x a low-frequency category like Housing gets a limit near 8250 against ~1650 of real spend and can never be exceeded, so the over-budget analytics path and its toast would never fire in any generated session. Budget-threshold analytics is a stated consumer of this data — if wrong, budgets sit closer to real spend than a real user would set them.
Task 2: fix round 2/5 (3 addressed, 0 open — clamp to now; contribution running-total trim; budget limit from expected monthly spend x BUDGET_HEADROOM_MIN/MAX; commits 1829930..98d427a). Re-review: all addressed, no new breakage, no probe files committed.
Task 2: complete (commits 46ff121..98d427a, review clean)
Task 3: dispatched (model sonnet, BASE 98d427a) — IndexedDB seeding and session bootstrap
Task 3: implementer DONE (commit 6e9001b, tsc clean). Live verification claimed: power + casual personas seeded, dashboard/transactions/insights/goals all populated (180 and 30 tx matching historyTx), real UI sign-in with plaintext password succeeded (confirms PBKDF2 match), clearBrowserState landed on /sign-in.
Task 3: two environment traps found, both MUST be carried into T4/T5 dispatches:
  (a) tsx forces esbuild `keepNames`, so any `page.evaluate` callback containing a NAMED function throws `ReferenceError: __name is not defined` in the browser. Affects every future page.evaluate.
  (b) `src/lib/db/client.ts` getDB() holds a connection that makes plain `indexedDB.deleteDatabase()` hang forever; worked around with CDP `Storage.clearDataForOrigin`. Chromium-only, which is fine — the bot is Chromium-only by design.
Task 3: task reviewer dispatched (sonnet, 98d427a..6e9001b), asked to judge both workarounds and to state a rule for T4/T5.
Task 3: review clean — spec compliant, 0 Critical, 0 Important, 2 Minor. Reviewer verified the DB schema field-by-field (all 7 stores, keyPaths, indexes incl. both unique flags), PBKDF2 params byte-for-byte, and the session key/shape, all against src/. Redirect-race wait implemented correctly (waits for the Dashboard h1 then the "Income" text, not the reload resolution).
Task 3: controller resolved the reviewer's one unverifiable item: `Income` renders as a standalone text node in summary-cards.tsx:65 and is the only exact-case "Income" on the dashboard (the trend-chart legend is lowercase "income"), so getByText("Income", {exact:true}) cannot hit a strict-mode violation. No gap.
Task 3: minor (deferred): bot/seed.ts:214 creates a CDP session and never detaches it.
Task 3: minor (deferred): clearBrowserState does not reload after wiping, so a loaded page keeps stale app state until the next navigation — callers must navigate.
Task 3: complete (commits 98d427a..6e9001b, review clean)

Ruling: adopt a central `__name` no-op polyfill via `page.addInitScript` instead of the per-callsite discipline Task 3 used. The reviewer reproduced the trap precisely — tsx hardcodes esbuild `keepNames` with no override (upstream escape hatch was rejected), and BOTH named function declarations AND const-bound arrows get wrapped in `__name(...)`, while object-literal methods, property-assigned anonymous functions and the inline top-level callback do not. Playwright ships only the callback body, never esbuild's module-scope `__name` helper, so the call resolves to nothing. A page-level no-op makes it harmless and kills the whole bug class. Chose this over comment discipline because the failure is runtime-only in a live browser — invisible to `tsc --noEmit` — and T4/T5 multiply the callsites — if wrong, one extra init script runs per page at negligible cost.
Task 4: dispatched (model opus, BASE 6e9001b) — the 19-action UI library, highest-risk task
Task 4: implementer DONE (commit a83c04e, bot/actions.ts 1149 lines + config.ts +90). Claims 19/19 actions pass both abandonment-off and abandonment-on across 4 PRNG seeds + 2 forced-branch variants (12 passes, 0 failures); __name polyfill proven both ways live; harness deleted; typecheck clean; selftest still 16/16.
Task 4: five implementer concerns to carry into T5 regardless of review outcome:
  (a) clearFilters no-ops and logs `skipped:` when no filter is active — T5 must not count that as an error.
  (b) addBudget and useQuickAdd signal success only via a toast — false pass possible on a repeat within ~4s, never a false failure.
  (c) toasts overlap the header at 1280x720; Playwright waits them out (up to ~4s stall). T5 should use a wider viewport.
  (d) editTransaction / deleteTransaction / contributeToGoal throw when there is nothing to act on — controller must rule throw vs skip.
  (e) Action.name typed as ActionName not string — correct, the compile-error rule wins over the brief's snippet.
Task 4: task reviewer dispatched (opus, 6e9001b..a83c04e), asked for a per-action abandonment/selector table and a view on concern (d).
Task 4: review Approved — spec compliant, all 19 actions individually verified for abandonment and selector correctness against ui-map.md, 0 Critical, 1 Important (error paths leak open overlays), 8 Minor.
Task 4: controller resolved all 4 reviewer WARN items directly, all clean: (1) goal-form.tsx:12 and category-manager.tsx:38 PRESET_COLORS are byte-identical to each other and to bot CATEGORY_PRESET_COLORS (same 10 hexes, order, lowercase); (2) profile-form.tsx:62 renders {user?.displayName} as a text node inside the <form> spanning 50-87; (3) app-nav.tsx:20 is a <nav> and :32 renders {workspace.name}; (4) seed name lengths all well inside zod limits - max goal 17/60, category 13/40, workspace template 18/50.
Task 4: reviewer adjudicated implementer concern (d) in the implementer's favour - keep throwing when there is genuinely nothing to act on; draining a 15-180 tx table inside a 2-25 action session with deleteTransaction weighted 2/~110 is effectively impossible, so a throw really does mean the seed failed and should turn CI red. Accepted, no change.
Task 4: minor (deferred): editTransaction rewrites amount from the 5-250 fallback range regardless of row type, flattening the seeded income distribution.
Task 4: minor (deferred): TRANSACTION_NOTE_POOL / CONTRIBUTION_NOTE_POOL live in actions.ts while every other content pool lives in seed-data.ts.
Task 4: minor (deferred): toDateOnly/recentMonth use toISOString (UTC), so in a timezone ahead of UTC in the early hours recentMonth can pick the previous month. Values stay valid; only shifts which month is filtered.
Task 4: minor (deferred): think() is hand-written at all 29 exits rather than wrapped in the registry - reviewer weighed the wrapper and advised against it on readability grounds.

Ruling: a failed action does NOT end the session - the walk continues, the failure is counted, and Task 5 calls a new `resetUiState(page)` in its catch block before the next action. Ending the session on first failure would truncate session lengths, and session length is itself analytics data the project is trying to make realistic; continuing without a reset would cascade bogus failures, worst of all for useQuickAdd, since the ui map records that both Ctrl+K and the header button refuse to open over an existing dialog, so one leaked palette poisons every later quick-add in that session. `resetUiState` must never throw, since it runs in a catch and a throw there would mask the original error - if wrong, a session that hits a mid-dialog failure carries slightly more residual UI state than a fresh page would.
Task 4: fix round 1/5 dispatched (resetUiState + 5 small fixes; 4 reviewer minors explicitly declined)

Ruling: user instructed "skip the per step reviews now, directly do a final review instead". No task reviewer or scoped re-reviewer is dispatched for Tasks 5, 6 or 7. The Task 4 re-review already in flight is allowed to land and its verdict is recorded, since it costs nothing further. All verification weight moves to the single whole-branch final review, which is dispatched on the most capable model and pointed at the full deferred-minor and parked list. Implementer live-verification requirements are UNCHANGED and become the only per-task correctness signal - if wrong, a defect in T5/T6/T7 reaches the final review instead of being caught one task earlier.
Task 5: dispatched (model opus, BASE a853977) - run orchestrator, no task review to follow
Task 4: fix round 1/5 (6 addressed, 0 open — resetUiState throw-proof across all 6 leak classes incl. closed page; exact-description toast match; xpath=.. Set button; reachable chip-less branch; log moved after wait; SWATCH_PRESET_COLORS rename clean in all 3 files; commits a83c04e..a853977). Re-review: all addressed, no new breakage, no probe files, new config entries are genuine tunables.
Task 4: complete (commits 6e9001b..a853977, review clean)
Task 4: minor (deferred, FOR FINAL REVIEW TO TRIAGE): re-reviewer would design fix 2 differently — replace `parsedDescription`/`QUICK_ADD_TYPE_KEYWORDS` (which mirror src/features/quick-add/lib/parser.ts:126-135's reserved-word stripping and can silently go stale) with a three-line edit to the description pool so runUseQuickAdd never feeds the parser a standalone `income`/`expense` token, leaving the toast assertion trivially `Added: ${description}`. Not reopened: the shipped fix is correct today and thoroughly verified (435-phrase probe vs the app's own parser, live 10/10, negative control). Purely a coupling-surface preference.
Task 5: implementer DONE_WITH_CONCERNS (commit 215e22f, bot/run.ts 833 lines + config.ts +109, seed-data.ts +58, actions.ts +1 export). Verified live: typecheck + 16/16 selftest; peak dry run 18 sessions matching the curve, no persona repeats, every persona in its own region; dead hours 1 weekday / 0 weekend (exit 0); BOT_SESSIONS=25 honoured, new-visitor share 15.28% over 360 slots vs NEW_VISITOR_RATE 0.15; live BOT_SESSIONS=4 all 4 succeeded, 28 actions, including a naturally-drawn real sign-up session; broken-app run produced 3 screenshots + sidecars in bot/failures/, printed the summary and exited 1; injected fault proved 15 action failures across 6 sessions with 0 session failures and quick-add still working after resetUiState.
Task 5: complete (commits a853977..215e22f, no task review per user instruction)

Ruling: accept Task 5 concern (4) — new-visitor sessions use a restricted action pool that excludes editTransaction / deleteTransaction / contributeToGoal. This is not a violation of Task 4's throw-on-empty ruling, it is consistent with it: that ruling reasoned that an empty table means the SEED failed and should turn CI red, but a brand-new signup has a legitimately empty workspace, so throwing there would be a false alarm — if wrong, new-visitor sessions exercise a narrower slice of the app than they could.
Ruling: accept Task 5 concern (3) — config.ts gains a type-only import from personas.ts so NEW_VISITOR_ACTIONS is compile-checked. Type-only imports are erased at build, so there is no runtime cycle, and compile-checking the action list is worth more than keeping config.ts import-free — if wrong, the two modules are textually coupled in a way a future reader might misread as a cycle.
Ruling: raise SESSION_TIMEOUT_MS from 240000 to 360000 (Task 5 concern 1). A 25-action power session at ~2s think plus ~3s per action plus readInsights dwells of 5-36s can plausibly exceed 240s on a slow shared CI runner; a session killed by its own timeout is counted as a failure and inflates the very ratio that turns CI red. 6 minutes still sits well inside the workflow's 20-minute job ceiling at MAX_CONCURRENCY 6 — if wrong, a genuinely hung session occupies a worker two minutes longer before being cut.
Ruling: give new-visitor sessions their own NEW_VISITOR_ABANDON_RATE constant, default 0.30, instead of borrowing explorer's 0.45 (Task 5 concern 2). At 0.45 applied per multi-step action, a short new-visitor walk compounds to almost no completed flows, which starves the signup-to-first-transaction funnel of the completions needed to make its drop-off readable — if wrong, new visitors complete somewhat more flows than a real first-time user would.
Task 6: dispatched (model sonnet, BASE 215e22f) — GitHub Actions workflow plus the two config rulings above
Task 6: complete (commit 5fcc6fd, no task review per user instruction). Workflow YAML validated by actionlint (exit 0) and js-yaml; cron/inputs/concurrency match the brief verbatim; typecheck, selftest and a BOT_DRY_RUN=true BOT_SESSIONS=6 run all pass after the two config edits. SESSION_TIMEOUT_MS raised to 360000 and NEW_VISITOR_ABANDON_RATE 0.30 added and wired.
Task 6: OPEN ACTION FOR THE USER: `vars.APP_URL` must be set as a repository variable before the workflow does anything useful. The workflow has never executed in GitHub Actions — the browser install and live run steps are not locally testable.
Docs: committed 9ea28e1 (spec + plan updated for the no-tests ruling); working tree clean.
Task 7: dispatched (model sonnet, BASE 9ea28e1) — documentation, last task
Task 7: complete (commit 3b3ab53, DONE_WITH_CONCERNS). Ran the documented local commands live (npm install, npx playwright install chromium, BOT_SESSIONS=3 HEADLESS=false npm run run) — 3/3 sessions succeeded. Remote triggers documented but not executed against the real repo.
Task 7: found 2 real code bugs while checking docs against source, both UNFIXED and routed to the final review's fix wave:
  (i) Failure screenshots are effectively unreachable — the workflow uploads bot/failures/ with `if: failure()`, but run.ts only exits non-zero above MAX_FAILURE_RATE (0.5), so an isolated 1-in-10 session failure writes a screenshot that is never uploaded. Contradicts the spec's error-handling intent.
  (ii) repository_dispatch cannot pass inputs — the workflow reads sessions/dry_run from github.event.inputs, which is empty for that event type, so the documented curl trigger silently ignores both and is not equivalent to `gh workflow run`.
ALL 7 TASKS COMPLETE. Branch 18d6b65..3b3ab53, 12 commits, 22 files, ~7200 insertions.
Final whole-branch review dispatched (opus, 18d6b65..3b3ab53) — pointed at the ledger, both known bugs, the unreviewed T5/T6/T7 surface, the integration seams, fitness-for-purpose against the four analytics consumers, and the deferred-minor triage.

FINAL REVIEW (opus, 18d6b65..3b3ab53, 7 passes): Merge readiness = Ready after listed fixes. All 10 integration seams pass with evidence. Compliance clean (no any, no Math.random, no magic numbers, no src/ changes, tsc clean, selftest 16/16).
Fitness for purpose against the spec's four consumers: core usage metrics WELL SERVED; funnels and paths WELL SERVED (best-realised part); retention and cohorts WEAK (flat curve); segments and accounts NOT SERVED.
Final review findings, all routed to ONE fix wave:
  C1 (Critical): the 12 ACCOUNTS never reach the browser. buildSeedData derives the workspace from the persona, so 40 personas produce 40 single-member workspaces; persona.accountId is only ever used in run.ts:168 and a dry-run table column. Kills the spec's fourth consumer outright.
  I2: showUpRate is applied as a relative weight inside a forced draw, not as a probability gate, and regional pools are too small to absorb it. Measured over 28 simulated days: churning active 10.0/28 days (36%) against a stated 8%; day-0 cohort retention flat at 85-91% for a month. No decay logic exists at all.
  I3: root package-lock.json (+853 lines) and yarn.lock carry macOS-ARM-for-Linux-x64 platform churn from a local npm install, though root package.json never changed. Can break the Vercel/Linux build.
  I4: config.ts uses `??` for APP_URL, but GitHub renders an unset vars.APP_URL as "", so the localhost fallback never fires and the bot drives "". README documents the opposite.
  I5: exit code keys only on session outcomes and runStep swallows action errors, so a run where every selector is broken exits 0 — silently, eight times a day.
  Known bug 1 -> Important: workflow uploads bot/failures/ with `if: failure()` but run.ts exits 0 below MAX_FAILURE_RATE, so isolated failures' screenshots are destroyed with the runner. Fix is `if: always()`.
  Known bug 2 -> Minor: repository_dispatch cannot read github.event.inputs; curl trigger silently ignores sessions/dry_run.
  Minors 6-12: main() runs at import time; dangling README section ref; no workflow permissions block; --with-deps runs apt-get on ~240 runs/month; signOut can be drawn at step 2 of 25 (contradicts the earlier session-length ruling).
Deferred-minor triage: all 12 ledgered minors plus the parked quick-add parser mirroring = SHIP AS-IS, none blocks merge.
Budget estimate from the review: ~1,000-1,300 minutes/month against the 2,000 free tier (89 sessions/weekday, 23/weekend day). Fix I2 cuts this a further 25-30%.
Fix wave dispatched (opus, 12 items, BASE 3b3ab53). One scoped re-review to follow. No second wave.

FIX WAVE RE-REVIEW (opus, 3b3ab53..42bf877): all 12 findings ADDRESSED, verified against code not report. Reviewer independently re-derived the account table (12 workspaces, members 7,7,6,4,3,3,3,2,2,1,1,1), traced referential integrity end-to-end (0 category-id collisions, 0 categoryId resolution failures, 0 cross-workspace children, 0 transactions predating workspace.createdAt), and confirmed determinism (all 40 payloads byte-identical across two builds). selftest.ts byte-identical to 3b3ab53, 16/16 passing. Merge readiness: Ready with residuals.

Ruling: accept the implementer's deviation on fix 2 — SHOW_UP_GATE_PERIOD is "day", not the per-run roll my fix text prescribed. The re-reviewer verified the arithmetic and found a worse consequence I had missed: per-run, power at 0.85 compounds to 1 - 0.15^8 = ~100%, so the whole 85/55/40/25/8 spread collapses to ~100/99.5/98/90/49 and the between-archetype heterogeneity a cohort chart is made of is destroyed. The day gate is genuinely stable (seed is `showup:<YYYY-MM-DD>:<persona.id>`, 0 of 4,000 persona-days disagreed across the 8 crons) and unbiased (observed rates within z=+-1.3 of stated over 2,000 days x 40 personas; serial correlation nil). My original instruction was wrong and the implementer was right to measure instead of comply — if wrong, a persona's activity is correlated within a UTC day, which is realistic rather than artificial.
Ruling: accept the 10.8% volume cut rather than the predicted 25-30%. Re-reviewer reproduced it independently (9.1% over 56 days) and explained it: six of the eight crons request 1-3 sessions per region against a gated pool averaging 5-6, so they are always fillable and the gate only bites at peak. The 25-30% figure was a peak-hour extrapolation. Days-active per archetype — the real measure — lands at 81/50/40/21/5% against stated 85/55/40/25/8. Budget estimate stays ~1,000-1,300 min/month, NOT revised down — if wrong, the monthly minutes run higher than a revised-down figure would suggest, still inside the 2,000 tier.
Ruling: accept BOT_SESSIONS becoming a ceiling rather than an exact count. The alternative (topping up shortfalls with new visitors) would push the new-visitor share up on exactly the busiest hours, and that split is itself analytics output — if wrong, a manual run with BOT_SESSIONS=25 can produce fewer than 25 sessions.
Ruling: retention decay is NOT a merge blocker and is recorded as the top post-merge follow-up. The curve now reads d0 100 / d1 53 / d28 52 — a real cliff at d1 (was 100->80) and a wide archetype spread (81% vs 5% days-active), so cohort and segment-sliced charts now carry signal, but the d1-d28 plateau at ~52% is structural: with fixed population and constant independent per-day probabilities, P(active d+n | active d) = E[p^2]/E[p], independent of n. It cannot move without a churning decay term, which was an observation in finding I2 and never a required fix. No real product retains half its d0 cohort at four weeks — if wrong, anyone reading the retention chart sees a step function and must be told decay is unimplemented.
Residuals routed to one text-only pass (sonnet, BASE 42bf877): BOT_SESSIONS still described as "absolute" at usage-bot.yml:24 (the GitHub UI form text) and run.ts:21; the all-gated-out log line at run.ts:892-897 does not print `requested`; config.ts:572-574 overstates plan-fewer as holding the mix "at" NEW_VISITOR_RATE (measured 17.2% peak vs 15% target); actions.ts:458 cites a non-existent TYPE_KEYWORDS symbol in src/.
Out-of-scope observations recorded, not acted on: workspace.createdAt stays persona-derived so members of one account write different creation dates for the same workspace id (documented in-place, nothing reads across contexts); new visitors are one-and-done and never return, so they contribute nothing to retention (pre-existing).
STANDING USER ACTION: the workflow has never executed in GitHub Actions and `vars.APP_URL` is unset. Fixes 6/7/10/11 are verified only by actionlint and YAML read-back. Fix 4 now makes the first real run fail loudly rather than confusingly.
