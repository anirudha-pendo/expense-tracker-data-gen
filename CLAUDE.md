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
