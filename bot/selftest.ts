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
  SEED_ANCHOR_DATE,
  type Region,
} from "./config";
import {
  ARCHETYPES,
  ACTION_WEIGHTS,
  ACCOUNTS,
  PERSONAS,
  buildSeedData,
  type Archetype,
} from "./personas";

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

check("buildSeedData on the same persona twice yields deeply equal output", () => {
  for (const persona of PERSONAS) {
    const first = buildSeedData(persona);
    const second = buildSeedData(persona);
    assert.deepStrictEqual(first, second, `${persona.username}: buildSeedData is not deterministic`);
  }
});

check("buildSeedData on two different personas yields different user ids", () => {
  const userIds = new Set<string>();
  for (const persona of PERSONAS) {
    userIds.add(buildSeedData(persona).user.id);
  }
  assert.strictEqual(
    userIds.size,
    PERSONAS.length,
    "buildSeedData produced duplicate user ids across distinct personas",
  );
});

check(
  "every transaction's categoryId resolves to one of the workspace's own categories, and every budget's categoryId does too",
  () => {
    for (const persona of PERSONAS) {
      const seed = buildSeedData(persona);
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
  const anchor = new Date(SEED_ANCHOR_DATE);
  const anchorYm = ymFromDate(anchor);
  const windowEnd = anchor.toISOString().slice(0, 10);

  for (const persona of PERSONAS) {
    const { historyMonths } = ARCHETYPES[persona.archetype];
    const earliestYm = anchorYm - (historyMonths - 1);
    const windowStart = dateOnlyFromYm(earliestYm, 1);
    const seed = buildSeedData(persona);
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

// --- Summary -----------------------------------------------------------------

console.log(`selftest: ${checksPassed} checks passed`);
process.exit(0);
