# Pendo accounts, visitor email, and a bot-sync skill — design

Date: 2026-09-07

## Goal

Three things, in one change:

1. Send the signed-in user's email to Pendo as a visitor field.
2. Give Pendo an **account** — the grouping layer it needs before any
   account-level segment, report or guide targeting can exist. Today
   `pendo.identify` sends a visitor and nothing else.
3. Add a `bot-sync` skill so the usage bot stops drifting behind the app, and a
   repo `CLAUDE.md` rule that makes checking for that drift routine rather than
   remembered.

## Non-goals

- No new user-facing UI. No plan picker, no account settings screen.
- No schema change, no IndexedDB version bump.
- No new test framework. The bot's assert-based `selftest.ts` is the convention
  and the app has no test tooling at all; neither changes here.
- Exercising the sign-in form from the bot. Returning personas will keep using a
  seeded `localStorage` session, so the email sign-in path stays unexercised.
  Real gap, separate change.

## Decisions

### An account is a workspace

Rejected: a new `accounts` object store joined by email domain; and deriving an
account id from the email domain at identify time.

The workspace already **is** the account, and the bot already treats it that way.
`bot/personas.ts:814-829` derives `workspaceId`, name, currency and locale from a
PRNG keyed on `persona.accountId` rather than on the persona, so all seven members
of `acct-in-large-1` land on one shared workspace row. The comment there records
that keying it off the persona was a real bug: it "gave 40 personas 40
single-member workspaces and the 12 ACCOUNTS never reached the browser at all."

So the grouping is already built and already correct. It is invisible only because
the app never sends an account block. Sending `workspace` as the account turns 40
seeded visitors into 12 accounts with no change to how the bot seeds anything.

A brand-new visitor who signs up through the UI creates their own workspace on a
consumer email domain, and therefore becomes a single-visitor account. That is
accurate, not a defect: they genuinely are a solo account.

### The account block carries only what `Workspace` already holds

Rejected: adding `plan` and `size` fields to `Workspace` so the bot's `tier` and
`size` from `ACCOUNTS` could reach Pendo.

The cost is a schema change and a DB version bump for two fields no UI reads. The
consequence, accepted deliberately: Pendo can segment accounts by currency,
locale and creation date, but not by plan or company size, and the `tier` / `size`
columns on the bot's `ACCOUNTS` rows stay internal to the bot. If plan-level
segmentation is wanted later, adding it is additive — two optional fields, the
same pattern `email` already uses.

### One analytics module, not five inline literals

`pendo.identify` is called from three places today, each hand-rolling the same
visitor literal; this change adds two more call sites. Five copies of one object
drift. A single `src/lib/analytics.ts` owns the shape; call sites pass a `User`
and a `Workspace | null`.

## The contract

```
visitor: { id, full_name, username, email, avatarInitials, createdAt }
account: { id: workspace.id, name, currency, locale, createdAt }
```

`User.email` is optional — records created before email existed have none. Those
send `undefined`, which Pendo omits. No fallback string, no empty-string
placeholder: a missing email must read as missing.

The account block is present only when a workspace exists. Between sign-up and
workspace creation a user genuinely has no account, and inventing a placeholder
one would put a junk account into Pendo for every abandoned setup.

## Call sites

| Site | Today | After |
|---|---|---|
| `loadSession` — `src/features/auth/hooks/use-auth.ts:60` | identify fires before the workspace is read from IndexedDB (lines 70-73) | read the workspace first, then a single identify carrying visitor + account |
| `signUp` — `use-auth.ts:118` | visitor only | visitor only, now including email. No workspace exists yet, so no account |
| `signIn` — `use-auth.ts:145` | visitor only | visitor + account; the workspace is already resolved on line 143 |
| `WorkspaceSetupPage.handleSubmit` — `src/features/workspace/pages/workspace-setup-page.tsx` | `track("workspace_created")` only | additionally identify with the new account. This is the moment a fresh sign-up gains one |
| Settings workspace form — `src/features/settings/components/workspace-form.tsx:68` | `track("workspace_settings_updated")` only | additionally `pendo.updateOptions` so a rename or currency change updates the account already in flight |
| `signOut` — `use-auth.ts:163` | `pendo.clearSession()` | unchanged |

Reordering `loadSession` is the one behavioural change to existing code: identify
moves after the workspace read so the returning-user session — the bot's normal
path — reports its account on the first call rather than never.

