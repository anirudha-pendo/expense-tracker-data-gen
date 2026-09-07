# Pendo Accounts, Visitor Email, and a Bot-Sync Skill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send the user's email and the workspace-as-account to Pendo on every identify, and add a `bot-sync` skill that keeps the usage bot from drifting behind the app.

**Architecture:** One new module, `src/lib/analytics.ts`, owns the Pendo payload shape; five call sites hand it a `User` and a `Workspace | null` instead of hand-rolling object literals. The account **is** the workspace — the bot already derives one shared workspace row per account, so no new grouping needs building. A `bot-sync` skill plus a repo `CLAUDE.md` rule make bot drift a routine check rather than a remembered one.

**Tech Stack:** React 19 + TypeScript, Vite, IndexedDB via `idb`, `react-hook-form` + `zod`, Playwright (bot), `tsx` (bot scripts). No test framework anywhere — the bot's assert-based `bot/selftest.ts` is the only runner and stays that way.

**Spec:** `docs/superpowers/specs/2026-09-07-pendo-account-and-bot-sync-design.md`

## Global Constraints

- **No schema change, no IndexedDB version bump.** `bot/seed.ts` stays at database version 3.
- **No new dependency, no new test framework.** Every check goes in `bot/selftest.ts`, run by `cd bot && npm run selftest`.
- **No new user-facing UI.** No plan picker, no account screen, no copy changes to existing forms — the bot matches on visible text and would break.
- **`User.email` is optional** (`src/types/index.ts:12`). Records created before email existed have none. A missing email must produce an **absent key**, never `email: undefined` and never `""`.
- **Guard style is `pendo?.`** — matches the existing `track` calls.
- **The account block is present only when a workspace exists.** No placeholder account between sign-up and workspace setup.
- **Account fields are exactly what `Workspace` already holds**: `id`, `name`, `currency`, `locale`, `createdAt`. No `plan`, no `size` — those were considered and rejected in the spec.
- **Skills are mirrored:** anything written to `.claude/skills/<name>/SKILL.md` is copied byte-identical to `.agents/skills/<name>/SKILL.md`, the convention `emil-design-eng` already follows.
- **Commit after every task.** Branch is `feat/pendo-account-and-bot-sync`, already created and already carrying the spec commit.

---

### Task 1: The analytics payload and its check

**Files:**
- Create: `src/lib/analytics.ts`
- Delete: `src/types/pendo.d.ts`
- Modify: `bot/tsconfig.json`
- Test: `bot/selftest.ts` (append)

**Interfaces:**
- Consumes: `User` and `Workspace` from `src/types/index.ts`; the ambient `PendoOptions` / `PendoSDK` from `src/global.d.ts`.
- Produces:
  - `buildIdentifyOptions(user: User, workspace: Workspace | null): PendoOptions` — pure, returns the payload.
  - `identify(user: User, workspace: Workspace | null): void` — calls `pendo?.identify`.
  - `updateOptions(user: User, workspace: Workspace | null): void` — calls `pendo?.updateOptions`.

  Tasks 2 and 3 import `identify` and `updateOptions` from `@/lib/analytics`.

- [ ] **Step 1: Wire the bot's typechecker to see the app module**

The check lives in `bot/selftest.ts` because it is the repo's only test runner. That means the bot's `tsc` has to resolve the app's `@/*` alias and see the ambient `pendo` declaration. Replace the whole of `bot/tsconfig.json` with:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "types": ["node"],
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["../src/*"]
    }
  },
  "include": ["**/*.ts", "../src/global.d.ts"],
  "exclude": ["node_modules"]
}
```

`baseUrl` + `paths` let `bot/selftest.ts` import `../src/lib/analytics`, whose own `import type { User, Workspace } from "@/types"` then resolves. `../src/global.d.ts` puts the ambient `pendo` in the bot's program so `analytics.ts` typechecks there too. The `import type` is erased at runtime, so `tsx` never has to resolve the alias.

- [ ] **Step 2: Write the failing check**

Append to `bot/selftest.ts`, immediately **before** the `// --- Summary ---` block at the bottom:

