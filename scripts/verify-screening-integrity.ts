#!/usr/bin/env npx tsx
/**
 * Screening Integrity Verification
 *
 * Runs SQL assertions to confirm zero remaining duplicate/split-cinema issues.
 * Run after canonicalize-cinema-ids → cleanup-duplicate-films → cleanup-screenings.
 *
 * Usage:
 *   npx tsx scripts/verify-screening-integrity.ts
 */

import { db } from "../src/db";
import { sql } from "drizzle-orm";

interface AssertionResult {
  name: string;
  passed: boolean;
  details?: string;
}

const LEGACY_IDS = [
  "close-up",
  "david-lean",
  "riverside",
  "nickel",
  "phoenix",
  "olympic",
  "genesis-mile-end",
  "garden-cinema",
  "electric",
  "gate-picturehouse",
  "picturehouse-ritzy",
  "everyman-screen-on-the-green",
];

async function runAssertions(): Promise<AssertionResult[]> {
  const results: AssertionResult[] = [];

  // 1. No legacy cinema IDs in screenings
  console.log("\n🔍 Assertion 1: No legacy cinema IDs in screenings...");
  const legacyIdsSql = sql.join(LEGACY_IDS.map(id => sql`${id}`), sql`, `);
  const legacyRows = await db.execute<{ cinema_id: string; count: string }>(
    sql`SELECT cinema_id, COUNT(*)::text as count FROM screenings
        WHERE cinema_id IN (${legacyIdsSql})
        GROUP BY cinema_id`
  );

  if (legacyRows.length === 0) {
    results.push({ name: "No legacy cinema IDs", passed: true });
    console.log("  ✅ PASS — No legacy IDs found in screenings");
  } else {
    const details = legacyRows
      .map((r) => `${r.cinema_id}: ${r.count} screenings`)
      .join(", ");
    results.push({ name: "No legacy cinema IDs", passed: false, details });
    console.log(`  ❌ FAIL — Legacy IDs found: ${details}`);
  }

  // 2. No duplicate screenings (same filmId + cinemaId + datetime)
  console.log("\n🔍 Assertion 2: No duplicate screenings...");
  const dupeRows = await db.execute<{
    film_id: string;
    cinema_id: string;
    datetime: string;
    cnt: string;
  }>(
    sql`SELECT film_id, cinema_id, datetime::text, COUNT(*)::text as cnt
        FROM screenings
        GROUP BY film_id, cinema_id, datetime
        HAVING COUNT(*) > 1
        LIMIT 10`
  );

  if (dupeRows.length === 0) {
    results.push({ name: "No duplicate screenings", passed: true });
    console.log("  ✅ PASS — No duplicate screenings found");
  } else {
    const details = dupeRows
      .map((r) => `film=${r.film_id.slice(0, 8)}… cinema=${r.cinema_id} time=${r.datetime} (${r.cnt}x)`)
      .join("\n    ");
    results.push({
      name: "No duplicate screenings",
      passed: false,
      details: `${dupeRows.length} duplicate groups found`,
    });
    console.log(`  ❌ FAIL — Duplicate screenings:\n    ${details}`);
  }

  // 3. Unique index exists
  console.log("\n🔍 Assertion 3: Unique index exists...");
  const indexRows = await db.execute<{ indexname: string }>(
    sql`SELECT indexname FROM pg_indexes
        WHERE tablename = 'screenings' AND indexname = 'idx_screenings_unique'`
  );

  if (indexRows.length === 1) {
    results.push({ name: "Unique index exists", passed: true });
    console.log("  ✅ PASS — idx_screenings_unique exists");
  } else {
    results.push({
      name: "Unique index exists",
      passed: false,
      details: `Expected 1 index, found ${indexRows.length}`,
    });
    console.log(`  ❌ FAIL — idx_screenings_unique not found`);
  }

  // 4. No split-cinema pairs (same film at both legacy and canonical)
  console.log("\n🔍 Assertion 4: No split-cinema pairs...");
  const splitPairs = [
    ["close-up", "close-up-cinema"],
    ["nickel", "the-nickel"],
    ["riverside", "riverside-studios"],
    ["david-lean", "david-lean-cinema"],
    ["phoenix", "phoenix-east-finchley"],
    ["olympic", "olympic-studios"],
  ];

  // Build the pairs as a VALUES clause
  const pairConditions = splitPairs
    .map(([legacy, canonical]) => `('${legacy}','${canonical}')`)
    .join(",");

  const splitRows = await db.execute<{
    legacy: string;
    canonical: string;
    count: string;
  }>(
    sql.raw(`
      SELECT s1.cinema_id as legacy, s2.cinema_id as canonical, COUNT(*)::text as count
      FROM screenings s1
      JOIN screenings s2 ON s1.film_id = s2.film_id
        AND s1.datetime = s2.datetime
        AND s1.cinema_id != s2.cinema_id
      WHERE (s1.cinema_id, s2.cinema_id) IN (${pairConditions})
      GROUP BY s1.cinema_id, s2.cinema_id
    `)
  );

  if (splitRows.length === 0) {
    results.push({ name: "No split-cinema pairs", passed: true });
    console.log("  ✅ PASS — No split-cinema pairs found");
  } else {
    const details = splitRows
      .map((r) => `${r.legacy} ↔ ${r.canonical}: ${r.count} pairs`)
      .join(", ");
    results.push({ name: "No split-cinema pairs", passed: false, details });
    console.log(`  ❌ FAIL — Split-cinema pairs: ${details}`);
  }

  return results;
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║          Screening Integrity Verification                    ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  try {
    const results = await runAssertions();

    console.log("\n══════════════════════════════════════════════════════════════");
    const allPassed = results.every((r) => r.passed);
    const passCount = results.filter((r) => r.passed).length;
    const failCount = results.filter((r) => !r.passed).length;

    console.log(`\nResults: ${passCount} passed, ${failCount} failed`);

    if (allPassed) {
      console.log("\n✅ All integrity checks passed!");
    } else {
      console.log("\n❌ Some checks failed. Review and fix before proceeding.");
      for (const r of results.filter((r) => !r.passed)) {
        console.log(`  - ${r.name}: ${r.details}`);
      }
      process.exit(1);
    }
  } catch (error) {
    console.error("\n❌ Verification failed:", error);
    process.exit(1);
  }
}

main().then(() => process.exit(0));
