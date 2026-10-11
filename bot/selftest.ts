// Single assert-based check script for the whole bot/ directory. No test
// framework — see the global constraints. Later tasks extend this file with
// more `check(...)` calls; they must not replace what is already here.
//
// Run with `npm run selftest`.

import assert from "node:assert";
import {
  REGIONS,
  REGION_CURVE,
  BASE_SESSIONS_PER_RUN,
  sessionsForRegion,
  makeRng,
  NEW_VISITOR_ARCHETYPE,
  type Region,
} from "./config";
import {
  ARCHETYPES,
  ACTION_WEIGHTS,
  ACCOUNTS,
  PERSONAS,
  buildSeedData,
  type Archetype,
  type Persona,
  type SeedData,
} from "./personas";
import { planWorkspaceRename } from "./actions";
import { buildIdentifyOptions } from "../src/lib/analytics";
import {
  ARCHETYPE_STYLE,
  CELLS,
  FOLLOWUP_KINDS,
  FOLLOWUP_TEMPLATES,
  INTENTS,
  INTENT_EXPECT,
  INTENT_MIX,
  IN_SCOPE_INTENTS,
  OPENER_TEMPLATES,
  SHAPES,
  applyStyle,
  drawPeriod,
  invalidPeriod,
  isScopeValid,
  newVisitorPromptData,
  promptDataFromSeed,
  renderTemplate,
  styleProfile,
  templateSlots,
  verdict,
  type Expect,
  type Period,
  type PromptData,
  type Register,
  type Scope,
  type SlotName,
  type SlotValues,
  type StyleKnobs,
  type StyleProfile,
  type Template,
  type TypingStep,
  type Verdict,
} from "./assistant-prompts";
import { DEFAULT_CATEGORY_SEEDS } from "./seed-data";

let checksPassed = 0;

/** Runs one named check. On failure, logs the label and rethrows. */
function check(label: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    console.error(`FAILED: ${label}`);
    throw err;
  }
  checksPassed++;
}

// --- Region traffic curve ---------------------------------------------------

check("every region curve has 24 entries, all in [0, 1]", () => {
  for (const region of REGIONS) {
    const curve = REGION_CURVE[region];
    assert.strictEqual(curve.length, 24, `${region} curve should have 24 entries`);
    for (const value of curve) {
      assert.ok(
        value >= 0 && value <= 1,
        `${region} curve value ${value} is outside [0, 1]`,
      );
    }
  }
});

check("each region's peak hour matches expectations", () => {
  const expectedPeakHour: Record<Region, number> = { IN: 7, EU: 10, US: 15 };
  for (const region of REGIONS) {
    const curve = REGION_CURVE[region];
    const peakHour = curve.indexOf(Math.max(...curve));
    assert.strictEqual(
      peakHour,
      expectedPeakHour[region],
      `${region} peak hour should be ${expectedPeakHour[region]}, got ${peakHour}`,
    );
  }
});

// Tuesday, 2026-09-01 (UTC) — a plain weekday, not a boundary case.
const WEEKDAY_DATE_UTC_YMD: [number, number, number] = [2026, 8, 1];
// Saturday, 2026-09-05 (UTC).
const SATURDAY_DATE_UTC_YMD: [number, number, number] = [2026, 8, 5];

function atUtcHour(ymd: [number, number, number], hour: number): Date {
  const [year, month, day] = ymd;
  return new Date(Date.UTC(year, month, day, hour, 0, 0));
}

check("sessionsForRegion returns 0 for IN at 02:00 UTC on a weekday", () => {
  const date = atUtcHour(WEEKDAY_DATE_UTC_YMD, 2);
  assert.strictEqual(date.getUTCDay(), 2, "fixture date must be a weekday (Tuesday)");
  assert.strictEqual(sessionsForRegion("IN", date), 0);
});

check(
  "sessionsForRegion at a region's peak weekday hour equals BASE_SESSIONS_PER_RUN",
  () => {
    const peakHour: Record<Region, number> = { IN: 7, EU: 10, US: 15 };
    for (const region of REGIONS) {
      const date = atUtcHour(WEEKDAY_DATE_UTC_YMD, peakHour[region]);
      assert.strictEqual(sessionsForRegion(region, date), BASE_SESSIONS_PER_RUN);
    }
  },
);