```ts
// --- Analytics payload -------------------------------------------------------

check("buildIdentifyOptions carries the visitor's email and the workspace as the account", () => {
  const { user, workspace } = buildSeedData(PERSONAS[0], TEST_NOW);
  const options = buildIdentifyOptions(user, workspace);

  assert.strictEqual(options.visitor.id, user.id);
  assert.strictEqual(options.visitor.email, user.email);
  assert.strictEqual(options.visitor.username, user.username);
  assert.strictEqual(options.visitor.full_name, user.displayName);

  assert.ok(options.account, "a user with a workspace must send an account");
  assert.strictEqual(options.account.id, workspace.id);
  assert.strictEqual(options.account.name, workspace.name);
  assert.strictEqual(options.account.currency, workspace.currency);
  assert.strictEqual(options.account.locale, workspace.locale);
  assert.strictEqual(options.account.createdAt, workspace.createdAt);
});

check("buildIdentifyOptions omits the account entirely when there is no workspace", () => {
  const { user } = buildSeedData(PERSONAS[0], TEST_NOW);
  const options = buildIdentifyOptions(user, null);
  assert.ok(
    !("account" in options),
    "between sign-up and workspace setup there is no account — the key must be absent, not empty",
  );
});

check("buildIdentifyOptions omits the email key for a user that has none", () => {
  const { user, workspace } = buildSeedData(PERSONAS[0], TEST_NOW);
  const options = buildIdentifyOptions({ ...user, email: undefined }, workspace);
  assert.ok(
    !("email" in options.visitor),
    "an absent email must not become `email: undefined` — Pendo would store the key and the visitor would read as having a blank email",
  );
});
```

Add the import at the top of `bot/selftest.ts`, after the existing `./personas` import block:

```ts
import { buildIdentifyOptions } from "../src/lib/analytics";
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `cd bot && npm run selftest`
Expected: FAIL — `Cannot find module '../src/lib/analytics'`.

- [ ] **Step 4: Write the module**

Create `src/lib/analytics.ts`:

```ts
import type { User, Workspace } from "@/types";

/**
 * The one place the Pendo payload is built.
 *
 * Five call sites need this object. Five hand-rolled copies of it is five
 * chances for one field to go missing from one of them, and a field missing
 * from one call site is a segment that quietly under-counts — nothing throws,
 * nothing fails a build, the numbers are just wrong.
 */
export function buildIdentifyOptions(user: User, workspace: Workspace | null): PendoOptions {
  const options: PendoOptions = {
    visitor: {
      id: user.id,
      full_name: user.displayName,
      username: user.username,
      avatarInitials: user.avatarInitials,
      createdAt: user.createdAt,
    },
  };

  // Set only when there is one, rather than always. Accounts created before
  // email existed have none, and `email: undefined` is not the same as an
  // absent key: Pendo stores the key and the visitor then reads as "has an
  // email, and it is blank" instead of "predates emails".
  if (user.email) {
    options.visitor.email = user.email;
  }

  // No workspace means no account yet. Between sign-up and workspace setup a
  // user genuinely belongs to nothing, and a placeholder account here would
  // put one junk row into Pendo for every abandoned setup.
  if (workspace) {
    options.account = {
      id: workspace.id,
      name: workspace.name,
      currency: workspace.currency,
      locale: workspace.locale,
      createdAt: workspace.createdAt,
    };
  }

  return options;
}

/** Identify the visitor, and the account when the user has a workspace. */
export function identify(user: User, workspace: Workspace | null): void {
  pendo?.identify(buildIdentifyOptions(user, workspace));
}

/**
 * Refresh visitor and account metadata mid-session, without restarting the
 * session the way `identify` does. Used when a workspace is renamed or its
 * money settings change — the account is already in flight and only its
 * fields moved.
 */
