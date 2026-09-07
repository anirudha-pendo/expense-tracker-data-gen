# expense-tracker-data-gen

A React expense tracker, plus a Playwright bot under `bot/` that drives the
deployed app to generate realistic Pendo analytics data.

## After changing the app, check the bot

The bot finds elements by their visible text and accessible roles, so **almost
every app change breaks it silently** — the first sign is a failed CI run hours
later, or a run that passes while quietly exercising less of the app than it
used to.

The one compile-time link is deliberate and narrow: `bot/selftest.ts` imports
`../src/lib/analytics`, and `bot/tsconfig.json` maps `@/*` to `../src/*`, so the
bot's TypeScript program includes `src/lib/analytics.ts`, `src/types/index.ts`
and `src/global.d.ts`. An app type change can therefore fail `cd bot && npm run
typecheck` — that is the intended early warning, not a surprise. It does not
extend to runtime: apart from the pure `buildIdentifyOptions` the selftest
calls, the import is type-only.

Two things that link brings with it. App source is typechecked there under the
bot's compiler options, which differ from `tsconfig.app.json` (no DOM lib, no
`verbatimModuleSyntax`, no `noUnusedLocals`). And `Blob` — from `Attachment` in
`src/types/index.ts` — resolves today only because `@types/node` declares it
globally; if a future app type pulls in a real DOM type, add
`"lib": ["ES2022", "DOM"]` to `bot/tsconfig.json`.

So: after any change under `src/`, check whether `bot/` has fallen behind, and
run the `bot-sync` skill if it has. It resolves the range since the bot was last
touched, classifies what changed, updates `docs/superpowers/ui-map.md` and the
bot, and verifies with one real session against a local dev server.

This applies to new features too, not only to changed selectors. A feature the
bot never touches shows up as a dead feature in the analytics.

## Things that are easy to get wrong

- **The Pendo account is the workspace.** There is no account entity and no
  `accounts` store. Every member of one of the bot's 12 `ACCOUNTS` derives a
  workspace row whose `id`, `name`, `currency`, `locale` and `createdAt` are
  identical — those five are exactly the account block, and that agreement is
  the only reason 40 visitors group into 12 accounts. The row is not identical
  beyond them: `userId` is the member's own. `bot/selftest.ts` enforces those
  five fields and nothing wider. The bot's workspace rename is derived from the
  account for the same reason — one member renaming rewrites the shared account
  for all of them. See `docs/superpowers/ui-map.md` §11.
- **`src/lib/analytics.ts` owns the Pendo payload.** Do not hand-roll an
  identify literal at a call site.
- **No test framework exists in this repo.** `bot/selftest.ts` is the only
  runner, `assert`-based, run with `cd bot && npm run selftest`. Do not add one.
- **Skills are mirrored.** `.claude/skills/<name>/SKILL.md` and
  `.agents/skills/<name>/SKILL.md` must stay byte-identical.