check("a Saturday returns fewer sessions than the same hour on a weekday", () => {
  const weekdayDate = atUtcHour(WEEKDAY_DATE_UTC_YMD, 10);
  const saturdayDate = atUtcHour(SATURDAY_DATE_UTC_YMD, 10);
  assert.strictEqual(saturdayDate.getUTCDay(), 6, "fixture date must be a Saturday");
  const weekdaySessions = sessionsForRegion("EU", weekdayDate);
  const saturdaySessions = sessionsForRegion("EU", saturdayDate);
  assert.ok(
    saturdaySessions < weekdaySessions,
    `expected Saturday (${saturdaySessions}) < weekday (${weekdaySessions})`,
  );
});

// --- Seeded PRNG -------------------------------------------------------------

check("makeRng is deterministic per seed and differs across seeds", () => {
  const rngX1 = makeRng("x");
  const rngX2 = makeRng("x");
  const rngY = makeRng("y");

  const seqX1 = Array.from({ length: 10 }, () => rngX1.next());
  const seqX2 = Array.from({ length: 10 }, () => rngX2.next());
  const seqY = Array.from({ length: 10 }, () => rngY.next());

  assert.deepStrictEqual(seqX1, seqX2, "same seed should produce the same sequence");
  assert.notDeepStrictEqual(seqX1, seqY, "different seeds should produce different sequences");
});

check("int(min, max) stays in bounds and reaches both ends over 1000 draws", () => {
  const rng = makeRng("int-bounds-check");
  const min = 1;
  const max = 6;
  let sawMin = false;
  let sawMax = false;

  for (let i = 0; i < 1000; i++) {
    const n = rng.int(min, max);
    assert.ok(n >= min && n <= max, `int(${min}, ${max}) returned ${n}, out of bounds`);
    if (n === min) sawMin = true;
    if (n === max) sawMax = true;
  }

  assert.ok(sawMin, `int(${min}, ${max}) never returned ${min} over 1000 draws`);
  assert.ok(sawMax, `int(${min}, ${max}) never returned ${max} over 1000 draws`);
});

// --- Personas, accounts and archetypes ---------------------------------------

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// `buildSeedData` requires a `now` — there is no default, so it can never be
// accidentally non-deterministic. Tests always pass this same fixed instant.
const TEST_NOW = new Date("2026-09-04T00:00:00.000Z");

check("all 40 persona ids are unique and match a UUID v4 regex", () => {
  assert.strictEqual(PERSONAS.length, 40, `expected 40 personas, got ${PERSONAS.length}`);
  const seen = new Set<string>();
  for (const persona of PERSONAS) {
    assert.match(persona.id, UUID_V4_REGEX, `${persona.id} is not a UUID v4`);
    assert.ok(!seen.has(persona.id), `duplicate persona id ${persona.id}`);
    seen.add(persona.id);
  }
});

check("every persona.accountId resolves to an entry in ACCOUNTS", () => {
  const accountIds = new Set(ACCOUNTS.map((a) => a.id));
  for (const persona of PERSONAS) {
    assert.ok(
      accountIds.has(persona.accountId),
      `persona ${persona.username} has unknown accountId ${persona.accountId}`,
    );
  }
});

check("every account has at least one persona, and large accounts have at least 6", () => {
  const countByAccount = new Map<string, number>();
  for (const persona of PERSONAS) {
    countByAccount.set(persona.accountId, (countByAccount.get(persona.accountId) ?? 0) + 1);
  }
  for (const account of ACCOUNTS) {
    const count = countByAccount.get(account.id) ?? 0;
    assert.ok(count >= 1, `account ${account.id} has no personas`);
    if (account.size === "large") {
      assert.ok(count >= 6, `large account ${account.id} has only ${count} personas`);
    }
  }
});

check("buildSeedData on the same persona and now twice yields deeply equal output", () => {
  for (const persona of PERSONAS) {
    const first = buildSeedData(persona, TEST_NOW);
    const second = buildSeedData(persona, TEST_NOW);
    assert.deepStrictEqual(first, second, `${persona.username}: buildSeedData is not deterministic`);
  }
});

check("buildSeedData on two different personas yields different user ids", () => {
  const userIds = new Set<string>();
  for (const persona of PERSONAS) {
    userIds.add(buildSeedData(persona, TEST_NOW).user.id);
  }
  assert.strictEqual(
    userIds.size,
    PERSONAS.length,
    "buildSeedData produced duplicate user ids across distinct personas",
  );
});