export function updateOptions(user: User, workspace: Workspace | null): void {
  pendo?.updateOptions(buildIdentifyOptions(user, workspace));
}
```

- [ ] **Step 5: Run the check again**

Run: `cd bot && npm run selftest`
Expected: PASS — the summary line reports 3 more checks than before.

- [ ] **Step 6: Delete the superseded ambient declaration**

`src/types/pendo.d.ts` declares a second, narrower ambient `pendo` carrying only `track`. `src/global.d.ts` declares the full `PendoSDK` and supersedes it. The file is ambient and imported by nothing.

```bash
git rm src/types/pendo.d.ts
```

- [ ] **Step 7: Typecheck both projects**

Run: `npx tsc -p tsconfig.app.json --noEmit && cd bot && npm run typecheck`
Expected: both clean, no output.

If the bot typecheck reports that `Blob` is not defined (it comes from `Attachment` in `src/types/index.ts`, now pulled into the bot's program), add `"lib": ["ES2022", "DOM"]` to `bot/tsconfig.json`'s `compilerOptions` and re-run. Do not change `src/types/index.ts` to work around it.

- [ ] **Step 8: Commit**

```bash
git add src/lib/analytics.ts bot/tsconfig.json bot/selftest.ts
git commit -m "Add one module that owns the Pendo identify payload

Email rides on the visitor and the workspace rides as the account. Both are
conditional: an absent email must be an absent key rather than an explicit
undefined, and a user between sign-up and workspace setup has no account to
send. Deletes src/types/pendo.d.ts, a narrower ambient declaration that
src/global.d.ts already supersedes."
```

---

### Task 2: Wire the three `useAuth` call sites

**Files:**
- Modify: `src/features/auth/hooks/use-auth.ts:60-68` (loadSession), `:118-126` (signUp), `:145-153` (signIn), `:163` (signOut)

**Interfaces:**
- Consumes: `identify` from `@/lib/analytics` (Task 1).
- Produces: nothing new. `useAuth`'s exported shape is unchanged.

- [ ] **Step 1: Add the import**

At the top of `src/features/auth/hooks/use-auth.ts`, after the existing `@/lib/...` imports:

```ts
import { identify } from "@/lib/analytics";
```

- [ ] **Step 2: Reorder `loadSession` so the account exists before identify fires**

Replace lines 59-73 — the `setUser(storedUser)` call, the inline `pendo.identify({...})` block, and the `if (session.workspaceId)` block that follows it — with:

```ts
      setUser(storedUser);

      let storedWorkspace: Workspace | undefined;
      if (session.workspaceId) {
        storedWorkspace = await db.get("workspaces", session.workspaceId);
        if (storedWorkspace) setWorkspace(storedWorkspace);
      }

      // After the workspace read, not before it. This is the returning-user
      // path and it is the common one — identifying first reported every
      // returning visitor as account-less for the whole of their session,
      // because nothing identified them again once the workspace arrived.
      identify(storedUser, storedWorkspace ?? null);
```

`Workspace` is already imported as a type on line 7. Leave the surrounding `try` / `catch` / `finally` exactly as they are.

- [ ] **Step 3: Replace the `signUp` identify**

Replace the `pendo.identify({ visitor: {...} });` block after `setUser(newUser)` with:

```ts
    // No workspace yet — /setup-workspace is the next screen, and the account
    // is attached there.
    identify(newUser, null);
```

- [ ] **Step 4: Replace the `signIn` identify**

Replace the `pendo.identify({ visitor: {...} });` block after `setWorkspace(activeWorkspace)` with:

```ts
    identify(storedUser, activeWorkspace);
```

`activeWorkspace` is already resolved two lines above as `workspaces[0] ?? null`.

- [ ] **Step 5: Make `signOut`'s guard match the rest**

Change line 163 from `pendo.clearSession();` to:

```ts
    pendo?.clearSession();
```

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc -p tsconfig.app.json --noEmit && npm run lint`
Expected: both clean. `noUnusedLocals` is on, so a leftover unused import fails here.

- [ ] **Step 7: Commit**

```bash
git add src/features/auth/hooks/use-auth.ts
git commit -m "Identify through the analytics module, with the account when there is one

loadSession now identifies after the workspace read rather than before it.
That path is how every returning user arrives, and identifying first meant
the account never reached Pendo for the rest of the session."
```

---

### Task 3: Attach the account at workspace creation and keep it fresh on rename

