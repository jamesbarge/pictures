#!/usr/bin/env tsx
/**
 * Backfill cinema_baselines from recent scraper_runs history.
 *
 * The 2026-04-26 audit (`scripts/audit/trigger-runs-audit.ts`) found
 * 66 of 67 cinemas have no `cinema_baselines` row, which means
 * `runner-factory.detectAnomaly()` returns null for all of them and
 * never flags low/zero-count runs. The local-scraping rebuild's anomaly
 * digest catches the strict zero-count case via a fallback in
 * summariseRunsSince(), but anything in between (e.g. a cinema returning
 * 30 vs typical 100) is silently ignored without baselines.
 *
 * This script computes baselines from the last 30 days of successful
 * scraper_runs and upserts them.
 *
 * Method:
 *   1. For each cinema, pull all status='success' runs in the last 30 days
 *      with screening_count > 0 (zero counts likely indicate breakage,
 *      not a real baseline).
 *   2. Partition rows by `EXTRACT(DOW FROM started_at)` — Postgres returns
 *      0=Sunday, 6=Saturday.
 *   3. Compute the median screening_count for weekdays (1-5) and weekends
 *      (0,6) separately.
 *   4. Upsert cinema_baselines: { weekdayAvg, weekendAvg, lastCalculated, notes }.
 *      Default tolerancePercent=30 stays unless the row already exists.
 *      Honour manualOverride=true: never overwrite those rows.
 *
 * Default mode is DRY-RUN. Pass --apply to actually write.
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/backfill-cinema-baselines.ts
 *   npx tsx --env-file=.env.local scripts/backfill-cinema-baselines.ts --apply
 */

import { db } from "@/db";
import { scraperRuns, cinemaBaselines } from "@/db/schema/admin";
import { cinemas } from "@/db/schema/cinemas";
import { sql, gte, eq, and } from "drizzle-orm";

const DAYS = 30;
const MIN_SAMPLE_SIZE = 2; // Need at least 2 runs in a partition to call it a "baseline"

interface CinemaBaselineComputation {
  cinemaId: string;
  cinemaName: string;
  weekdayAvg: number | null;
  weekendAvg: number | null;
  weekdaySamples: number;
  weekendSamples: number;
  reason?: string;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

async function main() {
  const apply = process.argv.includes("--apply");
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

  console.log(`[backfill-baselines] Window: last ${DAYS} days (since ${since.toISOString().slice(0, 10)})`);
  console.log(`[backfill-baselines] Mode: ${apply ? "APPLY (will write)" : "DRY RUN (no DB writes)"}`);
  console.log("");

  // 1. Pull recent successful runs with day-of-week
  const rows = await db
    .select({
      cinemaId: scraperRuns.cinemaId,
      cinemaName: cinemas.name,
      screeningCount: scraperRuns.screeningCount,
      dow: sql<number>`extract(dow from ${scraperRuns.startedAt})`.mapWith(Number),
    })
    .from(scraperRuns)
    .innerJoin(cinemas, eq(scraperRuns.cinemaId, cinemas.id))
    .where(
      and(
        gte(scraperRuns.startedAt, since),
        eq(scraperRuns.status, "success"),
        sql`${scraperRuns.screeningCount} > 0`,
      ),
    );

  // 2. Group by cinema, partition by weekday vs weekend
  const byCinema = new Map<
    string,
    { name: string; weekdayCounts: number[]; weekendCounts: number[] }
  >();
  for (const r of rows) {
    if (r.screeningCount == null) continue;
    if (!byCinema.has(r.cinemaId)) {
      byCinema.set(r.cinemaId, { name: r.cinemaName, weekdayCounts: [], weekendCounts: [] });
    }
    const entry = byCinema.get(r.cinemaId)!;
    const isWeekend = r.dow === 0 || r.dow === 6;
    if (isWeekend) entry.weekendCounts.push(r.screeningCount);
    else entry.weekdayCounts.push(r.screeningCount);
  }

  // 3. Compute medians per cinema
  const computations: CinemaBaselineComputation[] = [];
  for (const [cinemaId, entry] of byCinema) {
    const weekdayAvg =
      entry.weekdayCounts.length >= MIN_SAMPLE_SIZE ? median(entry.weekdayCounts) : null;
    const weekendAvg =
      entry.weekendCounts.length >= MIN_SAMPLE_SIZE ? median(entry.weekendCounts) : null;

    computations.push({
      cinemaId,
      cinemaName: entry.name,
      weekdayAvg,
      weekendAvg,
      weekdaySamples: entry.weekdayCounts.length,
      weekendSamples: entry.weekendCounts.length,
      reason:
        weekdayAvg == null && weekendAvg == null
          ? `insufficient samples (weekday=${entry.weekdayCounts.length}, weekend=${entry.weekendCounts.length}, need ≥${MIN_SAMPLE_SIZE} in at least one partition)`
          : undefined,
    });
  }

  computations.sort((a, b) => a.cinemaName.localeCompare(b.cinemaName));

  // 4. Show plan
  const usable = computations.filter((c) => !c.reason);
  console.log(`Cinemas with sufficient sample data: ${usable.length} / ${computations.length}`);
  console.log("");
  console.log("| Cinema | Weekday median | Weekend median | Samples (wd/we) |");
  console.log("|---|---|---|---|");
  for (const c of computations) {
    const wd = c.weekdayAvg ?? "—";
    const we = c.weekendAvg ?? "—";
    console.log(`| ${c.cinemaName} | ${wd} | ${we} | ${c.weekdaySamples}/${c.weekendSamples} |`);
  }
  console.log("");

  if (!apply) {
    console.log("[backfill-baselines] DRY RUN — no changes written. Re-run with --apply to write.");
    process.exit(0);
  }

  // 5. Pull existing baselines so we honour manualOverride=true
  const existing = await db.select().from(cinemaBaselines);
  const existingByCinema = new Map(existing.map((b) => [b.cinemaId, b]));

  let upserted = 0;
  let skippedManual = 0;
  let skippedInsufficient = 0;
  for (const c of usable) {
    const existing = existingByCinema.get(c.cinemaId);
    if (existing?.manualOverride) {
      skippedManual++;
      continue;
    }

    if (existing) {
      await db
        .update(cinemaBaselines)
        .set({
          weekdayAvg: c.weekdayAvg ?? existing.weekdayAvg,
          weekendAvg: c.weekendAvg ?? existing.weekendAvg,
          lastCalculated: new Date(),
          notes: `Backfilled from ${DAYS}d scraper_runs (median, samples wd=${c.weekdaySamples}/we=${c.weekendSamples})`,
          updatedAt: new Date(),
        })
        .where(eq(cinemaBaselines.cinemaId, c.cinemaId));
    } else {
      await db.insert(cinemaBaselines).values({
        cinemaId: c.cinemaId,
        weekdayAvg: c.weekdayAvg,
        weekendAvg: c.weekendAvg,
        lastCalculated: new Date(),
        notes: `Backfilled from ${DAYS}d scraper_runs (median, samples wd=${c.weekdaySamples}/we=${c.weekendSamples})`,
      });
    }
    upserted++;
  }
  for (const c of computations) if (c.reason) skippedInsufficient++;

  console.log("");
  console.log(`Upserted:           ${upserted}`);
  console.log(`Skipped (manual):   ${skippedManual}`);
  console.log(`Skipped (samples):  ${skippedInsufficient}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