check("every persona in an account derives the same workspace id, name, currency, locale and createdAt", () => {
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
    // `createdAt` is checked for the same reason as the other three, and it is
    // the easiest one to get wrong: it is the only account field derived from a
    // date rather than copied off the ACCOUNTS row. Pendo keeps the last write
    // for account metadata, so members disagreeing here makes the account's age
    // flip between runs depending only on who identified most recently.
    assert.strictEqual(workspace.createdAt, first.createdAt, `${persona.username} disagrees with its account on createdAt (${workspace.createdAt} vs ${first.createdAt})`);
  }

  assert.strictEqual(
    firstByAccount.size,
    ACCOUNTS.length,
    `expected ${ACCOUNTS.length} distinct workspaces, one per account, got ${firstByAccount.size}`,
  );
});

check("two members of one account plan the same workspace rename", () => {
  const membersByAccount = new Map<string, Persona[]>();
  for (const persona of PERSONAS) {
    const members = membersByAccount.get(persona.accountId) ?? [];
    members.push(persona);
    membersByAccount.set(persona.accountId, members);
  }

  let pairsChecked = 0;
  for (const [accountId, members] of membersByAccount) {
    if (members.length < 2) continue;
    pairsChecked++;

    // Both start from the seeded workspace name, which is the account's name.
    const seeded = buildSeedData(members[0], TEST_NOW).workspace.name;
    const first = planWorkspaceRename(members[0], seeded);
    const second = planWorkspaceRename(members[members.length - 1], seeded);

    // The workspace IS the shared Pendo account, so a rename by one member
    // rewrites `account.name`, `account.currency` and `account.locale` for
    // every other member. Two members disagreeing here is the account's
    // descriptive fields thrashing on every run — nothing throws.
    assert.strictEqual(
      first.name,
      second.name,
      `${accountId}: ${members[0].username} renames to "${first.name}" but ${members[members.length - 1].username} renames to "${second.name}"`,
    );
    assert.notStrictEqual(first.name, seeded, `${accountId}: the rename must change the name, or "Save changes" stays disabled`);

    // The currency and locale rolls draw from the returned PRNG, so those have
    // to agree draw-for-draw as well, not just the name.
    const draws = (rng: { next: () => number }) => Array.from({ length: 6 }, () => rng.next());
    assert.deepStrictEqual(draws(first.rng), draws(second.rng), `${accountId}: members disagree on the currency/locale draws`);

    // And once one member has renamed, the next member to rename lands on the
    // same follow-up name rather than reverting to their own persona's.
    const afterFirst = planWorkspaceRename(members[0], first.name);
    const afterSecond = planWorkspaceRename(members[members.length - 1], first.name);
    assert.strictEqual(
      afterFirst.name,
      afterSecond.name,
      `${accountId}: members disagree on the rename that follows "${first.name}"`,
    );
  }

  assert.ok(pairsChecked >= 9, `expected at least 9 multi-member accounts to check, got ${pairsChecked}`);
});

check("planWorkspaceRename falls back to a persona-derived rename for a persona whose accountId isn't in ACCOUNTS", () => {
  // Mirrors the shape `newVisitorPersona` in bot/run.ts builds: a brand-new
  // visitor's `accountId` is the synthetic "acct-new-visitor", deliberately
  // absent from ACCOUNTS, because that visitor's workspace starts out shared
  // with nobody. `updateWorkspace` is in NEW_VISITOR_ACTIONS, so a session
  // like this one really can reach `planWorkspaceRename`.
  const newVisitor: Persona = {
    id: "new-visitor-0",
    username: "aria_hall12",
    email: "aria_hall12@example.com",
    password: "not-a-real-password",
    displayName: "Aria Hall",
    accountId: "acct-new-visitor",
    region: "US",
    archetype: NEW_VISITOR_ARCHETYPE,
  };
  assert.ok(
    !ACCOUNTS.some((account) => account.id === newVisitor.accountId),
    "this check only means something while acct-new-visitor stays out of ACCOUNTS",
  );

  const existing = "Aria Hall's Finances";
  let plan: { name: string; rng: { next: () => number } } | undefined;
  assert.doesNotThrow(() => {
    plan = planWorkspaceRename(newVisitor, existing);
  }, "a persona with an unknown accountId must get a rename plan, not a throw");
  assert.ok(plan !== undefined);
  assert.notStrictEqual(plan.name, existing, "the rename must change the name, or \"Save changes\" stays disabled");

  // Same persona, same starting name, twice — the fallback still has to be
  // pure and deterministic, not a fresh roll every call.
  const replan = planWorkspaceRename(newVisitor, existing);
  assert.strictEqual(replan.name, plan.name, "the fallback must be deterministic for the same persona and starting name");
});