**Files:**
- Modify: `src/features/workspace/pages/workspace-setup-page.tsx`
- Modify: `src/features/settings/components/workspace-form.tsx:44,64-72`

**Interfaces:**
- Consumes: `identify` and `updateOptions` from `@/lib/analytics` (Task 1); `useAuthContext()` which returns the full `useAuth` shape, including `user`.
- Produces: nothing new.

- [ ] **Step 1: Identify with the new account at workspace setup**

In `src/features/workspace/pages/workspace-setup-page.tsx`, add the import after the existing `@/lib/db/...` imports:

```ts
import { identify } from "@/lib/analytics";
```

Then, inside `handleSubmit`, insert one line between `setActiveWorkspace(workspace)` and the `pendo?.track("workspace_created", ...)` call:

```ts
      setActiveWorkspace(workspace);
      // The moment a fresh sign-up gains an account. `signUp` identified this
      // visitor without one, because at that point there was none.
      identify(user, workspace);
      pendo?.track("workspace_created", {
```

`user` is non-null here — `handleSubmit` returns early on `if (!user) return;`.

- [ ] **Step 2: Refresh the account when workspace settings change**

In `src/features/settings/components/workspace-form.tsx`, add the import after the `@/lib/db/...` import:

```ts
import { updateOptions } from "@/lib/analytics";
```

Change line 44 to pull `user` out of the context as well:

```ts
  const { user, workspace, setActiveWorkspace } = useAuthContext();
```

Then in `onSubmit`, insert between `setActiveWorkspace(updated)` and the `pendo?.track(...)` call:

```ts
      setActiveWorkspace(updated);
      // `updateOptions`, not `identify`: the account is already in flight and
      // only its name or money settings moved. Identifying again would start
      // a fresh session on a rename.
      if (user) updateOptions(user, updated);
      pendo?.track("workspace_settings_updated", {
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc -p tsconfig.app.json --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/features/workspace/pages/workspace-setup-page.tsx src/features/settings/components/workspace-form.tsx
git commit -m "Attach the account at workspace creation, refresh it on rename

Workspace setup is where a fresh sign-up first has an account to send. A
rename uses updateOptions rather than identify, so changing a workspace name
does not start a new Pendo session."
```

---

### Task 4: Make the account/workspace contract fail loudly

**Files:**
- Test: `bot/selftest.ts` (append)

**Interfaces:**
- Consumes: `PERSONAS`, `ACCOUNTS`, `buildSeedData`, `SeedData` from `./personas`; the existing `check` helper and `TEST_NOW` constant already in the file.
- Produces: nothing.

Context for whoever runs this task: `bot/personas.ts:814-829` derives `workspaceId` from `makeRng(persona.accountId)` rather than `makeRng(persona.id)`, so every member of an account lands on one shared workspace row. That is the whole reason 40 visitors group into 12 Pendo accounts. The comment there records that keying it off the persona was a real bug that "gave 40 personas 40 single-member workspaces and the 12 ACCOUNTS never reached the browser at all." Nothing currently stops that regressing.

- [ ] **Step 1: Write the failing check**

First confirm it can fail. Temporarily change `bot/personas.ts:825` from `makeRng(persona.accountId)` to `makeRng(persona.id)` — this is the regression the check exists to catch, and it gets reverted in step 3.

Append to `bot/selftest.ts`, in the `// --- Personas, accounts and archetypes ---` region, after the `"buildSeedData on two different personas yields different user ids"` check:

