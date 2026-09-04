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
  type Region,
} from "./config";

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

// --- Summary -----------------------------------------------------------------

console.log(`selftest: ${checksPassed} checks passed`);
process.exit(0);
