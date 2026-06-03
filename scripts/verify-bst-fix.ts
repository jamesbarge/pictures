/**
 * Manual verification of the BST scraper fix.
 *
 * Vitest workers hang on this checkout (pre-existing infra issue) and the
 * scraper classes pull in the DB at module-load via FestivalDetector, so we
 * can't import them in a one-shot script either. Instead we mirror the exact
 * algorithm now used by rich-mix.ts, rich-mix-v2.ts, and bfi.ts — all three
 * resolve to `ukLocalToUTC(...)`. Run with TZ=UTC to simulate prod.
 *
 *   TZ=UTC npx tsx scripts/verify-bst-fix.ts
 */
import { ukLocalToUTC } from "../src/scrapers/utils/date-parser";

let passed = 0;
let failed = 0;
function check(name: string, actual: string | undefined, expected: string) {
  if (actual === expected) {
    console.log(`  PASS  ${name}`);
    passed++;
  } else {
    console.log(`  FAIL  ${name}`);
    console.log(`        expected: ${expected}`);
    console.log(`        actual:   ${actual}`);
    failed++;
  }
}

console.log(`TZ at runtime: ${process.env.TZ ?? "(not set)"}\n`);

// Algorithm mirror for rich-mix.ts / rich-mix-v2.ts parseDateTime
function richMixParse(dateStr: string): Date | null {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return ukLocalToUTC(
    parseInt(year, 10),
    parseInt(month, 10) - 1,
    parseInt(day, 10),
    parseInt(hour, 10),
    parseInt(minute, 10),
  );
}

// Algorithm mirror for bfi.ts parseBFIDateTime
const MONTHS: Record<string, number> = {
  January: 0, February: 1, March: 2, April: 3,
  May: 4, June: 5, July: 6, August: 7,
  September: 8, October: 9, November: 10, December: 11,
};
function bfiParse(text: string): Date | null {
  const match = text.match(/(\d{1,2})\s+(\w+)\s+(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const [, day, monthName, year, hours, minutes] = match;
  const month = MONTHS[monthName];
  if (month === undefined) return null;
  return ukLocalToUTC(
    parseInt(year),
    month,
    parseInt(day),
    parseInt(hours),
    parseInt(minutes),
  );
}

console.log("rich-mix.ts / rich-mix-v2.ts parseDateTime");
check(
  "BST: 2026-05-26 18:10:00 → 17:10 UTC",
  richMixParse("2026-05-26 18:10:00")?.toISOString(),
  "2026-05-26T17:10:00.000Z",
);
check(
  "GMT: 2026-01-15 18:10:00 → 18:10 UTC (no offset)",
  richMixParse("2026-01-15 18:10:00")?.toISOString(),
  "2026-01-15T18:10:00.000Z",
);

console.log("\nbfi.ts parseBFIDateTime");
check(
  "BST: 'Tuesday 26 May 2026 18:10' → 17:10 UTC",
  bfiParse("Tuesday 26 May 2026 18:10")?.toISOString(),
  "2026-05-26T17:10:00.000Z",
);
check(
  "GMT: 'Thursday 15 January 2026 18:10' → 18:10 UTC (no offset)",
  bfiParse("Thursday 15 January 2026 18:10")?.toISOString(),
  "2026-01-15T18:10:00.000Z",
);

// BST boundary checks. Project convention (per date-parser.ts isUKSummerTime):
// the ambiguous 01:xx hour on BST-end Sunday is treated as still-BST.
console.log("\nDST boundaries");
check(
  "BST end Sunday 01:30 (treated as BST per project convention) → 00:30 UTC",
  ukLocalToUTC(2026, 9, 25, 1, 30).toISOString(),
  "2026-10-25T00:30:00.000Z",
);
check(
  "BST end Sunday 02:30 (GMT) → 02:30 UTC",
  ukLocalToUTC(2026, 9, 25, 2, 30).toISOString(),
  "2026-10-25T02:30:00.000Z",
);
check(
  "BST start Sunday 02:30 (BST) → 01:30 UTC",
  ukLocalToUTC(2026, 2, 29, 2, 30).toISOString(),
  "2026-03-29T01:30:00.000Z",
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