```ts
check("every persona in an account derives the same workspace id, name, currency and locale", () => {
  const firstByAccount = new Map<string, SeedData["workspace"]>();
  const nameById = new Map(ACCOUNTS.map((account) => [account.id, account.name]));

  for (const persona of PERSONAS) {
    const { workspace } = buildSeedData(persona, TEST_NOW);
    assert.strictEqual(
      workspace.name,
      nameById.get(persona.accountId),
      `${persona.username}'s workspace is named "${workspace.name}", not after its account`,
    );

    const first = firstByAccount.get(persona.accountId);
    if (!first) {
      firstByAccount.set(persona.accountId, workspace);
      continue;
    }
    // The workspace IS the Pendo account. Members drifting apart here does not
    // throw anywhere — it just silently splits one account into several, and
    // the only symptom is an account count that is quietly too high.
    assert.strictEqual(workspace.id, first.id, `${persona.username} is in ${persona.accountId} but derives workspace ${workspace.id}, not ${first.id}`);
    assert.strictEqual(workspace.currency, first.currency, `${persona.username} disagrees with its account on currency`);
    assert.strictEqual(workspace.locale, first.locale, `${persona.username} disagrees with its account on locale`);
  }

  assert.strictEqual(
    firstByAccount.size,
    ACCOUNTS.length,
    `expected ${ACCOUNTS.length} distinct workspaces, one per account, got ${firstByAccount.size}`,
  );
});
```

Add `type SeedData` to the existing `./personas` import list at the top of the file:

```ts
import {
  ARCHETYPES,
  ACTION_WEIGHTS,
  ACCOUNTS,
  PERSONAS,
  buildSeedData,
  type Archetype,
  type SeedData,
} from "./personas";
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd bot && npm run selftest`
Expected: FAIL — the second member of the first multi-member account derives a different workspace id.

- [ ] **Step 3: Revert the sabotage**

Change `bot/personas.ts:825` back to `makeRng(persona.accountId)`.

Run: `git diff bot/personas.ts`
Expected: empty. If it is not empty, the revert was incomplete — fix it before continuing.

- [ ] **Step 4: Run the check again**

Run: `cd bot && npm run selftest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bot/selftest.ts
git commit -m "Check that an account's members share one workspace

The workspace is the Pendo account, so members drifting apart silently splits
one account into several. Nothing threw when this regressed before; the only
symptom was an account count quietly too high."
```

---

### Task 5: Document the analytics contract where the bot's maintainers read

**Files:**
- Modify: `docs/superpowers/ui-map.md` (new section between `## 10.` and `## Navigation`)
- Modify: `bot/README.md` (one line at the end of `## What this is`)

**Interfaces:** none — documentation only.

- [ ] **Step 1: Add the analytics section to the UI map**

Insert into `docs/superpowers/ui-map.md`, after the end of section `## 10. src/features/quick-add/ — Quick Add command palette` and before `## Navigation — src/shared/components/app-nav.tsx`:

```markdown
---

## 11. Analytics — what the page sends to Pendo

Built in one place, `src/lib/analytics.ts`. Nothing else constructs this payload.

```
visitor: { id, full_name, username, email, avatarInitials, createdAt }
account: { id, name, currency, locale, createdAt }
```

**The account is the workspace.** There is no separate account entity in the app
and no `accounts` object store. `account.id` is `workspace.id`, which is why
`bot/personas.ts` derives one shared workspace row per `accountId` — that
sharing is the only thing that makes 40 seeded visitors group into 12 Pendo
accounts. Break it and the accounts silently become 40 singletons.

Two fields are conditional:

- `visitor.email` — the key is **absent** for users created before email
  existed. Never `undefined`, never `""`.
- `account` — the whole block is **absent** when the user has no workspace,
  which is every moment between sign-up and workspace setup.

| Moment | Call | Account included? |
|---|---|---|
| Session bootstrap for a returning user (`useAuth.loadSession`) | `identify` | Yes, when the session names a workspace. Fires after the workspace read, not before |
| Sign-up (`useAuth.signUp`) | `identify` | No — none exists yet |
| Sign-in (`useAuth.signIn`) | `identify` | Yes |
| Workspace created (`WorkspaceSetupPage`) | `identify` | Yes — this is where a fresh sign-up gains one |
| Workspace renamed or money settings changed (Settings → Workspace) | `updateOptions` | Yes. `updateOptions`, not `identify`, so a rename does not start a new session |
| Sign-out (`useAuth.signOut`) | `pendo?.clearSession()` | — |

The bot needs no code of its own for any of this: it seeds workspaces that
already agree per account, and `updateProfile` / `updateWorkspace` are already
in the action mix, so the identify paths get exercised by the ordinary walk.
```