check(
  "every transaction's categoryId resolves to one of the workspace's own categories, and every budget's categoryId does too",
  () => {
    for (const persona of PERSONAS) {
      const seed = buildSeedData(persona, TEST_NOW);
      const categoryIds = new Set(seed.categories.map((c) => c.id));
      for (const tx of seed.transactions) {
        assert.ok(
          categoryIds.has(tx.categoryId),
          `${persona.username}: transaction ${tx.id} references unknown category ${tx.categoryId}`,
        );
      }
      for (const budget of seed.budgets) {
        assert.ok(
          categoryIds.has(budget.categoryId),
          `${persona.username}: budget ${budget.id} references unknown category ${budget.categoryId}`,
        );
      }
    }
  },
);

/** "Year-month" as a single increasing integer — mirrors the helper in personas.ts, kept local so this test doesn't depend on an internal export. */
function ymFromDate(date: Date): number {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function dateOnlyFromYm(ym: number, day: number): string {
  const year = Math.floor(ym / 12);
  const month = ym - year * 12;
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0)).toISOString().slice(0, 10);
}

check("transaction dates all fall inside the archetype's history window", () => {
  const nowYm = ymFromDate(TEST_NOW);
  const windowEnd = TEST_NOW.toISOString().slice(0, 10);

  for (const persona of PERSONAS) {
    const { historyMonths } = ARCHETYPES[persona.archetype];
    const earliestYm = nowYm - (historyMonths - 1);
    const windowStart = dateOnlyFromYm(earliestYm, 1);
    const seed = buildSeedData(persona, TEST_NOW);
    for (const tx of seed.transactions) {
      assert.ok(
        tx.date >= windowStart && tx.date <= windowEnd,
        `${persona.username}: transaction date ${tx.date} outside history window [${windowStart}, ${windowEnd}]`,
      );
    }
  }
});

check("every archetype in the table is present in ACTION_WEIGHTS, and every weight is non-negative", () => {
  const archetypes = Object.keys(ARCHETYPES) as Archetype[];
  for (const archetype of archetypes) {
    const weights = ACTION_WEIGHTS[archetype];
    assert.ok(weights, `archetype ${archetype} is missing from ACTION_WEIGHTS`);
    for (const [action, weight] of Object.entries(weights)) {
      assert.ok(weight >= 0, `${archetype}.${action} has a negative weight (${weight})`);
    }
  }
});

check("every archetype gives signOut a non-zero (but small) weight", () => {
  for (const archetype of Object.keys(ARCHETYPES) as Archetype[]) {
    const weights = ACTION_WEIGHTS[archetype];
    assert.ok(weights.signOut > 0, `${archetype}.signOut should be non-zero`);
  }
});

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

// --- Assistant prompts ---------------------------------------------------------

check("13 intents with 28 intent x shape cells", () => {
  assert.strictEqual(INTENTS.length, 13);
  assert.strictEqual(INTENTS.reduce((sum, intent) => sum + SHAPES[intent].length, 0), 28);
});

check("verdict: match, miss, overreach beats miss, unavailable, any-of must, forbid all (AC13)", () => {
  const anyOf: Expect = { must: ["addTransaction", "updateTransaction"], forbid: [] };
  const cases: [Expect, string[], boolean, Verdict][] = [
    [INTENT_EXPECT.spendSummary, ["getSpendingSummary"], false, "match"],
    [INTENT_EXPECT.spendSummary, [], false, "miss"],
    [INTENT_EXPECT.spendSummary, ["findTransactions"], false, "miss"],
    [INTENT_EXPECT.findTransactions, ["deleteTransaction"], false, "overreach"],
    [INTENT_EXPECT.spendSummary, ["getSpendingSummary"], true, "unavailable"],
    [INTENT_EXPECT.spendSummary, ["addTransaction"], true, "unavailable"],
    [anyOf, ["updateTransaction"], false, "match"],
    [anyOf, ["addTransaction", "findTransactions"], false, "match"],
    [anyOf, ["findTransactions"], false, "miss"],
    [INTENT_EXPECT.offTopic, [], false, "match"],
    [INTENT_EXPECT.offTopic, ["getSpendingSummary"], false, "overreach"],
    [INTENT_EXPECT.vague, ["getSpendingSummary"], false, "match"],
    [INTENT_EXPECT.vague, ["addTransaction"], false, "overreach"],
    [INTENT_EXPECT.deleteTransaction, ["deleteTransaction"], false, "match"],
  ];
  for (const [expect, tools, unavailable, wanted] of cases) {
    assert.strictEqual(verdict(expect, tools, unavailable), wanted, `${JSON.stringify(expect)} + [${tools}] unavailable=${unavailable}`);
  }
});

