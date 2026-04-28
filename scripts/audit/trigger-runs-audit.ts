#!/usr/bin/env tsx
/**
 * Scraper Runs Audit
 *
 * Pulls the last 30 days of scraper_runs from the DB to surface:
 *  - Cinemas with no recent run (silent breakers — orchestrator never invoked them)
 *  - Cinemas with recurring anomalies (low_count, zero_results) per cinema
 *  - Cinemas with recurring failures (status=failed)
 *  - Cinemas missing a baseline row (anomaly detection silently disabled)
 *
 * Output: tasks/trigger-audit-YYYY-MM-DD.md (markdown table) + console summary.
 *
 * Run: npx tsx scripts/audit/trigger-runs-audit.ts
 */

import { db } from "@/db";
import { scraperRuns, cinemaBaselines } from "@/db/schema/admin";
import { cinemas } from "@/db/schema/cinemas";
import { sql, gte } from "drizzle-orm";
import { writeFileSync } from "fs";
import { join } from "path";

interface CinemaStat {
  cinemaId: string;
  cinemaName: string;
  total: number;
  success: number;
  failed: number;
  anomaly: number;
  partial: number;
  lastRun: Date | null;
  hasBaseline: boolean;
  recentScreeningCount: number | null;
}

async function main() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  console.log(`[audit] Pulling scraper_runs since ${since.toISOString()}`);

  // All cinemas (including those that may have no runs)
  const allCinemas = await db
    .select({ id: cinemas.id, name: cinemas.name })
    .from(cinemas);

  // Aggregate run stats per cinema for the window
  const runStats = await db
    .select({
      cinemaId: scraperRuns.cinemaId,
      total: sql<number>`count(*)`.mapWith(Number),
      success: sql<number>`count(*) filter (where status = 'success')`.mapWith(Number),
      failed: sql<number>`count(*) filter (where status = 'failed')`.mapWith(Number),
      anomaly: sql<number>`count(*) filter (where status = 'anomaly')`.mapWith(Number),
      partial: sql<number>`count(*) filter (where status = 'partial')`.mapWith(Number),
      lastRun: sql<Date>`max(${scraperRuns.completedAt})`,
      lastScreeningCount: sql<number>`(array_agg(${scraperRuns.screeningCount} order by ${scraperRuns.completedAt} desc))[1]`.mapWith(Number),
    })
    .from(scraperRuns)
    .where(gte(scraperRuns.startedAt, since))
    .groupBy(scraperRuns.cinemaId);

  const baselines = await db.select({ cinemaId: cinemaBaselines.cinemaId }).from(cinemaBaselines);
  const haveBaseline = new Set(baselines.map((b) => b.cinemaId));

  const statsByCinema = new Map(runStats.map((s) => [s.cinemaId, s]));

  const all: CinemaStat[] = allCinemas.map((c) => {
    const s = statsByCinema.get(c.id);
    return {
      cinemaId: c.id,
      cinemaName: c.name,
      total: s?.total ?? 0,
      success: s?.success ?? 0,
      failed: s?.failed ?? 0,
      anomaly: s?.anomaly ?? 0,
      partial: s?.partial ?? 0,
      lastRun: s?.lastRun ? new Date(s.lastRun) : null,
      hasBaseline: haveBaseline.has(c.id),
      recentScreeningCount: s?.lastScreeningCount ?? null,
    };
  });

  // Categorise
  const silentBreakers = all.filter((c) => c.total === 0);
  const noRecentRun = all.filter((c) => {
    if (!c.lastRun) return false;
    const daysSince = (Date.now() - c.lastRun.getTime()) / (24 * 60 * 60 * 1000);
    return daysSince > 8;
  });
  const recurringAnomalies = all.filter((c) => c.anomaly >= 2);
  const recurringFailures = all.filter((c) => c.failed >= 3);
  const missingBaseline = all.filter((c) => !c.hasBaseline);

  // Render markdown report
  const today = new Date().toISOString().slice(0, 10);
  const out: string[] = [];
  out.push(`# Scraper Runs Audit — ${today}`);
  out.push("");
  out.push(`Window: last 30 days (${since.toISOString().slice(0, 10)} → ${today})`);
  out.push(`Cinemas total: ${all.length}`);
  out.push("");

  out.push(`## Silent breakers — cinemas with ZERO runs in the window (${silentBreakers.length})`);
  if (silentBreakers.length === 0) {
    out.push("None.");
  } else {
    out.push("| Cinema | Has baseline? |");
    out.push("|---|---|");
    for (const c of silentBreakers) {
      out.push(`| ${c.cinemaName} (\`${c.cinemaId}\`) | ${c.hasBaseline ? "yes" : "**no**"} |`);
    }
  }
  out.push("");

  out.push(`## No run in last 8 days — orchestrator may be skipping (${noRecentRun.length})`);
  if (noRecentRun.length === 0) {
    out.push("None.");
  } else {
    out.push("| Cinema | Last run | Days since |");
    out.push("|---|---|---|");
    for (const c of noRecentRun) {
      const days = Math.round((Date.now() - c.lastRun!.getTime()) / (24 * 60 * 60 * 1000));
      out.push(`| ${c.cinemaName} | ${c.lastRun!.toISOString().slice(0, 10)} | ${days} |`);
    }
  }
  out.push("");

  out.push(`## Recurring anomalies — ≥2 anomaly runs (${recurringAnomalies.length})`);
  if (recurringAnomalies.length === 0) {
    out.push("None.");
  } else {
    out.push("| Cinema | Anomaly count | Last screening count |");
    out.push("|---|---|---|");
    for (const c of recurringAnomalies) {
      out.push(`| ${c.cinemaName} | ${c.anomaly} / ${c.total} | ${c.recentScreeningCount ?? "—"} |`);
    }
  }
  out.push("");

  out.push(`## Recurring failures — ≥3 failed runs (${recurringFailures.length})`);
  if (recurringFailures.length === 0) {
    out.push("None.");
  } else {
    out.push("| Cinema | Failures | Total runs |");
    out.push("|---|---|---|");
    for (const c of recurringFailures) {
      out.push(`| ${c.cinemaName} | ${c.failed} | ${c.total} |`);
    }
  }
  out.push("");

  out.push(`## Missing baseline — anomaly detection silently disabled (${missingBaseline.length})`);
  if (missingBaseline.length === 0) {
    out.push("All cinemas have baselines.");
  } else {
    out.push("These cinemas have no `cinema_baselines` row, so `runner-factory.detectAnomaly()` returns null and never flags low/zero-count runs.");
    out.push("");
    out.push("| Cinema | Runs in window |");
    out.push("|---|---|");
    for (const c of missingBaseline) {
      out.push(`| ${c.cinemaName} | ${c.total} |`);
    }
  }
  out.push("");

  out.push(`## Full per-cinema breakdown`);
  out.push("");
  out.push("| Cinema | Total | Success | Anomaly | Failed | Last run | Last count | Baseline |");
  out.push("|---|---|---|---|---|---|---|---|");
  const sorted = [...all].sort((a, b) => a.total - b.total || a.cinemaName.localeCompare(b.cinemaName));
  for (const c of sorted) {
    out.push(
      `| ${c.cinemaName} | ${c.total} | ${c.success} | ${c.anomaly} | ${c.failed} | ${c.lastRun?.toISOString().slice(0, 10) ?? "**never**"} | ${c.recentScreeningCount ?? "—"} | ${c.hasBaseline ? "✓" : "✗"} |`
    );
  }

  const reportPath = join(process.cwd(), "tasks", `trigger-audit-${today}.md`);
  writeFileSync(reportPath, out.join("\n"));

  console.log("");
  console.log(`Silent breakers: ${silentBreakers.length}`);
  console.log(`No recent run (>8d): ${noRecentRun.length}`);
  console.log(`Recurring anomalies: ${recurringAnomalies.length}`);
  console.log(`Recurring failures: ${recurringFailures.length}`);
  console.log(`Missing baseline: ${missingBaseline.length}`);
  console.log("");
  console.log(`Report written: ${reportPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
