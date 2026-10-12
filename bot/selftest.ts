// Single assert-based check script for the whole bot/ directory. No test
// framework — see the global constraints. Later tasks extend this file with
// more `check(...)` calls; they must not replace what is already here.
//
// Run with `npm run selftest`.

import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REGIONS,
  REGION_CURVE,
  BASE_SESSIONS_PER_RUN,
  sessionsForRegion,
  makeRng,
  NEW_VISITOR_ARCHETYPE,
  ASSISTANT_FOCUS_SHARE,
  ASSISTANT_PROMPT_MAX_CHARS,
  ASSISTANT_TURNS_PER_ACTION_MAX,
  ASSISTANT_TURNS_PER_RUN_MAX,
  ASSISTANT_TURNS_PER_SESSION_MAX,
  type Region,
  type Rng,
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
import { planWorkspaceRename, runCapCutLine, takeRunTurn } from "./actions";
import { checkPendo, comparePendoIds, formatAssistantBlock, formatBeaconLine, formatPendoBlock, formatPendoReading, isPendoBeacon } from "./run";
import { buildIdentifyOptions } from "../src/lib/analytics";
import {
  ARCHETYPE_STYLE,
  BANKED_FOLLOWUP_KINDS,
  abandonPrefix,
  CELLS,
  FOLLOWUP_KINDS,
  FOLLOWUP_TEMPLATES,
  INTENTS,
  INTENT_EXPECT,
  INTENT_MIX,
  IN_SCOPE_INTENTS,
  NO_TOOLS,
  NO_WRITES,
  OPENER_TEMPLATES,
  SHAPES,
  applyStyle,
  cellFillable,
  createAssistantPlanner,
  drawCell,
  drawPeriod,
  focusCell,
  formatMatchRate,
  formatTurnLine,
  invalidPeriod,
  isScopeValid,
  newVisitorPromptData,
  promptDataFromSeed,
  renderTemplate,
  searchText,
  styleProfile,
  summarizeAssistant,
  templateSlots,
  verdict,
  type AssistantPlanner,
  type Expect,
  type Intent,
  type Part,
  type Period,
  type PlannerInput,
  type PromptData,
  type Register,
  type Scope,
  type SlotName,
  type SlotValues,
  type StyleKnobs,
  type StyleProfile,
  type Template,
  type Turn,
  type TurnRecord,
  type TypingStep,
  type Verdict,
} from "./assistant-prompts";
import { CUSTOM_CATEGORY_SEEDS, DEFAULT_CATEGORY_SEEDS, PERSONA_PASSWORD, type CategorySeed } from "./seed-data";

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
  "clarify/ambiguousTarget": { required: ["ambiguous"], optional: ["newAmount"] },
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
  for (const kind of BANKED_FOLLOWUP_KINDS) {
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

/**
 * Each slot must appear verbatim (case aside) at its own place: a literal part may grow or shrink by one
 * letter (one typo) and the last literal may lose its end punctuation, but nothing may absorb a slot's change.
 */
function slotsInPlace(parts: readonly Part[], text: string): boolean {
  const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = parts
    .map((part, i) => {
      if (part.slot) return escape(part.text);
      const min = i === parts.length - 1 ? 0 : Math.max(0, part.text.length - 1);
      return `[\\s\\S]{${min},${part.text.length + 1}}`;
    })
    .join("");
  return new RegExp(`^${pattern}$`, "i").test(text);
}

check("slotsInPlace accepts a typo in a literal and rejects one in a slot or a moved slot", () => {
  const parts: Part[] = [
    { text: "add ", slot: false },
    { text: "coffee", slot: true },
    { text: " to ", slot: false },
    { text: "Food & Dining", slot: true },
    { text: " please.", slot: false },
  ];
  assert.ok(slotsInPlace(parts, "add coffee to Food & Dining please."));
  assert.ok(slotsInPlace(parts, "add coffee to food & dining pleese"));
  assert.ok(slotsInPlace(parts, "ad coffee to Food & Dining please."));
  assert.ok(!slotsInPlace(parts, "add cofefe to Food & Dining please."));
  assert.ok(!slotsInPlace(parts, "add coffee to Food & Dinning please."));
  assert.ok(!slotsInPlace(parts, "add coffee coffee to Food & Dining please."));
  assert.ok(!slotsInPlace(parts, "coffee to Food & Dining please."));
});

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
        assert.ok(slotsInPlace(parts, styled.text), `a slot moved or was misspelt in "${styled.text}"`);
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

function plannerInput(persona: Persona, sessionSeed: string, options: { now?: Date; focusShare?: number } = {}): PlannerInput {
  const now = options.now ?? TEST_NOW;
  return {
    sessionSeed,
    styleKey: persona.id,
    archetype: persona.archetype,
    mix: INTENT_MIX[persona.archetype],
    data: assistantData(persona, now),
    planNow: now,
    focusShare: options.focusShare ?? ASSISTANT_FOCUS_SHARE,
  };
}

function plannerFor(persona: Persona, sessionSeed: string, options: { now?: Date; focusShare?: number } = {}): AssistantPlanner {
  return createAssistantPlanner(plannerInput(persona, sessionSeed, options));
}

function firstOpener(planner: AssistantPlanner): Turn {
  return planner.nextAction().threads[0].turns[0];
}

function sessionTurns(planner: AssistantPlanner): Turn[] {
  const turns: Turn[] = [];
  while (planner.turnsLeft() > 0) {
    for (const thread of planner.nextAction().threads) turns.push(...thread.turns);
  }
  return turns;
}

function personasOf(archetype: Archetype): Persona[] {
  return PERSONAS.filter((persona) => persona.archetype === archetype);
}

check("searchText keeps one searchable word, or the phrase when the first word is short", () => {
  assert.strictEqual(searchText("Coffee"), "coffee");
  assert.strictEqual(searchText("Uber ride"), "uber");
  assert.strictEqual(searchText("Gas fill-up"), "gas fill-up");
});

check("focusCell walks the 28 cells in order, one per UTC day", () => {
  const seen = new Set<string>();
  for (let day = 0; day < 28; day++) {
    const cell = focusCell(new Date(Date.UTC(2026, 8, 1, 23, 59) + day * 86_400_000));
    seen.add(`${cell.intent}/${cell.shape}`);
  }
  assert.strictEqual(seen.size, 28);
  assert.deepStrictEqual(focusCell(new Date("2026-09-04T00:00:00.000Z")), focusCell(new Date("2026-09-04T23:59:59.999Z")));
});

check("same session seed, persona and date give the same full session of turns; 100 seeds give 90+ distinct first turns (AC3)", () => {
  const persona = PERSONAS[0];
  const first = sessionTurns(plannerFor(persona, "session:2026-09-04T10:00:00.000Z:1"));
  const second = sessionTurns(plannerFor(persona, "session:2026-09-04T10:00:00.000Z:1"));
  assert.strictEqual(first.length, ASSISTANT_TURNS_PER_SESSION_MAX);
  assert.deepStrictEqual(first, second);
  const texts = new Set(Array.from({ length: 100 }, (_, i) => firstOpener(plannerFor(persona, `session:x:${i}`)).text));
  assert.ok(texts.size >= 90, `only ${texts.size} distinct first turns`);
});

/** Input fields an Rng could be passed through; must stay empty so the session's action RNG cannot reach the planner. */
type PlannerRngFields = { [K in keyof PlannerInput]-?: Rng extends NonNullable<PlannerInput[K]> ? K : never }[keyof PlannerInput];
const PLANNER_TAKES_NO_RNG: [PlannerRngFields] extends [never] ? true : false = true;

check("turn text never depends on the session's action RNG, even when handed it advanced and drawn from between actions (AC4)", () => {
  assert.ok(PLANNER_TAKES_NO_RNG);
  const persona = PERSONAS[3];
  const seed = "session:2026-09-04T10:00:00.000Z:7";
  const untouched = sessionTurns(plannerFor(persona, seed));
  // run.ts seeds ctx.rng from the same session seed string.
  const actionRng = makeRng(seed);
  for (let i = 0; i < 1000; i++) actionRng.next();
  const handedRng = { ...plannerInput(persona, seed), rng: actionRng };
  const planner = createAssistantPlanner(handedRng);
  const turns: Turn[] = [];
  while (planner.turnsLeft() > 0) {
    for (let i = actionRng.int(1, 50); i > 0; i--) actionRng.next();
    for (const thread of planner.nextAction().threads) turns.push(...thread.turns);
  }
  assert.deepStrictEqual(turns, untouched);
});

check("opener intent shares match the archetype mix within 3 points with focus off (AC5)", () => {
  for (const archetype of ARCHETYPE_LIST) {
    const members = personasOf(archetype);
    const turns = Array.from({ length: 3000 }, (_, i) => firstOpener(plannerFor(members[i % members.length], `mix:${archetype}:${i}`, { focusShare: 0 })));
    for (const intent of INTENTS) {
      const share = (turns.filter((t) => t.intent === intent).length / turns.length) * 100;
      const target = INTENT_MIX[archetype][intent];
      if (target === 0) assert.strictEqual(share, 0, `${archetype} drew zero-weight ${intent}`);
      assert.ok(Math.abs(share - target) <= 3, `${archetype}.${intent}: ${share.toFixed(1)}% vs ${target}%`);
    }
  }
});

const FOCUS_DAYS = Array.from({ length: 28 }, (_, day) => new Date(Date.UTC(2026, 8, 1) + day * 86_400_000));

function isCell(turn: Turn, cell: { intent: Intent; shape: string }): boolean {
  return turn.intent === cell.intent && turn.shape === cell.shape;
}

check("the focus cell wins every opener a persona can take it in, so 28 days cover all 28 cells (AC6)", () => {
  const seen = new Set<string>();
  for (const now of FOCUS_DAYS) {
    const focus = focusCell(now);
    let hits = 0;
    PERSONAS.forEach((persona, i) => {
      const turn = firstOpener(plannerFor(persona, `session:${now.toISOString()}:${i + 1}`, { now, focusShare: 1 }));
      const eligible = INTENT_MIX[persona.archetype][focus.intent] > 0 && cellFillable(focus, assistantData(persona, now));
      if (!eligible) assert.ok(!isCell(turn, focus), `${persona.id} cannot take ${focus.intent}/${focus.shape} yet drew it`);
      // An invalid scope may move to a sibling shape of the same intent when the focus shape names nothing to get wrong.
      else if (!isCell(turn, focus)) assert.ok(turn.intent === focus.intent && turn.scopeLabel !== "valid", `${persona.id} skipped focus for ${turn.intent}/${turn.shape}`);
      if (isCell(turn, focus)) hits++;
    });
    assert.ok(hits >= 1, `${now.toISOString().slice(0, 10)}: no persona can take focus ${focus.intent}/${focus.shape}`);
    seen.add(`${focus.intent}/${focus.shape}`);
  }
  assert.strictEqual(seen.size, 28);
});

check("at the real focus share, 28 days of fleet openers draw every cell and each day's focus cell (AC6)", () => {
  const seen = new Set<string>();
  for (const now of FOCUS_DAYS) {
    const focus = focusCell(now);
    let hits = 0;
    // Ten sessions per persona a day keeps the expected focus hits far above zero, so a change in draw order cannot flip this check.
    for (let session = 0; session < 10; session++) {
      PERSONAS.forEach((persona, i) => {
        const turn = firstOpener(plannerFor(persona, `session:${now.toISOString()}:${session}:${i + 1}`, { now }));
        seen.add(`${turn.intent}/${turn.shape}`);
        if (isCell(turn, focus)) hits++;
      });
    }
    assert.ok(hits >= 1, `${now.toISOString().slice(0, 10)}: focus ${focus.intent}/${focus.shape} never drawn`);
  }
  assert.strictEqual(seen.size, 28, `cells never drawn: ${CELLS.map((c) => `${c.intent}/${c.shape}`).filter((k) => !seen.has(k))}`);
});

check("valid openers pass isScopeValid, invalid ones fail it, at the archetype's rate (AC7)", () => {
  const tallies = new Map<Archetype, { inScope: number; invalid: number }>();
  for (const persona of PERSONAS) {
    const data = assistantData(persona);
    const tally = tallies.get(persona.archetype) ?? { inScope: 0, invalid: 0 };
    for (let i = 0; i < 500; i++) {
      const turn = firstOpener(plannerFor(persona, `valid:${persona.id}:${i}`));
      const ok = isScopeValid(turn.scope, data);
      assert.strictEqual(ok, turn.scopeLabel === "valid", `${turn.scopeLabel} turn "${turn.text}" validated as ${ok}`);
      if (turn.scopeLabel !== "valid") assert.deepStrictEqual(turn.expect, NO_WRITES);
      if (IN_SCOPE_INTENTS.includes(turn.intent)) {
        tally.inScope++;
        if (turn.scopeLabel !== "valid") tally.invalid++;
      } else {
        assert.strictEqual(turn.scopeLabel, "valid", `off-path ${turn.intent} got an invalid scope`);
      }
    }
    tallies.set(persona.archetype, tally);
  }
  for (const [archetype, tally] of tallies) {
    const share = (tally.invalid / tally.inScope) * 100;
    const target = ARCHETYPE_STYLE[archetype].invalidScope * 100;
    assert.ok(Math.abs(share - target) <= 3, `${archetype} invalid share ${share.toFixed(1)}% vs ${target}%`);
  }
});

check("valid openers name only the persona's own categories, custom ones included (AC8)", () => {
  const persona = PERSONAS.find((p) => buildSeedData(p, TEST_NOW).categories.some((c) => !c.isDefault));
  assert.ok(persona, "no persona has a custom category");
  const data = assistantData(persona);
  const own = new Set(data.categories.map((c) => c.name.toLowerCase()));
  const custom = new Set(buildSeedData(persona, TEST_NOW).categories.filter((c) => !c.isDefault).map((c) => c.name));
  let namedCustom = 0;
  for (let i = 0; i < 400; i++) {
    for (const turn of sessionTurns(plannerFor(persona, `own:${i}`))) {
      if (turn.scopeLabel !== "valid") continue;
      for (const name of [turn.scope.category, turn.scope.newCategory]) {
        if (name === undefined) continue;
        assert.ok(own.has(name.toLowerCase()), `"${name}" is not in ${persona.username}'s workspace`);
        if (custom.has(name)) namedCustom++;
      }
    }
  }
  assert.ok(namedCustom >= 1, "no valid turn named a custom category");
});

check("5,000 fleet openers give 1,500+ distinct texts, none above 2% (AC10)", () => {
  const counts = new Map<string, number>();
  for (let i = 0; i < 5000; i++) {
    const text = firstOpener(plannerFor(PERSONAS[i % PERSONAS.length], `fleet:${i}`)).text;
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  assert.ok(counts.size >= 1500, `only ${counts.size} distinct openers`);
  const top = Math.max(...counts.values());
  assert.ok(top / 5000 <= 0.02, `most common opener is ${((top / 5000) * 100).toFixed(1)}%`);
});

check("new visitors never get cells an empty workspace cannot fill; the fallback is spendSummary/all this month", () => {
  const data = newVisitorPromptData(TEST_NOW);
  for (let i = 0; i < 2000; i++) {
    const turn = firstOpener(
      createAssistantPlanner({ sessionSeed: `nv:${i}`, styleKey: `nv:${i}`, archetype: "explorer", mix: INTENT_MIX.explorer, data, planNow: TEST_NOW, focusShare: ASSISTANT_FOCUS_SHARE }),
    );
    assert.ok(!["editTransaction", "deleteTransaction"].includes(turn.intent), `new visitor got ${turn.intent}`);
    assert.ok(!(turn.intent === "clarify" && turn.shape === "ambiguousTarget"));
    assert.ok(!(turn.intent === "findTransactions" && (turn.shape === "text" || turn.shape === "amountRange")));
    assert.strictEqual(isScopeValid(turn.scope, data), turn.scopeLabel === "valid", turn.text);
  }
  const onlyEdits: Record<Intent, number> = { ...INTENT_MIX.power };
  for (const intent of INTENTS) onlyEdits[intent] = intent === "editTransaction" ? 100 : 0;
  assert.strictEqual(drawCell(makeRng("fallback"), onlyEdits, data), null);
  let validFallbacks = 0;
  for (let i = 0; i < 40; i++) {
    const turn = firstOpener(createAssistantPlanner({ sessionSeed: `fb:${i}`, styleKey: `fb:${i}`, archetype: "power", mix: onlyEdits, data, planNow: TEST_NOW, focusShare: 0 }));
    assert.strictEqual(`${turn.intent}/${turn.shape}`, "spendSummary/all");
    if (turn.scopeLabel === "valid") {
      assert.strictEqual(turn.period, "thisMonth");
      validFallbacks++;
    }
  }
  assert.ok(validFallbacks > 0);
});

check("follow-ups keep validity labels and expectations honest, and every follow-up kind is reachable", () => {
  const kinds = new Set<string>();
  const pickParents = new Set<string>();
  for (const persona of PERSONAS) {
    const data = assistantData(persona);
    for (let i = 0; i < 60; i++) {
      const planner = plannerFor(persona, `follow:${persona.id}:${i}`);
      while (planner.turnsLeft() > 0) {
        for (const thread of planner.nextAction().threads) {
          thread.turns.forEach((turn, index) => {
            assert.strictEqual(isScopeValid(turn.scope, data), turn.scopeLabel === "valid", `${turn.kind} "${turn.text}" is ${turn.scopeLabel}`);
            if (turn.scopeLabel !== "valid") assert.deepStrictEqual(turn.expect, NO_WRITES);
            if (index === 0) return;
            kinds.add(turn.kind);
            const parent = thread.turns[index - 1];
            if (turn.kind === "followup:thanks") assert.deepStrictEqual(turn.expect, NO_TOOLS);
            if (turn.kind === "followup:answerClarify") assert.ok(["missingAmount", "missingWhat"].includes(parent.shape), parent.shape);
            if (turn.kind === "followup:pickCandidate") {
              assert.strictEqual(parent.shape, "ambiguousTarget");
              const edit = parent.scope.newAmount !== undefined;
              assert.deepStrictEqual(turn.expect.must, [edit ? "updateTransaction" : "deleteTransaction"], `"${parent.text}" -> "${turn.text}"`);
              pickParents.add(edit ? "edit" : "delete");
            }
            if (turn.kind === "followup:amountFix") assert.strictEqual(parent.intent, "addTransaction");
            if (turn.scopeLabel === "valid" && turn.kind === "followup:refine") assert.deepStrictEqual(turn.expect.must, ["findTransactions"]);
          });
        }
      }
    }
  }
  assert.deepStrictEqual([...kinds].sort(), FOLLOWUP_KINDS.map((kind) => `followup:${kind}`).sort());
  assert.deepStrictEqual([...pickParents].sort(), ["delete", "edit"]);
});

check("an ambiguous-target opener either deletes or names the new amount, so its pickCandidate can finish the write", () => {
  for (const t of OPENER_TEMPLATES.filter((template) => template.shape === "ambiguousTarget")) {
    const deletes = /\b(delete|get rid|remove)\b/i.test(t.text);
    assert.notStrictEqual(deletes, t.slots.includes("newAmount"), `"${t.text}" must either delete or carry {newAmount}`);
  }
});

check("register, typo and slot rules hold per archetype, and style is stable per persona (AC9)", () => {
  for (const archetype of ARCHETYPE_LIST) {
    const members = personasOf(archetype);
    const turns: Turn[] = [];
    for (let i = 0; turns.length < 2000; i++) turns.push(...sessionTurns(plannerFor(members[i % members.length], `style:${archetype}:${i}`)));
    const registered = turns.filter((t) => t.register !== "any");
    const share = (register: Register): number => registered.filter((t) => t.register === register).length / registered.length;
    const kept = turns.filter((t) => t.typo === "kept").length / turns.length;
    if (archetype === "power") {
      assert.ok(share("terse") >= 0.6, `power terse share ${share("terse")}`);
      assert.ok(kept <= 0.04, `power kept-typo rate ${kept}`);
    }
    if (archetype === "casual") {
      assert.ok(share("chatty") >= 0.5, `casual chatty share ${share("chatty")}`);
      assert.ok(kept >= 0.1, `casual kept-typo rate ${kept}`);
    }
    for (const turn of turns) {
      assert.ok(slotsInPlace(turn.rendered, turn.text), `a slot moved or was misspelt in "${turn.text}"`);
      assert.strictEqual(typedResult(turn.typing), turn.text, `keystrokes do not replay "${turn.text}"`);
      const { min, max } = ARCHETYPE_STYLE[archetype].charDelayMs;
      assert.ok(turn.charDelayMs >= min && turn.charDelayMs <= max, `${archetype} delay ${turn.charDelayMs}`);
    }
  }
  for (const persona of PERSONAS) {
    const a = plannerFor(persona, "s:1", { now: new Date("2026-09-04T00:00:00.000Z") }).style;
    const b = plannerFor(persona, "s:2", { now: new Date("2026-09-20T00:00:00.000Z") }).style;
    assert.deepStrictEqual(a, b, `${persona.username}'s style changed between dates`);
  }
});

/** Two adjacent equal words ("Income income", "in in") where the template, not the persona's own data, supplied one. */
function templateDoubledWord(parts: readonly Part[]): string | null {
  const words = parts.flatMap((part) => (part.text.toLowerCase().match(/[a-z0-9]+/g) ?? []).map((word) => ({ word, slot: part.slot })));
  for (let i = 1; i < words.length; i++) {
    const [a, b] = [words[i - 1], words[i]];
    if ((a.word === b.word || `${a.word}s` === b.word) && !(a.slot && b.slot)) return `${a.word} ${b.word}`;
  }
  return null;
}

check("generated text never doubles a template word or puts a preposition before a period label", () => {
  for (const persona of PERSONAS) {
    for (let i = 0; i < 100; i++) {
      for (const turn of sessionTurns(plannerFor(persona, `grammar:${persona.id}:${i}`))) {
        assert.strictEqual(templateDoubledWord(turn.rendered), null, `"${turn.text}" doubles a word`);
        assert.ok(!/\b(?:for|show) (?:in|since|today|yesterday|this|last|next)\b/i.test(turn.text), `"${turn.text}" has a preposition before its period`);
      }
    }
  }
  assert.strictEqual(templateDoubledWord([{ text: "Other Income", slot: true }, { text: " income", slot: false }]), "income income");
  assert.strictEqual(templateDoubledWord([{ text: "work reimbursement", slot: true }, { text: " ", slot: false }, { text: "Reimbursement", slot: true }]), null);
});

check("planner caps hold over 10,000 sessions and generated text is safe to type and log (AD6, AC12, RF1)", () => {
  const banned = [/@/, /sk-/i, /http/i, /www\./i, /\d{12,}/, /["\n\r{}[\]]/];
  const identities = PERSONAS.flatMap((p) => [...p.displayName.split(" "), p.username]).map((word) => word.toLowerCase());
  let turnsChecked = 0;
  for (let s = 0; s < 10000; s++) {
    const persona = PERSONAS[s % PERSONAS.length];
    const planner = plannerFor(persona, `caps:${s}`);
    let session = 0;
    // Every action while turns are left sends at least one, so this many always spends the session cap.
    for (let a = 0; a < ASSISTANT_TURNS_PER_SESSION_MAX + 2; a++) {
      const plan = planner.nextAction();
      const actionTurns = plan.threads.reduce((sum, thread) => sum + thread.turns.length, 0);
      assert.ok(actionTurns <= ASSISTANT_TURNS_PER_ACTION_MAX, `action with ${actionTurns} turns`);
      for (const thread of plan.threads) {
        assert.ok(thread.turns.length >= 1, "an empty thread");
        const max = ARCHETYPE_STYLE[persona.archetype].followUpsMax;
        assert.ok(thread.turns.length - 1 <= max, `${persona.archetype} thread with ${thread.turns.length - 1} follow-ups, max ${max}`);
        assert.strictEqual(thread.turns[0].kind, "opener");
        if (turnsChecked >= 10000) continue;
        for (const turn of thread.turns) {
          turnsChecked++;
          assert.ok(turn.text.length > 0 && turn.text.length <= ASSISTANT_PROMPT_MAX_CHARS, `bad length: "${turn.text}"`);
          for (const pattern of banned) assert.ok(!pattern.test(turn.text), `"${turn.text}" matches ${pattern}`);
          assert.ok(!turn.text.includes(PERSONA_PASSWORD));
          const words = new Set(turn.text.toLowerCase().split(/[^a-z0-9_]+/));
          for (const identity of identities) assert.ok(!words.has(identity), `"${turn.text}" names "${identity}"`);
        }
      }
      session += actionTurns;
    }
    assert.ok(session <= ASSISTANT_TURNS_PER_SESSION_MAX, `session with ${session} turns`);
    assert.strictEqual(planner.turnsLeft(), ASSISTANT_TURNS_PER_SESSION_MAX - session);
  }
  assert.strictEqual(turnsChecked, 10000);
});

check("the turn log line has the exact req 20 shape", () => {
  const turn = firstOpener(plannerFor(PERSONAS[0], "line:1"));
  const line = formatTurnLine(1, 3, turn, ["getSpendingSummary", "findTransactions"], "match");
  assert.match(
    line,
    /^askAssistant: turn 1\/3 intent=\w+ shape=\w+ scope=(valid|invalid:\w+) period=[\w-]+ kind=(opener|followup:\w+) expect=[\w|]+ got=\[getSpendingSummary,findTransactions\] verdict=match send=(enter|click) text=".+"$/,
  );
  assert.ok(line.endsWith(` send=${turn.send} text="${turn.text}"`));
  assert.ok(formatTurnLine(1, 1, { ...turn, send: "click" }, [], "match").includes(" verdict=match send=click text="));
  assert.ok(formatTurnLine(1, 1, { ...turn, send: "enter" }, [], "match").includes(" verdict=match send=enter text="));
  const anyOf = formatTurnLine(2, 2, { ...turn, expect: { must: ["addTransaction", "updateTransaction"], forbid: [] } }, [], "miss");
  assert.ok(anyOf.includes(" expect=addTransaction|updateTransaction got=[] verdict=miss "), anyOf);
  assert.ok(formatTurnLine(1, 1, { ...turn, expect: NO_TOOLS }, [], "match").includes(" expect=none "));
  assert.ok(formatTurnLine(1, 1, turn, ["addTransaction"], "error").includes(" got=[addTransaction] verdict=error "));
  assert.ok(formatTurnLine(1, 1, turn, null, "error").includes(` got=? verdict=error send=${turn.send} text=`));
});

check("summarizeAssistant counts in-scope matches over valid, answered turns only", () => {
  const records: TurnRecord[] = [
    { intent: "spendSummary", scopeLabel: "valid", verdict: "match" },
    { intent: "spendSummary", scopeLabel: "valid", verdict: "miss" },
    { intent: "spendSummary", scopeLabel: "invalid:period", verdict: "match" },
    { intent: "addTransaction", scopeLabel: "valid", verdict: "unavailable" },
    { intent: "offTopic", scopeLabel: "valid", verdict: "overreach" },
    { intent: "addTransaction", scopeLabel: "valid", verdict: "error" },
  ];
  const summary = summarizeAssistant(records, 2);
  assert.deepStrictEqual(
    {
      turns: summary.turns,
      unavailable: summary.unavailable,
      errors: summary.errors,
      capSkips: summary.capSkips,
      judged: summary.inScopeJudged,
      match: summary.inScopeMatch,
    },
    { turns: 6, unavailable: 1, errors: 1, capSkips: 2, judged: 2, match: 1 },
  );
  assert.deepStrictEqual(summary.rows.map((r) => r.intent), ["spendSummary", "addTransaction", "offTopic"]);
  assert.deepStrictEqual(summary.rows[0], { intent: "spendSummary", turns: 3, match: 2, miss: 1, overreach: 0, unavailable: 0, error: 0 });
  assert.deepStrictEqual(summary.rows[1], { intent: "addTransaction", turns: 2, match: 0, miss: 0, overreach: 0, unavailable: 1, error: 1 });
  const empty = summarizeAssistant([], 0);
  assert.deepStrictEqual({ turns: empty.turns, rows: empty.rows.length }, { turns: 0, rows: 0 });
});

check("the match rate never prints NaN (RF4)", () => {
  assert.strictEqual(formatMatchRate(0, 0), "0/0 (n/a)");
  assert.strictEqual(formatMatchRate(18, 24), "18/24 (75%)");
  assert.strictEqual(formatMatchRate(2, 3), "2/3 (67%)");
  const allUnavailable = summarizeAssistant([{ intent: "spendSummary", scopeLabel: "valid", verdict: "unavailable" }], 0);
  assert.strictEqual(formatMatchRate(allUnavailable.inScopeMatch, allUnavailable.inScopeJudged), "0/0 (n/a)");
});

check("the run summary's assistant block totals every session and never prints NaN", () => {
  assert.deepStrictEqual(formatAssistantBlock([]), [
    "",
    "assistant turns   0 (0 unavailable, 0 error, 0 action(s) cut by the run turn cap)",
    "run turn cap      not reached (60)",
    "in-scope match    0/0 (n/a)",
  ]);
  const lines = formatAssistantBlock([
    { turns: [{ intent: "spendSummary", scopeLabel: "valid", verdict: "match" }, { intent: "offTopic", scopeLabel: "valid", verdict: "error" }], capSkips: 1, capReached: false },
    { turns: [{ intent: "spendSummary", scopeLabel: "valid", verdict: "miss" }, { intent: "addTransaction", scopeLabel: "valid", verdict: "unavailable" }], capSkips: 0, capReached: true },
  ]);
  assert.strictEqual(lines[1], "assistant turns   4 (1 unavailable, 1 error, 1 action(s) cut by the run turn cap)");
  assert.strictEqual(lines[2], "run turn cap      reached (60)");
  assert.strictEqual(lines[3], "in-scope match    1/2 (50%)");
  const table = lines.slice(5).join("\n").split("\n");
  assert.match(table[0], /^intent\s+turns\s+match\s+miss\s+overreach\s+unavailable\s+error$/);
  assert.match(table[2], /^spendSummary\s+2\s+1\s+1\s+0\s+0\s+0$/);
  assert.match(table[3], /^addTransaction\s+1\s+0\s+0\s+0\s+1\s+0$/);
  assert.match(table[4], /^offTopic\s+1\s+0\s+0\s+0\s+0\s+1$/);
});

check("the run turn cap announces its last slot, then refuses; only an action that sent nothing is a skip", () => {
  const cap = { used: 58, max: 60 };
  assert.deepStrictEqual([takeRunTurn(cap), takeRunTurn(cap), takeRunTurn(cap), takeRunTurn(cap)], ["sent", "last", "refused", "refused"]);
  assert.strictEqual(cap.used, 60);
  assert.deepStrictEqual([takeRunTurn({ used: 0, max: 1 })], ["last"]);
  assert.strictEqual(takeRunTurn({ used: 0, max: 0 }), "refused");
  assert.strictEqual(runCapCutLine(0), "skipped:askAssistant (run turn cap)");
  assert.strictEqual(runCapCutLine(2), "askAssistant: run turn cap cut this action after 2 turn(s)");
  assert.ok(!runCapCutLine(1).startsWith("skipped:"), "an action that sent a turn would drop out of actions performed");
});

check("only Pendo event beacons are counted (RF5)", () => {
  const key = "5b81f2bb-e7bb-4070-8618-ac0dc1d8c185";
  const cases: [string, boolean][] = [
    [`https://data.pendo-dev.pendo-dev.com/data/ptm.gif/${key}?v=2.346.0&ct=1`, true],
    [`https://app.pendo.io/data/ptm.gif/${key}`, true],
    [`https://data.pendo-dev.pendo-dev.com/data/guide.json/${key}`, false],
    [`https://data.pendo-dev.pendo-dev.com/data/recordingconf/${key}`, false],
    [`https://data.pendo-dev.pendo-dev.com/data/rec/${key}`, false],
    [`https://cdn.pendo-dev.pendo-dev.com/agent/static/${key}/pendo.js`, false],
    [`https://expense-tracker-data-gen.vercel.app/data/ptm.gif/${key}`, false],
    ["https://expense-tracker-data-gen.vercel.app/api/chat", false],
    ["data:image/gif;base64,R0lGOD", false],
  ];
  for (const [url, wanted] of cases) assert.strictEqual(isPendoBeacon(url), wanted, url);
});

check("Pendo ids: returning sessions must match the seed, new visitors only need ids (RF5)", () => {
  const seeded = { visitorId: "user-1", accountId: "ws-1" };
  assert.deepStrictEqual(comparePendoIds(seeded, seeded), { visitor: "match", account: "match" });
  assert.deepStrictEqual(comparePendoIds({ visitorId: "user-1", accountId: "ws-2" }, seeded), { visitor: "match", account: "mismatch" });
  assert.deepStrictEqual(comparePendoIds({ visitorId: "", accountId: "" }, seeded), { visitor: "mismatch", account: "mismatch" });
  assert.deepStrictEqual(comparePendoIds({ visitorId: "fresh-user", accountId: "fresh-ws" }, null), { visitor: "match", account: "match" });
  assert.deepStrictEqual(comparePendoIds({ visitorId: "fresh-user", accountId: "" }, null), { visitor: "match", account: "mismatch" });
  assert.strictEqual(formatPendoReading({ status: "ready", visitor: "match", account: "mismatch" }), "pendo: ready visitor=match account=mismatch");
  assert.strictEqual(formatPendoReading({ status: "not-ready" }), "pendo: not ready after 15000ms (data-quality warning)");
  assert.strictEqual(formatBeaconLine(12, 5), "pendo: 12 beacons");
  assert.strictEqual(formatBeaconLine(0, 0), "pendo: 0 beacons");
  assert.strictEqual(formatBeaconLine(0, 3), "pendo: 0 beacons (data-quality warning: 3 action(s) ran)");
});

const pendoCheckLines: string[] = [];
const pendoCheckReadings = [
  await checkPendo(async () => { throw new Error("page.evaluate: Execution context was destroyed\n    at stack"); }, null, (msg) => pendoCheckLines.push(msg)),
  await checkPendo(() => Promise.reject("not an Error"), null, (msg) => pendoCheckLines.push(msg)),
  await checkPendo(async () => "not-ready", null, (msg) => pendoCheckLines.push(msg)),
  await checkPendo(async () => ({ visitorId: "fresh-user", accountId: "fresh-ws" }), null, (msg) => pendoCheckLines.push(msg)),
];

check("a Pendo read that throws is logged as a data-quality warning, never rethrown (R4)", () => {
  assert.deepStrictEqual(pendoCheckReadings, [
    { status: "failed", reason: "page.evaluate: Execution context was destroyed" },
    { status: "failed", reason: "not an Error" },
    { status: "not-ready" },
    { status: "ready", visitor: "match", account: "match" },
  ]);
  assert.deepStrictEqual(pendoCheckLines, [
    "pendo: check failed (page.evaluate: Execution context was destroyed) (data-quality warning)",
    "pendo: check failed (not an Error) (data-quality warning)",
    "pendo: not ready after 15000ms (data-quality warning)",
    "pendo: ready visitor=match account=match",
  ]);
  assert.deepStrictEqual(formatPendoBlock([{ reading: pendoCheckReadings[0], beacons: 3 }]).slice(1), ["pendo ready       0/1 session(s), 0 with an id mismatch", "pendo beacons     3 total, 0 session(s) with none"]);
});

check("the run summary's pendo block counts ready sessions, mismatches, beacons and silent sessions", () => {
  assert.deepStrictEqual(formatPendoBlock([]), ["", "pendo ready       0/0 session(s), 0 with an id mismatch", "pendo beacons     0 total, 0 session(s) with none"]);
  const lines = formatPendoBlock([
    { reading: { status: "ready", visitor: "match", account: "match" }, beacons: 20 },
    { reading: { status: "ready", visitor: "match", account: "mismatch" }, beacons: 4 },
    { reading: { status: "not-ready" }, beacons: 0 },
    { reading: { status: "unchecked" }, beacons: 0 },
  ]);
  assert.deepStrictEqual(lines, ["", "pendo ready       2/4 session(s), 1 with an id mismatch", "pendo beacons     24 total, 2 session(s) with none"]);
});

// --- Pure usage ------------------------------------------------------------------

const BOT_DIR = path.dirname(fileURLToPath(import.meta.url));

/** From `start` up to (not including) `end`, or to the end of the file. */
function between(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  if (from < 0) return "";
  const to = source.indexOf(end, from + start.length);
  return source.slice(from, to < 0 ? source.length : to);
}

type SourceRegion = (source: string) => string;
const WHOLE_FILE: SourceRegion = (source) => source;
const PREPARE_PAGE: SourceRegion = (source) => between(source, "export async function preparePage(", "\n}\n");
const READ_PENDO_STATE: SourceRegion = (source) => between(source, "async function readPendoState(", "\n}\n");
const ASSISTANT_SECTION: SourceRegion = (source) => between(source, "// --- Assistant", "// --- Reading and leaving");

interface UsageRule {
  name: string;
  /** Needs the `g` flag: matches are counted. */
  pattern: RegExp;
  /** The only file regions where a match is allowed; none means nowhere. */
  allowed?: Readonly<Record<string, SourceRegion>>;
}

const USAGE_RULES: readonly UsageRule[] = [
  { name: "calls a Pendo write method", pattern: /(?<![\w$])(?:track|identify|initialize|pageLoad|clearSession|updateOptions|trackAgent)\s*(?:\?\.)?\s*\(/g },
  { name: "calls a method by its string name", pattern: /\[\s*["'`][\w$]+["'`]\s*\]\s*(?:\?\.)?\s*\(/g },
  { name: "intercepts requests", pattern: /\.\s*(?:route|routeFromHAR|routeWebSocket)\s*\(/g },
  { name: "dispatches a synthetic event", pattern: /dispatchEvent/g },
  { name: "forces an action", pattern: /\bforce["']?\s*:(?!\s*false\b)/g },
  { name: "calls fetch", pattern: /(?<![\w$])fetch\s*\(/g },
  { name: "uses Playwright's request API", pattern: /\.\s*request\b|\brequest\s*\.\s*newContext|APIRequestContext/g },
  { name: "opens its own connection", pattern: /\b(?:XMLHttpRequest|sendBeacon|WebSocket|EventSource)\b/g },
  { name: "names an /api/ path", pattern: /\/api\//g },
  { name: "exposes a Node function to the page", pattern: /(?<![\w$])(?:exposeFunction|exposeBinding)\s*\(/g },
  { name: "runs a page script", pattern: /(?<![\w$])(?:\$\$?eval|evaluateAll|evaluateHandle|addScriptTag)\s*(?:\?\.)?\s*\(/g },
  { name: "runs evaluate( outside its allowed place", pattern: /(?<![\w$])evaluate\s*(?:\?\.)?\s*\(/g, allowed: { "seed.ts": WHOLE_FILE, "run.ts": READ_PENDO_STATE } },
  { name: "runs waitForFunction( outside its allowed place", pattern: /(?<![\w$])waitForFunction\s*(?:\?\.)?\s*\(/g, allowed: { "run.ts": READ_PENDO_STATE } },
  { name: "runs addInitScript( outside its allowed place", pattern: /(?<![\w$])addInitScript\s*(?:\?\.)?\s*\(/g, allowed: { "actions.ts": PREPARE_PAGE } },
  { name: "opens a CDP session outside its allowed place", pattern: /(?<![\w$])newCDPSession\s*(?:\?\.)?\s*\(/g, allowed: { "seed.ts": WHOLE_FILE } },
  { name: "touches window.pendo outside readPendoState", pattern: /\b(?:window|globalThis|self)\b[^\n;]{0,60}\bpendo\b/g, allowed: { "run.ts": READ_PENDO_STATE } },
];

const FILL_CALL = /\.\s*fill\s*(?:\?\.)?\s*\(/;
const MEMBER_CALL = /\.\s*([A-Za-z_$][\w$]*)\s*(?:\?\.)?\s*\(/g;
/** The two page calls readPendoState makes and the agent's three read-only getters. */
const PENDO_READ_CALLS: ReadonlySet<string> = new Set(["waitForFunction", "evaluate", "isReady", "getVisitorId", "getAccountId"]);

function matchCount(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

function fileText(files: ReadonlyMap<string, string>, name: string): string {
  const text = files.get(name);
  if (text === undefined) throw new Error(`${name} was not scanned`);
  return text;
}

/** `files` maps a bot source name to its text; selftest.ts is left out because it holds these patterns as data. */
function pureUsageViolations(files: ReadonlyMap<string, string>): string[] {
  const violations: string[] = [];
  for (const [file, source] of files) {
    for (const rule of USAGE_RULES) {
      const region = rule.allowed?.[file];
      const allowed = region === undefined ? 0 : matchCount(region(source), rule.pattern);
      if (matchCount(source, rule.pattern) !== allowed) violations.push(`"${file}" ${rule.name}`);
    }
  }
  for (const [, name] of READ_PENDO_STATE(fileText(files, "run.ts")).matchAll(MEMBER_CALL)) {
    if (!PENDO_READ_CALLS.has(name)) violations.push(`"run.ts" readPendoState calls ".${name}("`);
  }
  const prompts = fileText(files, "assistant-prompts.ts");
  if (FILL_CALL.test(prompts)) violations.push('"assistant-prompts.ts" calls .fill(');
  if (/from\s*["']playwright/.test(prompts)) violations.push('"assistant-prompts.ts" imports playwright');
  if (FILL_CALL.test(ASSISTANT_SECTION(fileText(files, "actions.ts")))) violations.push('"actions.ts" assistant section calls .fill(');
  return violations;
}

const CLEAN_FIXTURE: ReadonlyMap<string, string> = new Map([
  ["seed.ts", 'await page.evaluate(async () => {});\nconst cdp = await page.context().newCDPSession(page);\nrequest.onsuccess = () => {};\n'],
  [
    "actions.ts",
    [
      "export async function preparePage(page: Page): Promise<void> {\n  await page.addInitScript(() => {});\n}\n",
      "// keep track of the spend; identify the row\nawait button.click({ force: false });\n",
      "// --- Assistant ---\nawait input.pressSequentially(text);\n// --- Reading and leaving ---\nawait input.fill(text);\n",
    ].join(""),
  ],
  [
    "run.ts",
    [
      "async function readPendoState(page: Page): Promise<void> {\n",
      "  await page.waitForFunction(() => (window as PendoWindow).pendo?.isReady?.() === true);\n",
      "  await page.evaluate(() => {\n    const agent = (window as PendoWindow).pendo;\n    return [agent?.getVisitorId?.(), agent?.getAccountId?.()];\n  });\n}\n",
      'page.on("request", (request) => {\n  if (isPendoBeacon(request.url())) pendo.beacons += 1;\n});\nlog(outcome.pendo);\n',
    ].join(""),
  ],
  ["assistant-prompts.ts", "export const x = 1;"],
]);

function withExtra(file: string, extra: string): Map<string, string> {
  return new Map([...CLEAN_FIXTURE, [file, `${fileText(CLEAN_FIXTURE, file)}\n${extra}\n`]]);
}

/** Puts `extra` inside readPendoState, where page scripts and the Pendo agent are allowed. */
function insideReadPendoState(extra: string): Map<string, string> {
  return new Map([...CLEAN_FIXTURE, ["run.ts", fileText(CLEAN_FIXTURE, "run.ts").replace("  });\n}\n", `  });\n  ${extra}\n}\n`)]]);
}

function insideAssistantSection(extra: string): Map<string, string> {
  return new Map([...CLEAN_FIXTURE, ["actions.ts", fileText(CLEAN_FIXTURE, "actions.ts").replace("// --- Reading", `${extra}\n// --- Reading`)]]);
}

check("the pure-usage scanner allows the clean bootstrap, passive reads and look-alike words", () => {
  assert.deepStrictEqual(pureUsageViolations(CLEAN_FIXTURE), []);
  assert.ok(insideReadPendoState("x").get("run.ts")?.includes("  x\n}\n"), "the readPendoState fixture lost its injection point");
});

check("the pure-usage scanner catches every bypass: aliases, optional chaining, spacing and other APIs (AC14)", () => {
  const ENDS = "await page.evaluate(() => 1);";
  const cases: [Map<string, string>, string][] = [
    [insideReadPendoState('agent.track("x");'), '"run.ts" calls a Pendo write method'],
    [insideReadPendoState('agent?.identify({ visitor: {} });'), '"run.ts" calls a Pendo write method'],
    [insideReadPendoState('agent.track("x");'), '"run.ts" readPendoState calls ".track("'],
    [insideReadPendoState("agent?.getMetadata?.();"), '"run.ts" readPendoState calls ".getMetadata("'],
    [withExtra("run.ts", 'pendo?.track?.("x");'), '"run.ts" calls a Pendo write method'],
    [withExtra("run.ts", 'pendo . trackAgent ("x");'), '"run.ts" calls a Pendo write method'],
    [withExtra("actions.ts", "agent.updateOptions({});"), '"actions.ts" calls a Pendo write method'],
    [withExtra("actions.ts", "pendo.initialize({});"), '"actions.ts" calls a Pendo write method'],
    [withExtra("actions.ts", "pendo.pageLoad();"), '"actions.ts" calls a Pendo write method'],
    [withExtra("actions.ts", "pendo.clearSession();"), '"actions.ts" calls a Pendo write method'],
    [withExtra("run.ts", 'const { track } = agent;\ntrack("x");'), '"run.ts" calls a Pendo write method'],
    [withExtra("run.ts", 'agent["track"]("x");'), '"run.ts" calls a method by its string name'],
    [withExtra("seed.ts", "window.pendo.isReady();"), '"seed.ts" touches window.pendo outside readPendoState'],
    [withExtra("actions.ts", "await page.request.post(url, {});"), "\"actions.ts\" uses Playwright's request API"],
    [withExtra("actions.ts", "await page.request.get(url);"), "\"actions.ts\" uses Playwright's request API"],
    [withExtra("actions.ts", "await page?.request.fetch(url);"), "\"actions.ts\" uses Playwright's request API"],
    [withExtra("actions.ts", "const api = context.request;"), "\"actions.ts\" uses Playwright's request API"],
    [withExtra("run.ts", "await request.newContext();"), "\"run.ts\" uses Playwright's request API"],
    [withExtra("run.ts", "let api: APIRequestContext;"), "\"run.ts\" uses Playwright's request API"],
    [withExtra("run.ts", "await fetch(url);"), '"run.ts" calls fetch'],
    [withExtra("run.ts", "await window.fetch (url);"), '"run.ts" calls fetch'],
    [withExtra("seed.ts", "new XMLHttpRequest();"), '"seed.ts" opens its own connection'],
    [withExtra("seed.ts", "navigator.sendBeacon(url);"), '"seed.ts" opens its own connection'],
    [withExtra("actions.ts", 'await page.goto(APP_URL + "/api/chat");'), '"actions.ts" names an /api/ path'],
    [withExtra("actions.ts", "await page.route(glob, handler);"), '"actions.ts" intercepts requests'],
    [withExtra("actions.ts", "await context.routeFromHAR(file);"), '"actions.ts" intercepts requests'],
    [withExtra("actions.ts", "await page.routeWebSocket(url, handler);"), '"actions.ts" intercepts requests'],
    [withExtra("actions.ts", "await button.dispatchEvent('click');"), '"actions.ts" dispatches a synthetic event'],
    [withExtra("actions.ts", "await button.click({force:true});"), '"actions.ts" forces an action'],
    [withExtra("actions.ts", "await button.click({ force : true });"), '"actions.ts" forces an action'],
    [withExtra("actions.ts", 'await button.click({ "force": 1 });'), '"actions.ts" forces an action'],
    [withExtra("actions.ts", "await page.exposeFunction(name, fn);"), '"actions.ts" exposes a Node function to the page'],
    [withExtra("actions.ts", "await page.exposeBinding(name, fn);"), '"actions.ts" exposes a Node function to the page'],
    [withExtra("actions.ts", "await page.$eval(sel, (el) => el);"), '"actions.ts" runs a page script'],
    [withExtra("actions.ts", "await page.$$eval(sel, (els) => els);"), '"actions.ts" runs a page script'],
    [withExtra("actions.ts", "await rows.evaluateAll((els) => els);"), '"actions.ts" runs a page script'],
    [withExtra("actions.ts", "await page.evaluateHandle(() => 1);"), '"actions.ts" runs a page script'],
    [withExtra("actions.ts", "await page.addScriptTag({ content });"), '"actions.ts" runs a page script'],
    [withExtra("actions.ts", ENDS), '"actions.ts" runs evaluate( outside its allowed place'],
    [withExtra("actions.ts", "await input?.evaluate?.((el) => el);"), '"actions.ts" runs evaluate( outside its allowed place'],
    [withExtra("run.ts", ENDS), '"run.ts" runs evaluate( outside its allowed place'],
    [withExtra("run.ts", "await page.waitForFunction(() => true);"), '"run.ts" runs waitForFunction( outside its allowed place'],
    [insideAssistantSection("await page.addInitScript(() => {});"), '"actions.ts" runs addInitScript( outside its allowed place'],
    [withExtra("actions.ts", "await page.context().newCDPSession(page);"), '"actions.ts" opens a CDP session outside its allowed place'],
    [insideAssistantSection("await input.fill(text);"), '"actions.ts" assistant section calls .fill('],
    [insideAssistantSection("await input?.fill (text);"), '"actions.ts" assistant section calls .fill('],
    [withExtra("assistant-prompts.ts", "input.fill(text);"), '"assistant-prompts.ts" calls .fill('],
    [withExtra("assistant-prompts.ts", 'import type { Page } from "playwright";'), '"assistant-prompts.ts" imports playwright'],
  ];
  for (const [files, wanted] of cases) {
    const found = pureUsageViolations(files);
    assert.ok(found.includes(wanted), `${wanted} not reported; got ${JSON.stringify(found)}`);
  }
});

check("the bot itself passes the pure-usage scan (AC14)", () => {
  const files = new Map(
    readdirSync(BOT_DIR)
      .filter((name) => /\.[cm]?[jt]s$/.test(name) && name !== "selftest.ts")
      .map((name): [string, string] => [name, readFileSync(path.join(BOT_DIR, name), "utf8")]),
  );
  assert.deepStrictEqual(pureUsageViolations(files), []);
  assert.ok(READ_PENDO_STATE(fileText(files, "run.ts")).includes("waitForFunction("), "readPendoState lost its page script, so the region checks prove nothing");
  assert.ok(PREPARE_PAGE(fileText(files, "actions.ts")).includes("addInitScript("), "preparePage moved, so the addInitScript check proves nothing");
  assert.ok(ASSISTANT_SECTION(fileText(files, "actions.ts")).includes("pressSequentially("), "the actions.ts assistant section moved, so the .fill( check proves nothing");
});

check("each archetype clicks Send at its sendClick rate within 3 points over 3,000 turns (AD1)", () => {
  for (const archetype of ARCHETYPE_LIST) {
    const members = personasOf(archetype);
    const turns: Turn[] = [];
    for (let i = 0; turns.length < 3000; i++) turns.push(...sessionTurns(plannerFor(members[i % members.length], `send:${archetype}:${i}`)));
    const share = turns.filter((turn) => turn.send === "click").length / turns.length;
    const target = ARCHETYPE_STYLE[archetype].sendClick;
    assert.ok(Math.abs(share - target) <= 0.03, `${archetype} clicks Send on ${(share * 100).toFixed(1)}% vs ${target * 100}%`);
  }
});

check("follow-up chance and per-thread cap match the D3 table; caps are 6 per action, 10 per session, 60 per run (AD4)", () => {
  const table: Record<Archetype, { followUp: number; followUpsMax: number }> = {
    power: { followUp: 0.75, followUpsMax: 5 },
    regular: { followUp: 0.65, followUpsMax: 4 },
    casual: { followUp: 0.35, followUpsMax: 2 },
    explorer: { followUp: 0.2, followUpsMax: 1 },
    churning: { followUp: 0.1, followUpsMax: 1 },
  };
  for (const archetype of ARCHETYPE_LIST) {
    const { followUp, followUpsMax } = ARCHETYPE_STYLE[archetype];
    assert.deepStrictEqual({ followUp, followUpsMax }, table[archetype], archetype);
  }
  assert.deepStrictEqual([ASSISTANT_TURNS_PER_ACTION_MAX, ASSISTANT_TURNS_PER_SESSION_MAX, ASSISTANT_TURNS_PER_RUN_MAX], [6, 10, 60]);
  const removed = ["ASSISTANT", "FOLLOWUPS", "MAX"].join("_");
  const stale = readdirSync(BOT_DIR).filter(
    (name) => /\.(?:ts|md)$/.test(name) && name !== "selftest.ts" && readFileSync(path.join(BOT_DIR, name), "utf8").includes(removed),
  );
  assert.deepStrictEqual(stale, [], `${removed} is still named`);
});

check("chat length per archetype: power chats longest, churning shortest, explorers mostly stop at one turn (AD5)", () => {
  const means: number[] = [];
  const single = new Map<Archetype, number>();
  let powerLongest = 0;
  for (const archetype of ARCHETYPE_LIST) {
    const members = personasOf(archetype);
    let threads = 0;
    let turns = 0;
    let singles = 0;
    // The first action of a fresh session, so an earlier action's turns never shorten this one.
    for (let i = 0; i < 10000; i++) {
      for (const thread of plannerFor(members[i % members.length], `length:${archetype}:${i}`).nextAction().threads) {
        threads++;
        turns += thread.turns.length;
        if (thread.turns.length === 1) singles++;
        if (archetype === "power") powerLongest = Math.max(powerLongest, thread.turns.length);
      }
    }
    means.push(turns / threads);
    single.set(archetype, singles / threads);
  }
  const [power, regular, casual, explorer, churning] = means;
  const shown = means.map((mean, i) => `${ARCHETYPE_LIST[i]} ${mean.toFixed(2)}`).join(", ");
  assert.ok(power >= 2.2 && regular >= 1.9 && casual >= 1.2 && casual <= 1.7 && explorer <= 1.35 && churning <= 1.2, shown);
  assert.ok(power > regular && regular > casual && casual > explorer && explorer > churning, shown);
  assert.ok((single.get("explorer") ?? 0) >= 0.7, `explorer single-turn share ${single.get("explorer")}`);
  assert.ok((single.get("power") ?? 1) <= 0.4, `power single-turn share ${single.get("power")}`);
  assert.strictEqual(powerLongest, 1 + ARCHETYPE_STYLE.power.followUpsMax);
});

check("nextQuestion follows every parent intent and is labelled and judged like an opener (AD7)", () => {
  const parents = new Set<Intent>();
  let answeredAfterNext = 0;
  let threads = 0;
  for (let i = 0; threads < 10000; i++) {
    const persona = PERSONAS[i % PERSONAS.length];
    const data = assistantData(persona);
    for (const thread of plannerFor(persona, `next:${i}`).nextAction().threads) {
      threads++;
      thread.turns.forEach((turn, index) => {
        if (index === 0) return;
        const parent = thread.turns[index - 1];
        if (turn.kind === "followup:answerClarify" || turn.kind === "followup:pickCandidate") {
          assert.ok(parent.kind === "opener" || parent.kind === "followup:nextQuestion", `${turn.kind} after ${parent.kind}`);
          if (parent.kind === "followup:nextQuestion") answeredAfterNext++;
        }
        if (turn.kind !== "followup:nextQuestion") return;
        parents.add(parent.intent);
        assert.strictEqual(isScopeValid(turn.scope, data), turn.scopeLabel === "valid", `${turn.scopeLabel} nextQuestion "${turn.text}"`);
        assert.deepStrictEqual(turn.expect, turn.scopeLabel === "valid" ? INTENT_EXPECT[turn.intent] : NO_WRITES, turn.text);
      });
    }
  }
  assert.deepStrictEqual([...parents].sort(), [...INTENTS].sort());
  assert.ok(answeredAfterNext > 0, "a clarify asked as a nextQuestion never got its answer");
});

check("a new visitor's whole session, follow-ups included, never needs data an empty workspace lacks", () => {
  const data = newVisitorPromptData(TEST_NOW);
  let followUps = 0;
  for (let i = 0; i < 2000; i++) {
    const planner = createAssistantPlanner({ sessionSeed: `nv-all:${i}`, styleKey: `nv-all:${i}`, archetype: "explorer", mix: INTENT_MIX.explorer, data, planNow: TEST_NOW, focusShare: ASSISTANT_FOCUS_SHARE });
    for (const turn of sessionTurns(planner)) {
      if (turn.kind !== "opener") followUps++;
      assert.ok(!["editTransaction", "deleteTransaction"].includes(turn.intent), `new visitor got ${turn.kind} ${turn.intent}`);
      assert.ok(!(turn.intent === "clarify" && turn.shape === "ambiguousTarget"), turn.text);
      assert.ok(!(turn.intent === "findTransactions" && (turn.shape === "text" || turn.shape === "amountRange")), turn.text);
      assert.strictEqual(isScopeValid(turn.scope, data), turn.scopeLabel === "valid", turn.text);
    }
  }
  assert.ok(followUps > 0);
});

check("abandonPrefix types a strict prefix of 30-70% of the prompt, at least 3 characters, and nothing for 3 or fewer (AD2)", () => {
  for (const short of ["", "hi", "yo!"]) assert.strictEqual(abandonPrefix(short, makeRng("short")), "", JSON.stringify(short));
  assert.strictEqual(abandonPrefix("abcd", makeRng("four")), "abc");
  const texts: string[] = [];
  for (let i = 0; texts.length < 1000; i++) texts.push(...sessionTurns(plannerFor(PERSONAS[i % PERSONAS.length], `abandon:${i}`)).map((turn) => turn.text));
  const rng = makeRng("abandon-prefix");
  let typed = 0;
  for (const text of texts.slice(0, 1000)) {
    const prefix = abandonPrefix(text, rng);
    if (text.length <= 3) {
      assert.strictEqual(prefix, "", text);
      continue;
    }
    typed++;
    assert.ok(text.startsWith(prefix), `"${prefix}" is not a prefix of "${text}"`);
    assert.ok(prefix.length >= 3 && prefix.length <= text.length - 1, `${prefix.length} of ${text.length}: "${text}"`);
    if (text.length >= 10) {
      assert.ok(prefix.length >= 0.3 * text.length - 1 && prefix.length <= 0.7 * text.length + 1, `${prefix.length} of ${text.length}: "${text}"`);
    }
  }
  assert.ok(typed > 900, `only ${typed} prompts longer than 3 characters`);
  const lengths = Array.from({ length: 200 }, () => abandonPrefix("x".repeat(40), rng).length);
  assert.ok(Math.min(...lengths) <= 13 && Math.max(...lengths) >= 27, `prefix lengths ${Math.min(...lengths)}-${Math.max(...lengths)} do not spread over 30-70%`);
});

/** A template's wording for comparison: first option of each [a|b], slots dropped, lowercase, punctuation stripped. */
function bankWords(text: string): Set<string> {
  const words = text
    .replace(/\[([^|\]]*)(?:\|[^\]]*)+\]/g, "$1")
    .replace(/\{[A-Za-z]+\}/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 0);
  return new Set(words);
}

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const shared = [...a].filter((word) => b.has(word)).length;
  return shared / (a.size + b.size - shared);
}

/** Opener templates per cell, follow-up templates per kind: the groups whose wordings must differ. */
function bankGroups(): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  const add = (key: string, text: string): void => {
    groups.set(key, [...(groups.get(key) ?? []), text]);
  };
  for (const t of OPENER_TEMPLATES) add(`${t.intent}/${t.shape}`, t.text);
  for (const t of FOLLOWUP_TEMPLATES) add(`followup:${t.kind}`, t.text);
  return groups;
}

check("jaccard and bankWords compare wordings the way D4 defines it", () => {
  assert.deepStrictEqual([...bankWords("I [spent a lot|went overboard] on {category}, what's the total?")], ["i", "spent", "a", "lot", "on", "whats", "the", "total"]);
  assert.strictEqual(bankWords("{category} {range}").size, 0);
  assert.strictEqual(jaccard(bankWords("delete {target}"), bankWords("Delete {target}.")), 1);
  assert.strictEqual(jaccard(bankWords("{amount}"), bankWords("{candidate}")), 1);
  assert.strictEqual(jaccard(bankWords("and {period}?"), bankWords("ok and {period}")), 0.5);
});

check("templates in one cell or follow-up kind differ in wording: Jaccard at most 0.6, one slot-only at most, no duplicate anywhere (AD8)", () => {
  for (const [key, texts] of bankGroups()) {
    assert.ok(texts.filter((text) => bankWords(text).size === 0).length <= 1, `${key} has more than one slot-only template`);
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const similarity = jaccard(bankWords(texts[i]), bankWords(texts[j]));
        assert.ok(similarity <= 0.6, `${key}: "${texts[i]}" and "${texts[j]}" are ${similarity.toFixed(2)} alike`);
      }
    }
  }
  const all = [...OPENER_TEMPLATES, ...FOLLOWUP_TEMPLATES].map((t) => t.text);
  assert.deepStrictEqual(all.filter((text, i) => all.indexOf(text) !== i), [], "duplicate templates");
});

const SWEEP_SEEDS: readonly CategorySeed[] = [...DEFAULT_CATEGORY_SEEDS, ...CUSTOM_CATEGORY_SEEDS];
const SWEEP_EXPENSE = SWEEP_SEEDS.filter((seed) => seed.scope !== "income");
const SWEEP_INCOME = SWEEP_SEEDS.filter((seed) => seed.scope !== "expense");
const SWEEP_DESCRIPTIONS = SWEEP_SEEDS.flatMap((seed) => seed.descriptions.map((d) => d.toLowerCase()));
const SWEEP_EXPENSE_DESCRIPTIONS = SWEEP_EXPENSE.flatMap((seed) => seed.descriptions.map((d) => d.toLowerCase()));
/** Every label buildPeriod and invalidPeriod can produce, one month name standing in for all twelve. */
const SWEEP_PERIODS = ["this month", "last month", "in July", "in the last 30 days", "this week", "today", "yesterday", "since June", "this year", "in 2019", "next month"];

/** Every value a slot can take in a real turn; income-only categories only where the template's intent is incomeSummary. */
function slotVariants(slot: SlotName, income: boolean): string[] {
  switch (slot) {
    case "category":
      return (income ? SWEEP_INCOME : SWEEP_EXPENSE).map((seed) => seed.name);
    case "newCategory":
      return SWEEP_EXPENSE.map((seed) => seed.name);
    case "period":
      return SWEEP_PERIODS;
    case "description":
      return SWEEP_EXPENSE_DESCRIPTIONS;
    case "ambiguous":
      return SWEEP_DESCRIPTIONS;
    case "text":
      return SWEEP_DESCRIPTIONS.map(searchText);
    case "target":
      return SWEEP_EXPENSE_DESCRIPTIONS.flatMap((d) => [`the ${d} on Sep 3`, `yesterday's ${d}`]);
    case "date":
      return ["yesterday", "on Sep 2"];
    case "order":
      return ["biggest", "largest", "smallest", "cheapest"];
    case "range":
      return ["over 40", "under 40", "between 20 and 40"];
    case "limit":
      return ["3", "5", "10"];
    case "amount":
    case "newAmount":
      return ["12.50", "15"];
    case "newDate":
    case "candidate":
      return ["Sep 1"];
  }
}

/** Expands every [a|b] group, so each wording is checked, not one random pick. */
function expandAlternation(text: string): string[] {
  const match = /\[([^[\]]*)\]/.exec(text);
  if (match === null) return [text];
  return match[1].split("|").flatMap((option) => expandAlternation(text.slice(0, match.index) + option + text.slice(match.index + match[0].length)));
}

const PERIOD_AFTER_PREPOSITION = /\b(?:for|show) (?:in|since|today|yesterday|this|last|next)\b|\b(?:in|on|from|to|of|at|by|during|since) (?:in|since)\b/i;

check("every template reads right with every value its slots can take: no doubled word, no preposition before a period", () => {
  const templates: { text: string; slots: readonly SlotName[]; income: boolean }[] = [
    ...OPENER_TEMPLATES.map((t) => ({ text: t.text, slots: t.slots, income: t.intent === "incomeSummary" })),
    ...FOLLOWUP_TEMPLATES.map((t) => ({ text: t.text, slots: t.slots, income: false })),
  ];
  let rendered = 0;
  for (const template of templates) {
    const base: SlotValues = {};
    for (const slot of template.slots) base[slot] = slotVariants(slot, template.income)[0];
    for (const wording of expandAlternation(template.text)) {
      for (const slot of template.slots) {
        for (const value of slotVariants(slot, template.income)) {
          const parts = renderTemplate(wording, { ...base, [slot]: value }, makeRng("sweep"));
          const text = parts.map((part) => part.text).join("");
          assert.strictEqual(templateDoubledWord(parts), null, `"${template.text}" doubles a word as "${text}"`);
          assert.ok(!PERIOD_AFTER_PREPOSITION.test(text), `"${template.text}" puts a preposition before its period: "${text}"`);
          rendered++;
        }
      }
    }
  }
  assert.ok(rendered > 5000, `only ${rendered} renders`);
});

/** D4 floors per opener cell: templates per register (0 for an `any` cell) and in total. Alternation does not count. */
const CELL_FLOORS: Record<string, { perRegister: number; total: number }> = {
  "spendSummary/all": { perRegister: 5, total: 15 },
  "spendSummary/category": { perRegister: 5, total: 15 },
  "incomeSummary/all": { perRegister: 5, total: 15 },
  "incomeSummary/category": { perRegister: 5, total: 15 },
};

check("every opener cell meets its D4 template floor (AD8)", () => {
  for (const [key, floor] of Object.entries(CELL_FLOORS)) {
    const templates = OPENER_TEMPLATES.filter((t) => `${t.intent}/${t.shape}` === key);
    assert.ok(templates.length >= floor.total, `${key} has ${templates.length} templates, needs ${floor.total}`);
    for (const register of STYLE_REGISTERS) {
      const n = templates.filter((t) => t.register === register).length;
      assert.ok(n >= floor.perRegister, `${key} has ${n} ${register} templates, needs ${floor.perRegister}`);
    }
  }
});

// --- Summary -----------------------------------------------------------------

console.log(`selftest: ${checksPassed} checks passed`);
process.exit(0);