- [ ] **Step 2: Point the bot README at it**

Append to the end of the `## What this is` section in `bot/README.md`:

```markdown
What the app reports to Pendo — the visitor and account fields, and which
moment fires which call — is documented in `docs/superpowers/ui-map.md` §11.
The short version: the Pendo account **is** the workspace, and every member of
one of the 12 `ACCOUNTS` derives the same workspace row. `bot/selftest.ts`
enforces that.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/ui-map.md bot/README.md
git commit -m "Document the Pendo contract in the UI map

Records that the account is the workspace, which of the six moments fires
identify versus updateOptions, and which two fields are conditional."
```

---

### Task 6: The `bot-sync` skill and the repo `CLAUDE.md`

**Files:**
- Create: `.claude/skills/bot-sync/SKILL.md`
- Create: `.agents/skills/bot-sync/SKILL.md` (byte-identical copy)
- Create: `CLAUDE.md`

**Interfaces:** none — these are instruction files.

- [ ] **Step 1: Write the skill**

Create `.claude/skills/bot-sync/SKILL.md` with exactly this content:

````markdown
---
name: bot-sync
description: Use after changing the expense-tracker app to find and fix drift in the Playwright usage bot under bot/ — stale selectors, uncovered features, an out-of-date UI map.
---

# Keeping the usage bot in sync with the app

The bot in `bot/` drives the real deployed app with real DOM clicks. It matches
elements by their visible text and their accessible roles, so it has no
compile-time coupling to the app at all — an app change breaks it silently, and
the first symptom is a failed run in CI hours later, or worse, a run that
passes while quietly exercising less than it used to.

This skill closes that gap deliberately, after the app change rather than after
the failure.

## When to run

After any change under `src/`. Cheap to run and find nothing; expensive to skip
and find out from a CI failure next week.

## Step 1 — Resolve the range

Default range: everything since the bot was last touched.

```bash
LAST_BOT=$(git log -1 --format=%H -- bot/ docs/superpowers/ui-map.md)
git diff --name-only "$LAST_BOT"..HEAD -- src/
git status --porcelain -- src/
```

Include the uncommitted working tree — the app change that prompted this run is
often not committed yet. An explicit range may be passed as an argument.

If nothing under `src/` changed, say so and stop. Do not go looking for work.

## Step 2 — Classify what changed

For each changed file, decide which of these it is. A file can be several.

| Change | Why the bot cares |
|---|---|
| Route added, removed, or its guard changed | The bot navigates by nav-link text and waits on an `<h1>`; both are hardcoded |
| Form field added, removed, or its `id` changed | The bot fills by `#id` on auth and workspace forms |
| Visible copy changed on any element the bot clicks | `getByRole(..., { name })` is text-coupled. A button renamed from "Add Transaction" to "New Transaction" breaks the bot and nothing else |
| A new feature with its own dialog or form | Not broken, but uncovered — the bot will never touch it, and it will show up as a dead feature in the analytics |
| Data model change on `User`, `Workspace`, `Transaction`, `Category`, `Goal`, `Budget` | `bot/personas.ts` builds these objects directly and `bot/seed.ts` writes them into IndexedDB at a pinned database version |
| Pendo `track` / `identify` call added or changed | Usually no bot code change, but `docs/superpowers/ui-map.md` §11 must match |

## Step 3 — Update the UI map

`docs/superpowers/ui-map.md` is the bot's map of the app. Update it by **reading
the current component source**, never from the diff alone: a diff tells you what
moved, not what the selector now is. Its own header says it was generated by
reading actual component source, not guessed. Keep that true.

## Step 4 — Update the bot

| App area | Bot files to change |
|---|---|
| New or renamed route, changed guard | `bot/actions.ts` — `ROUTES`, `waitForRoute`, `navigateTo`; ui-map §1 |
| Auth or workspace-setup form fields | `bot/run.ts` — the new-visitor sign-up walk; ui-map §2 and §3 |
| New feature with a dialog or form | `bot/actions.ts` — a new `run*` function; `bot/personas.ts` — the `ActionName` union and every archetype's row in `ACTION_WEIGHTS`; `bot/config.ts` — `NEW_VISITOR_ACTIONS` if a brand-new account can reach it |
| Data model change | `bot/personas.ts` — `buildSeedData`; `bot/seed.ts` — the database version **and** its upgrade path |
| Pendo events or the identify contract | ui-map §11; usually no bot code |
| Copy change on a clicked element | Wherever that exact string is matched, in `bot/actions.ts` or `bot/run.ts` |