const STYLE_REGISTERS: readonly Register[] = ["terse", "plain", "chatty"];

/** Which slots each cell's templates must and may use, so a template cannot quietly ask the wrong question. */
const CELL_SLOTS: Record<string, { required: SlotName[]; optional: SlotName[] }> = {
  "spendSummary/all": { required: [], optional: ["period"] },
  "spendSummary/category": { required: ["category"], optional: ["period"] },
  "incomeSummary/all": { required: [], optional: ["period"] },
  "incomeSummary/category": { required: ["category"], optional: ["period"] },
  "findTransactions/category": { required: ["category"], optional: ["period"] },
  "findTransactions/text": { required: ["text"], optional: ["period"] },
  "findTransactions/amountRange": { required: ["category", "range"], optional: ["period"] },
  "topTransactions/all": { required: ["order"], optional: ["limit", "period"] },
  "topTransactions/category": { required: ["order", "category"], optional: ["limit", "period"] },
  "addTransaction/full": { required: ["amount", "description", "category"], optional: [] },
  "addTransaction/inferCategory": { required: ["amount", "description"], optional: [] },
  "addTransaction/pastDate": { required: ["amount", "description", "date"], optional: ["category"] },
  "editTransaction/amount": { required: ["target", "newAmount"], optional: [] },
  "editTransaction/category": { required: ["target", "newCategory"], optional: [] },
  "editTransaction/date": { required: ["target", "newDate"], optional: [] },
  "deleteTransaction/target": { required: ["target"], optional: [] },
  "vague/none": { required: [], optional: ["period"] },
  "clarify/missingAmount": { required: ["description"], optional: [] },
  "clarify/missingWhat": { required: ["amount"], optional: [] },
  "clarify/ambiguousTarget": { required: ["ambiguous"], optional: [] },
};

check("the bank has the 28 cells in intent x shape order", () => {
  const keys = CELLS.map((cell) => `${cell.intent}/${cell.shape}`);
  const expected = INTENTS.flatMap((intent) => SHAPES[intent].map((shape) => `${intent}/${shape}`));
  assert.deepStrictEqual(keys, expected);
});