### Guard style

`track` calls use `pendo?.track(...)`; `identify` calls use a bare `pendo.identify(...)`.
`src/lib/analytics.ts` standardises on `pendo?.`, so a page without the snippet
degrades instead of throwing.

`src/types/pendo.d.ts` declares a second, narrower ambient `pendo` (`track` only)
that `src/global.d.ts` supersedes. Delete it — it is ambient, imported by nothing,
and every member it declares exists on `PendoSDK`.

## Bot changes

The bot needs no new account plumbing, and this is worth stating plainly rather
than manufacturing work: it already shares one workspace per account, and
`updateProfile` and `updateWorkspace` are already in the action mix, so the two
new identify paths get exercised by the existing walk.

| File | Change |
|---|---|
| `bot/selftest.ts` | New check: every persona sharing an `accountId` derives the same workspace id, name, currency and locale. Makes the contract fail loudly instead of silently splitting 12 accounts back into 40 |
| `docs/superpowers/ui-map.md` | New section documenting the analytics contract: both blocks, and which of the six moments fires which call |
| `bot/README.md` | One pointer to that section |

## The `bot-sync` skill

Lives at `.claude/skills/bot-sync/SKILL.md`, mirrored byte-identical into
`.agents/skills/bot-sync/SKILL.md` — the convention `emil-design-eng` already
follows in this repo.

Invoked after app changes. Steps:

1. **Resolve the range.** Default: `<last commit touching bot/>..HEAD`, plus any
   uncommitted working-tree changes. An explicit range may be passed.
2. **Classify each changed app file** into the categories that can break or
   under-exercise the bot: routes and guards, form fields and selectors, Pendo
   events, data model, visible copy.
3. **Update `docs/superpowers/ui-map.md`** by reading the current component
   source. Never from the diff alone — the diff shows what moved, not what the
   selector now is.
4. **Update `bot/`** using the mapping table the skill carries: app area →
   the bot file that covers it.
5. **Check:** `cd bot && npm run typecheck && npm run selftest`.
6. **Verify:** `npm run dev`, then one real session —
   `APP_URL=http://localhost:5173 BOT_SESSIONS=1 npm run run` — proving the
   selectors still resolve against the running app.
7. **Report** what changed and what was deliberately skipped.

The mapping table is what keeps step 4 a lookup rather than a fresh
investigation each time:

| App area | Bot files |
|---|---|
| New or renamed route, changed guard | `bot/actions.ts` (`ROUTES`, `waitForRoute`), ui-map §1 |
| Auth or workspace-setup form fields | `bot/run.ts` new-visitor walk, ui-map §2 |
| New feature with its own dialog or form | `bot/actions.ts` (new `run*` action), `bot/personas.ts` (`ActionName`, `ACTION_WEIGHTS`), `bot/config.ts` (`NEW_VISITOR_ACTIONS`) |
| Data model change | `bot/personas.ts` (`buildSeedData`), `bot/seed.ts` (DB version + upgrade path) |
| Pendo events or identify contract | ui-map analytics section; usually no bot code change |
| Copy change on a landmark element | wherever that string is matched — `getByRole(... name)` is text-coupled |

## `CLAUDE.md`

The repo has none; only the user's global file. A repo-level `CLAUDE.md` gets
created carrying the standing rule: after changing the app, check whether `bot/`
has fallen behind and run `bot-sync` if it has. Repo-specific, so it belongs in
the repo.

## Testing

| Layer | What |
|---|---|
| `bot/selftest.ts` | The new account/workspace agreement check, alongside the existing ones |
| `npx tsc -p tsconfig.app.json --noEmit` | App types, including the analytics module |
| `npm run lint` | App lint |
| `cd bot && npm run typecheck` | Bot types |
| One bot session against `localhost:5173` | Proves identify fires with an account and the walk still completes |

## Risks

| Risk | Handling |
|---|---|
| Moving identify after the workspace read delays the visitor call slightly on session bootstrap | The delay is one IndexedDB read on a path that already awaits several. An identify that arrives 5ms later is worth an account that arrives at all |
| `updateOptions` on workspace rename could clobber visitor fields if called with a partial payload | The analytics module always builds both blocks from the same inputs, so there is no partial form to call |
| Deleting `src/types/pendo.d.ts` breaks a type nothing else provides | Verified: every member it declares exists on `PendoSDK` in `src/global.d.ts`; typecheck is the gate |