Three rules that are easy to get wrong here:

- **`ACTION_WEIGHTS` is exhaustive per archetype.** Adding a name to
  `ActionName` without adding a weight to all five archetypes is a type error,
  which is the point. Weight a new action by who would plausibly use it, not
  uniformly.
- **`NEW_VISITOR_ACTIONS` is a subset on purpose.** A brand-new account has one
  transaction and no goals, so actions that need existing rows would throw for a
  reason that is not a defect.
- **`bot/seed.ts` pins the database version** and `bot/personas.ts` writes rows
  matching it. Bump both together or the seed writes into a store that does not
  exist yet.

## Step 5 — Check

```bash
cd bot && npm run typecheck && npm run selftest
```

If the change added logic worth protecting — a new derived field, a new
invariant between personas and accounts — add a `check(...)` to
`bot/selftest.ts`. It is the only test runner in the repo. Do not add a
framework.

## Step 6 — Verify against a running app

Static reasoning cannot tell you a selector still resolves. One real session
can.

```bash
npm run dev &
cd bot && APP_URL=http://localhost:5173 BOT_SESSIONS=1 HEADLESS=true npm run run
```

Read the run summary it prints. Actions that error are named there. A session
that completes with no errored actions is the proof; anything else is a finding.

Stop the dev server afterwards.

## Step 7 — Report

Say what changed, and say what you deliberately left alone and why. A new
feature the bot does not cover yet is a legitimate outcome — an uncovered
feature reported is useful, an uncovered feature silently skipped is not.
````

- [ ] **Step 2: Mirror it**

```bash
mkdir -p .agents/skills/bot-sync
cp .claude/skills/bot-sync/SKILL.md .agents/skills/bot-sync/SKILL.md
diff .claude/skills/bot-sync/SKILL.md .agents/skills/bot-sync/SKILL.md && echo IDENTICAL
```

Expected: `IDENTICAL`.

- [ ] **Step 3: Write the repo CLAUDE.md**

The repo has none today — only the user's global `~/.claude/CLAUDE.md`. Create `CLAUDE.md` at the repo root:

```markdown
# expense-tracker-data-gen

A React expense tracker, plus a Playwright bot under `bot/` that drives the
deployed app to generate realistic Pendo analytics data.

## After changing the app, check the bot

The bot has **no compile-time coupling to the app**. It finds elements by their
visible text and accessible roles, so an app change breaks it silently — the
first sign is a failed CI run hours later, or a run that passes while quietly
exercising less of the app than it used to.

So: after any change under `src/`, check whether `bot/` has fallen behind, and
run the `bot-sync` skill if it has. It resolves the range since the bot was last
touched, classifies what changed, updates `docs/superpowers/ui-map.md` and the
bot, and verifies with one real session against a local dev server.

This applies to new features too, not only to changed selectors. A feature the
bot never touches shows up as a dead feature in the analytics.

## Things that are easy to get wrong

- **The Pendo account is the workspace.** There is no account entity and no
  `accounts` store. Every member of one of the bot's 12 `ACCOUNTS` derives the
  same workspace row — that sharing is the only reason 40 visitors group into 12
  accounts. `bot/selftest.ts` enforces it. See `docs/superpowers/ui-map.md` §11.
- **`src/lib/analytics.ts` owns the Pendo payload.** Do not hand-roll an
  identify literal at a call site.
- **No test framework exists in this repo.** `bot/selftest.ts` is the only
  runner, `assert`-based, run with `cd bot && npm run selftest`. Do not add one.
- **Skills are mirrored.** `.claude/skills/<name>/SKILL.md` and
  `.agents/skills/<name>/SKILL.md` must stay byte-identical.
```

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/bot-sync/SKILL.md .agents/skills/bot-sync/SKILL.md CLAUDE.md
git commit -m "Add a bot-sync skill and a repo CLAUDE.md that points at it