check("every template parses: known slots, flat [a|b], no slot glued to a letter, no quote, bracket or newline", () => {
  for (const text of [...OPENER_TEMPLATES, ...FOLLOWUP_TEMPLATES].map((t) => t.text)) {
    assert.doesNotThrow(() => templateSlots(text), text);
    const stripped = text.replace(/\[[^[\]{}|]*(\|[^[\]{}|]*)+\]/g, "").replace(/\{[A-Za-z]+\}/g, "");
    assert.ok(!/[[\]{}|]/.test(stripped), `unbalanced, nested or single-option brackets in "${text}"`);
    assert.ok(!/[A-Za-z]\{|\}[A-Za-z]/.test(text), `a slot touches a letter in "${text}"`);
    assert.ok(!/["\n\r]/.test(text), `quote or newline in "${text}"`);
  }
});

check("every opener template uses exactly its cell's required slots plus allowed optional ones", () => {
  for (const t of OPENER_TEMPLATES) {
    const rule = CELL_SLOTS[`${t.intent}/${t.shape}`] ?? { required: [], optional: [] };
    for (const slot of rule.required) assert.ok(t.slots.includes(slot), `"${t.text}" is missing {${slot}}`);
    for (const slot of t.slots) assert.ok([...rule.required, ...rule.optional].includes(slot), `"${t.text}" may not use {${slot}}`);
  }
});

check("bank sizes meet the spec minimums (AC2)", () => {
  const count = (pred: (t: Template) => boolean): number => OPENER_TEMPLATES.filter(pred).length;
  for (const intent of IN_SCOPE_INTENTS) {
    assert.ok(count((t) => t.intent === intent) >= 12, `${intent} has fewer than 12 templates`);
    for (const register of STYLE_REGISTERS) {
      assert.ok(count((t) => t.intent === intent && t.register === register) >= 4, `${intent} has fewer than 4 ${register} templates`);
    }
  }
  for (const cell of CELLS) {
    const n = count((t) => t.intent === cell.intent && t.shape === cell.shape);
    const min = IN_SCOPE_INTENTS.includes(cell.intent) ? 2 : 4;
    assert.ok(n >= min, `${cell.intent}/${cell.shape} has ${n} templates, needs ${min}`);
  }
  assert.ok(count((t) => t.intent === "vague") >= 15, "vague needs 15");
  assert.ok(count((t) => t.intent === "adviceRefusal") >= 12, "adviceRefusal needs 12");
  assert.ok(count((t) => t.intent === "offTopic") >= 30, "offTopic needs 30");
  for (const kind of FOLLOWUP_KINDS) {
    assert.ok(FOLLOWUP_TEMPLATES.filter((t) => t.kind === kind).length >= 6, `follow-up ${kind} needs 6`);
  }
  assert.ok(OPENER_TEMPLATES.length + FOLLOWUP_TEMPLATES.length >= 250, "the bank needs 250 templates in total");
});

check("renderTemplate resolves [a|b], keeps slot values in their own parts, and refuses a missing value", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const parts = renderTemplate("I [spent a lot|went overboard] on {category}?", { category: "Food & Dining" }, makeRng(`render:${i}`));
    seen.add(parts.map((part) => part.text).join(""));
    assert.deepStrictEqual(parts.filter((part) => part.slot), [{ text: "Food & Dining", slot: true }]);
  }
  assert.deepStrictEqual([...seen].sort(), ["I spent a lot on Food & Dining?", "I went overboard on Food & Dining?"]);
  assert.deepStrictEqual(renderTemplate("{amount}", { amount: "4.50" }, makeRng("render")), [{ text: "4.50", slot: true }]);
  assert.throws(() => renderTemplate("add {amount}", {}, makeRng("render")), /needs a value for \{amount\}/);
  assert.throws(() => templateSlots("add {money}"), /unknown slot \{money\}/);
});

const assistantDataCache = new Map<string, PromptData>();

/** The prompt view of a persona's seed, cached because buildSeedData is the slow part of these checks. */
function assistantData(persona: Persona, now: Date = TEST_NOW): PromptData {
  const key = `${persona.id}|${now.toISOString()}`;
  const cached = assistantDataCache.get(key);
  if (cached !== undefined) return cached;
  const data = promptDataFromSeed(buildSeedData(persona, now), now);
  assistantDataCache.set(key, data);
  return data;
}

check("promptDataFromSeed mirrors the seed: names, amounts, dates, and the month history starts in", () => {
  const persona = PERSONAS[0];
  const seed = buildSeedData(persona, TEST_NOW);
  const data = assistantData(persona);
  assert.strictEqual(data.today, "2026-09-04");
  assert.deepStrictEqual(data.categories.map((c) => c.name), seed.categories.map((c) => c.name));
  assert.strictEqual(data.transactions.length, seed.transactions.length);
  const earliest = seed.transactions.map((t) => t.date).sort()[0];
  assert.strictEqual(data.historyStart, `${earliest.slice(0, 7)}-01`);
  const visitor = newVisitorPromptData(TEST_NOW);
  assert.deepStrictEqual(visitor.categories.map((c) => c.name), DEFAULT_CATEGORY_SEEDS.map((c) => c.name));
  assert.deepStrictEqual({ transactions: visitor.transactions.length, historyStart: visitor.historyStart }, { transactions: 0, historyStart: "2026-09-01" });
});

