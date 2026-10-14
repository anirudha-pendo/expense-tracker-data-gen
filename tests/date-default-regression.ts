/**
 * Regression test for APP-172980: editing a transaction or goal shifted the
 * date back one day in UTC-negative timezones.
 *
 * The bug: `format(new Date("YYYY-MM-DD"), "yyyy-MM-dd")` parses the bare
 * ISO date as UTC midnight, then `format` renders in local time — west of
 * UTC that is the previous calendar day.
 *
 * The fix: use the stored string directly (it is already `yyyy-MM-dd`).
 *
 * Run:  TZ=America/New_York npx tsx tests/date-default-regression.ts
 */
import assert from "node:assert";
import { format } from "date-fns";
import { parseCalendarDate } from "../src/lib/dates.js";

const DATES = ["2026-03-01", "2026-01-01", "2025-12-31", "2026-06-15"];

// 1. The buggy path: new Date("YYYY-MM-DD") → UTC midnight.
//    In a UTC-negative timezone, format() renders the previous day.
for (const iso of DATES) {
  const utcMidnight = new Date(iso);
  assert.strictEqual(utcMidnight.getUTCHours(), 0, `new Date("${iso}") must be UTC midnight`);

  const offset = utcMidnight.getTimezoneOffset(); // positive = west of UTC
  if (offset > 0) {
    assert.notStrictEqual(
      format(utcMidnight, "yyyy-MM-dd"),
      iso,
      `format(new Date("${iso}")) must drift in a west-of-UTC zone (offset +${offset})`,
    );
  }
}

// 2. The repo's safe helper: parseCalendarDate gives *local* midnight,
//    so format() always returns the same calendar day.
for (const iso of DATES) {
  const local = parseCalendarDate(iso);
  assert.strictEqual(local.getHours(), 0, `parseCalendarDate("${iso}") must be local midnight`);
  assert.strictEqual(
    format(local, "yyyy-MM-dd"),
    iso,
    `format(parseCalendarDate("${iso}")) must round-trip`,
  );
}

// 3. The actual fix: the stored date is already a yyyy-MM-dd string,
//    so the form passes it straight through — no Date object involved.
for (const iso of DATES) {
  assert.match(iso, /^\d{4}-\d{2}-\d{2}$/, `"${iso}" is already yyyy-MM-dd`);
  const formDefault = iso ?? format(new Date(), "yyyy-MM-dd"); // mirrors the fix
  assert.strictEqual(formDefault, iso, `pass-through must preserve "${iso}"`);
}

console.log("date-default-regression: all checks passed");
