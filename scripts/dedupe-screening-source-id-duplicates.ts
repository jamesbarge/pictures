#!/usr/bin/env tsx
/**
 * Deduplicate screenings that share (cinema_id, source_id, datetime).
 *
 * The screenings table's existing unique index is on (film_id, cinema_id,
 * datetime) — which lets a re-scrape with a different film_id resolution
 * insert a fresh row instead of updating the existing one. Result: 398
 * duplicate triples / 413 excess rows in production as of 2026-05-06.
 *
 * For each duplicate triple we pick a "winner" row to keep and DELETE the
 * rest. The winner-selection rules (Tier 1 → Tier 4, evaluated in order):
 *
 *   Tier 1 — Trigram dominance: Pick the row whose linked film title has
 *            the highest pg_trgm similarity to the source_id-derived title.
 *            Requires the winner to beat every other row by ≥0.10.
 *            NB: cinemas whose source_id is opaque (Curzon's BLO1-NNN, Picture-
 *            house session GUIDs, Prince Charles's numeric IDs) produce sim≈0
 *            for every row, so those triples always fall through to Tier 2/3.
 *   Tier 2 — Year-aware tie-break: Among trigram-tied rows, prefer the one
 *            whose film year is non-null over null years.
 *   Tier 3 — Most-recent-scrape tie-break: Prefer the row with the latest
 *            scraped_at timestamp.
 *   Tier 4 — Latest-id deterministic tie-break: Prefer the lexicographically
 *            largest screening id (deterministic but arbitrary; only fires
 *            when scraped_at is also tied).
 *
 * Every triple is fixed under exactly one tier — there is no "skip" path.
 * The dry-run output prints the tier decision per triple so the operator
 * can spot-check before --apply.
 *
 * Usage:
 *   npx dotenv -e .env.local -- npx tsx -r tsconfig-paths/register \
 *       scripts/dedupe-screening-source-id-duplicates.ts
 *   ... add --apply to commit deletions.
 *
 * Read-only by default. Each delete is a single statement.
 */
import { db } from "@/db";
import { screenings } from "@/db/schema";
import { sql, inArray } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");
const VERBOSE = process.argv.includes("--verbose");

interface RowCandidate {
  id: string;
  film_id: string;
  film_title: string | null;
  film_year: number | null;
  sim: number; // pg_trgm similarity 0..1
  scraped_at: string;
}

interface TripleGroup {
  cinema_id: string;
  source_id: string;
  datetime: string;
  rows: RowCandidate[];
}

const TIER1_MIN_GAP = 0.10;

function pickWinner(group: TripleGroup): { winner: RowCandidate; tier: 1 | 2 | 3 | 4; reason: string } {
  const rows = [...group.rows];
  // Sort by sim DESC, then year-non-null DESC, then scraped_at DESC, then id DESC.
  rows.sort((a, b) => {
    if (b.sim !== a.sim) return b.sim - a.sim;
    const aYear = a.film_year != null ? 1 : 0;
    const bYear = b.film_year != null ? 1 : 0;
    if (bYear !== aYear) return bYear - aYear;
    if (b.scraped_at !== a.scraped_at) return b.scraped_at.localeCompare(a.scraped_at);
    return b.id.localeCompare(a.id);
  });
  const top = rows[0];
  const second = rows[1];

  // Tier 1: top wins by ≥ TIER1_MIN_GAP on similarity.
  if (top.sim - second.sim >= TIER1_MIN_GAP) {
    return { winner: top, tier: 1, reason: `sim ${top.sim.toFixed(3)} > runner-up ${second.sim.toFixed(3)} (gap ≥ ${TIER1_MIN_GAP})` };
  }
  // Tier 2: among trigram-tied rows, year-non-null wins.
  const topHasYear = top.film_year != null;
  const secondHasYear = second.film_year != null;
  if (topHasYear !== secondHasYear) {
    return { winner: top, tier: 2, reason: `trigram tie; year-non-null beats year-null` };
  }
  // Tier 3: most recent scrape wins.
  if (top.scraped_at !== second.scraped_at) {
    return { winner: top, tier: 3, reason: `trigram+year tied; scraped_at ${top.scraped_at.slice(0, 10)} most recent` };
  }
  // Tier 4: deterministic id tie-break.
  return { winner: top, tier: 4, reason: `everything tied; picking lexicographically largest id` };
}