check("isScopeValid accepts the persona's own slots and rejects foreign ones", () => {
  const data: PromptData = {
    today: "2026-09-04",
    historyStart: "2026-06-01",
    categories: [
      { name: "Food & Dining", scope: "expense", seed: DEFAULT_CATEGORY_SEEDS[0] },
      { name: "Salary", scope: "income", seed: DEFAULT_CATEGORY_SEEDS[8] },
    ],
    transactions: [
      { description: "Coffee", amount: 4.5, date: "2026-09-01", categoryName: "Food & Dining", type: "expense" },
      { description: "Coffee", amount: 5, date: "2026-09-02", categoryName: "Food & Dining", type: "expense" },
      { description: "Coffee", amount: 5, date: "2026-09-02", categoryName: "Food & Dining", type: "expense" },
    ],
  };
  const july: Period = { kind: "namedMonth", label: "in July", start: "2026-07-01", end: "2026-07-31" };
  const cases: [Scope, boolean][] = [
    [{ type: "expense", category: "food & dining", period: july }, true],
    [{ type: "expense", category: "Yachts" }, false],
    [{ type: "income", category: "Food & Dining" }, false],
    [{ type: "income", category: "salary" }, true],
    [{ type: "expense", newCategory: "Salary" }, false],
    [{ type: "expense", period: { kind: "beforeHistory", label: "in 2023", start: "2023-01-01", end: "2023-12-31" } }, false],
    [{ type: "expense", period: { kind: "nextMonth", label: "next month", start: "2026-10-01", end: "2026-10-31" } }, false],
    [{ type: "expense", target: { description: "coffee", date: "2026-09-01" } }, true],
    [{ type: "expense", target: { description: "Coffee", date: "2026-09-02" } }, false],
    [{ type: "expense", target: { description: "Coffee", date: "2026-08-15" } }, false],
    [{ type: "expense", ambiguous: "coffee" }, true],
    [{ type: "expense", ambiguous: "tea" }, false],
    [{ type: "expense", text: "coff" }, true],
    [{ type: "expense", text: "uber" }, false],
    [{ type: "expense", text: "" }, false],
    [{ type: "expense", category: "Food & Dining", range: { op: "over", value: 4 } }, true],
    [{ type: "expense", category: "Food & Dining", range: { op: "over", value: 50 } }, false],
    [{ type: "expense", category: "Food & Dining", range: { op: "between", low: 4, high: 4.5 } }, true],
    [{ type: "expense", range: { op: "under", value: 50 } }, false],
    [{ type: "expense", limit: 5 }, true],
    [{ type: "expense", limit: 7 }, false],
    [{ type: "expense", amount: 0 }, false],
    [{ type: "expense", amount: Number.NaN }, false],
    [{ type: "expense", newAmount: 12.5 }, true],
    [{ type: "expense", description: " " }, false],
    [{ type: "expense", date: "2026-09-05" }, false],
    [{ type: "expense", date: "2025-09-03" }, false],
    [{ type: "expense", newDate: "2026-09-01", target: { description: "Coffee", date: "2026-09-01" } }, false],
  ];
  for (const [scope, wanted] of cases) assert.strictEqual(isScopeValid(scope, data), wanted, JSON.stringify(scope));
});

check("periods stay inside the persona's history on month and year boundaries; invalid periods never validate", () => {
  const boundaryDates = ["2027-01-01", "2026-03-01", "2026-03-31", "2026-12-31", "2026-09-04"].map((iso) => new Date(`${iso}T00:00:00.000Z`));
  for (const now of boundaryDates) {
    for (const data of [...PERSONAS.slice(0, 10).map((p) => assistantData(p, now)), newVisitorPromptData(now)]) {
      const rng = makeRng(`periods:${data.today}`);
      for (let i = 0; i < 300; i++) {
        const period = drawPeriod(data, rng);
        assert.ok(isScopeValid({ type: "expense", period }, data), `${period.label} (${period.start}..${period.end}) on ${data.today}`);
        if (["lastMonth", "namedMonth", "sinceMonth"].includes(period.kind)) {
          assert.ok(period.start >= data.historyStart, `${period.label} starts before history on ${data.today}`);
        }
        assert.ok(!isScopeValid({ type: "expense", period: invalidPeriod(data, rng) }, data));
      }
      if (data.transactions.length === 0 && data.today.endsWith("-01")) {
        for (let i = 0; i < 300; i++) assert.ok(!["yesterday", "lastMonth", "namedMonth", "sinceMonth"].includes(drawPeriod(data, rng).kind));
      }
    }
  }
});

const ARCHETYPE_LIST: readonly Archetype[] = ["power", "regular", "casual", "explorer", "churning"];

/** One value for every slot, so any template renders. Values carry capitals so the lowercase habit is visible. */
const ALL_SLOT_VALUES: SlotValues = {
  category: "Food & Dining",
  newCategory: "Transport",
  period: "last month",
  amount: "12.50",
  newAmount: "15",
  description: "coffee",
  date: "on Sep 2",
  newDate: "Sep 1",
  text: "uber",
  range: "over 40",
  limit: "5",
  order: "biggest",
  target: "the Coffee on Sep 3",
  ambiguous: "coffee",
  candidate: "Sep 3",
};