The bot matches elements by visible text, so it has no compile-time coupling to
the app and breaks silently. The skill makes checking for that drift a step
after app changes rather than a discovery after CI failures."
```

---

### Task 7: Verify end to end, then raise the PR

**Files:** none modified — this task only runs things and opens the PR.

**Interfaces:** none.

- [ ] **Step 1: Run every static check**

```bash
npx tsc -p tsconfig.app.json --noEmit
npm run lint
npm run build
cd bot && npm run typecheck && npm run selftest
```

Expected: all clean. The selftest summary should report 4 more checks than it did on `main` (3 from Task 1, 1 from Task 4).

- [ ] **Step 2: Prove identify actually sends an account**

Start the app, seed one persona, and read what the page sent.

```bash
npm run dev
```

In a second shell:

```bash
cd bot && APP_URL=http://localhost:5173 BOT_SESSIONS=1 HEADLESS=true npm run run
```

Expected: the run summary reports one completed session with no errored actions.

`index.html:9-16` installs the Pendo snippet unconditionally, so `pendo` exists
on localhost too and the new `identify` / `updateOptions` calls really execute
during this session. That is what the run proves: the reordered `loadSession`,
the workspace-setup identify and the settings `updateOptions` all run against a
real page without throwing.

What it does not prove is the payload's contents — the agent loads from
`cdn.pendo-dev...` against a dev subscription this run has no view into. The
payload shape is covered by the three `buildIdentifyOptions` checks in
`bot/selftest.ts` instead. If you want the live confirmation, open the dev
subscription after a seeded session and check that the visitor carries an email
and the account id matches the workspace id.

- [ ] **Step 3: Confirm the working tree is clean**

```bash
git status --porcelain
```

Expected: empty. Anything listed was meant to be committed by an earlier task.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feat/pendo-account-and-bot-sync
gh pr create --title "Send email and the workspace-as-account to Pendo, add a bot-sync skill" --body "$(cat <<'EOF'
## What

Three things:

1. **Visitor email** now rides on every `pendo.identify`.
2. **Accounts.** `pendo.identify` sent a visitor and nothing else, so Pendo had
   no grouping layer at all. It now sends the workspace as the account.
3. **A `bot-sync` skill**, plus a repo `CLAUDE.md` rule pointing at it, so the
   usage bot stops drifting behind the app.

## The account is the workspace

No new entity, no new object store, no schema change. `bot/personas.ts:814-829`
already derives one shared workspace row per `accountId`, so all seven members
of Bengaluru FinCollective land on the same workspace. Sending that workspace as
the Pendo account turns 40 seeded visitors into 12 real accounts with no change
to how the bot seeds anything.

A brand-new visitor who signs up through the UI gets a single-visitor account.
That is accurate — they genuinely are one.

## What is deliberately not here

- **`plan` and `size` on the account.** The bot's `ACCOUNTS` rows carry `tier`
  and `size`, which would be the interesting things to segment on, but they have
  nowhere to live without a schema change and a DB version bump for two fields
  no UI reads. Additive later if wanted.
- **The bot signing in through the sign-in form.** Returning personas still get
  a seeded `localStorage` session, so the email sign-in path stays unexercised.
  Real gap, separate change.

## Testing

- `bot/selftest.ts` gains four checks: three on the payload shape (account
  present with a workspace, absent without one, no `email` key for a user that
  has none) and one that every member of an account derives the same workspace.
  That last one was verified to fail by temporarily reverting
  `bot/personas.ts:825` to the per-persona PRNG.
- `tsc`, `eslint`, `vite build`, bot `tsc` — all clean.
- One real bot session against `localhost:5173`, no errored actions.

Spec: `docs/superpowers/specs/2026-09-07-pendo-account-and-bot-sync-design.md`
Plan: `docs/superpowers/plans/2026-09-07-pendo-account-and-bot-sync.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Report the PR URL**

Print the URL `gh` returns. Do not merge.