async function main(): Promise<void> {
  console.log(`Screening (cinema, source_id, datetime) deduplication (${APPLY ? "APPLY" : "DRY RUN"} mode)`);

  // Fetch every duplicate triple's row set in one query.
  const rows = await db.execute(sql`
    WITH dup_groups AS (
      SELECT cinema_id, source_id, datetime
      FROM screenings
      WHERE source_id IS NOT NULL
      GROUP BY cinema_id, source_id, datetime
      HAVING COUNT(*) > 1
    )
    SELECT s.cinema_id, s.source_id, s.datetime,
           s.id, s.film_id, f.title AS film_title, f.year AS film_year,
           similarity(replace(replace(s.source_id, s.cinema_id || '-', ''), '-', ' '), COALESCE(f.title, '')) AS sim,
           s.scraped_at
    FROM screenings s
    JOIN dup_groups d
      ON d.cinema_id = s.cinema_id AND d.source_id = s.source_id AND d.datetime = s.datetime
    LEFT JOIN films f ON f.id = s.film_id
    ORDER BY s.cinema_id, s.source_id, s.datetime
  `);

  // Group rows by (cinema_id, source_id, datetime).
  const groupMap = new Map<string, TripleGroup>();
  for (const r of rows as unknown as Array<{
    cinema_id: string;
    source_id: string;
    datetime: string;
    id: string;
    film_id: string;
    film_title: string | null;
    film_year: number | null;
    sim: number | null;
    scraped_at: string;
  }>) {
    const key = `${r.cinema_id}|${r.source_id}|${r.datetime}`;
    let g = groupMap.get(key);
    if (!g) {
      g = { cinema_id: r.cinema_id, source_id: r.source_id, datetime: r.datetime, rows: [] };
      groupMap.set(key, g);
    }
    g.rows.push({
      id: r.id,
      film_id: r.film_id,
      film_title: r.film_title,
      film_year: r.film_year,
      sim: r.sim ?? 0,
      scraped_at: r.scraped_at,
    });
  }

  console.log(`Found ${groupMap.size} duplicate triples covering ${rows.length} rows.\n`);

  const tierCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const idsToDelete: string[] = [];

  for (const g of groupMap.values()) {
    const { winner, tier, reason } = pickWinner(g);
    tierCounts[tier]++;
    const losers = g.rows.filter((r) => r.id !== winner.id);
    idsToDelete.push(...losers.map((r) => r.id));

    if (VERBOSE || tier === 4) {
      console.log(`[Tier ${tier}] ${g.cinema_id} | ${g.source_id.slice(0, 60)} | ${g.datetime.slice(0, 16)}`);
      console.log(`  WINNER  ${winner.id.slice(0, 8)} sim=${winner.sim.toFixed(3)} year=${winner.film_year ?? "—"} title="${winner.film_title}" scraped=${winner.scraped_at.slice(0, 10)}`);
      for (const l of losers) {
        console.log(`   loser  ${l.id.slice(0, 8)} sim=${l.sim.toFixed(3)} year=${l.film_year ?? "—"} title="${l.film_title}" scraped=${l.scraped_at.slice(0, 10)}`);
      }
      console.log(`  reason: ${reason}\n`);
    }
  }

  console.log("=== Tier breakdown ===");
  console.log(`Tier 1 (trigram dominance, gap ≥ ${TIER1_MIN_GAP}): ${tierCounts[1]} triples`);
  console.log(`Tier 2 (year non-null tie-break):                  ${tierCounts[2]} triples`);
  console.log(`Tier 3 (most-recent scrape tie-break):             ${tierCounts[3]} triples`);
  console.log(`Tier 4 (deterministic id tie-break):               ${tierCounts[4]} triples`);
  console.log(`\nTotal rows to delete: ${idsToDelete.length}`);
  console.log(`(Re-run with --verbose to see every triple decision.)`);

  if (!APPLY) {
    console.log(`\n[DRY RUN] Pass --apply to commit deletions.`);
    process.exit(0);
  }

  // APPLY: delete in batches of 200.
  console.log(`\nApplying deletions...`);
  const batchSize = 200;
  let deleted = 0;
  for (let i = 0; i < idsToDelete.length; i += batchSize) {
    const batch = idsToDelete.slice(i, i + batchSize);
    const result = await db
      .delete(screenings)
      .where(inArray(screenings.id, batch))
      .returning({ id: screenings.id });
    deleted += result.length;
    console.log(`  batch ${Math.floor(i / batchSize) + 1}: deleted ${result.length} rows`);
  }
  console.log(`✅ Deleted ${deleted} rows total.`);

  // Post-apply verification: count remaining duplicate triples.
  const remaining = await db.execute(sql`
    SELECT COUNT(*) AS dup_triples
    FROM (
      SELECT 1 FROM screenings
      WHERE source_id IS NOT NULL
      GROUP BY cinema_id, source_id, datetime
      HAVING COUNT(*) > 1
    ) t
  `);
  console.log(`Post-apply duplicate triples remaining:`, remaining);
  process.exit(0);
}

main().catch((e) => {
  console.error("ERR:", e);
  process.exit(1);
});