function typedResult(typing: readonly TypingStep[]): string {
  let text = "";
  for (const step of typing) text = step.kind === "type" ? text + step.text : text.slice(0, -1);
  return text;
}

check("every archetype's intent mix sums to 100 with the spec's in-scope share", () => {
  const inScope: Record<Archetype, number> = { power: 84, regular: 73, casual: 45, explorer: 44, churning: 30 };
  for (const archetype of ARCHETYPE_LIST) {
    const mix = INTENT_MIX[archetype];
    assert.strictEqual(INTENTS.reduce((sum, intent) => sum + mix[intent], 0), 100, archetype);
    assert.strictEqual(IN_SCOPE_INTENTS.reduce((sum, intent) => sum + mix[intent], 0), inScope[archetype], archetype);
    const registers = ARCHETYPE_STYLE[archetype].registers;
    assert.strictEqual(registers.terse + registers.plain + registers.chatty, 100, archetype);
  }
});

check("a style profile is a pure function of its key, and doubles the preferred register", () => {
  for (const archetype of ARCHETYPE_LIST) {
    for (let i = 0; i < 20; i++) {
      const a = styleProfile(archetype, `persona-${i}`);
      assert.deepStrictEqual(styleProfile(archetype, `persona-${i}`), a);
      assert.ok(ARCHETYPE_STYLE[archetype].registers[a.preferred] > 0, `${archetype} preferred a zero-weight register`);
      assert.strictEqual(a.registerWeights[a.preferred], ARCHETYPE_STYLE[archetype].registers[a.preferred] * 2);
    }
  }
});

check("styled text replays exactly from its keystrokes, and a typo never touches a slot or a short word (RF3)", () => {
  const always: StyleKnobs[] = [
    { ...ARCHETYPE_STYLE.casual, keptTypo: 1, correctedTypo: 0 },
    { ...ARCHETYPE_STYLE.casual, keptTypo: 0, correctedTypo: 1 },
    { ...ARCHETYPE_STYLE.power, keptTypo: 0, correctedTypo: 0 },
  ];
  const styles: StyleProfile[] = [
    { lowercase: true, noEndPunctuation: true, preferred: "plain", registerWeights: { terse: 1, plain: 1, chatty: 1 } },
    { lowercase: false, noEndPunctuation: false, preferred: "plain", registerWeights: { terse: 1, plain: 1, chatty: 1 } },
  ];
  const texts = [...OPENER_TEMPLATES, ...FOLLOWUP_TEMPLATES].map((t) => t.text);
  let corrected = 0;
  let kept = 0;
  for (const knobs of always) {
    for (const style of styles) {
      texts.forEach((template, i) => {
        const rng = makeRng(`style:${i}`);
        const parts = renderTemplate(template, ALL_SLOT_VALUES, rng);
        const styled = applyStyle(parts, style, knobs, rng);
        assert.strictEqual(typedResult(styled.typing), styled.text, `keystrokes do not replay "${styled.text}"`);
        for (const part of parts.filter((p) => p.slot)) {
          const value = style.lowercase ? part.text.toLowerCase() : part.text;
          assert.ok(styled.text.includes(value), `typo inside slot "${value}" in "${styled.text}"`);
        }
        const hasLongWord = parts.some((p) => !p.slot && /[A-Za-z]{4,}/.test(p.text));
        if (!hasLongWord) assert.strictEqual(styled.typo, "none", `typo without a 4-letter literal word in "${styled.text}"`);
        if (styled.typo === "corrected") {
          corrected++;
          assert.strictEqual(styled.typing.length, 3);
          const [wrong, backspace, rest] = styled.typing;
          assert.strictEqual(backspace.kind, "backspace");
          assert.ok(wrong.kind === "type" && rest.kind === "type" && wrong.text.length > 0 && rest.text.length > 0);
          assert.notStrictEqual(wrong.text.slice(-1), rest.text[0], "the corrected letter must differ from the typed one");
        }
        if (styled.typo === "kept") kept++;
        if (style.lowercase) assert.strictEqual(styled.text, styled.text.toLowerCase());
      });
    }
  }
  assert.ok(corrected > 100 && kept > 100, `typo paths not exercised: corrected ${corrected}, kept ${kept}`);
});

// --- Summary -----------------------------------------------------------------

console.log(`selftest: ${checksPassed} checks passed`);
process.exit(0);
