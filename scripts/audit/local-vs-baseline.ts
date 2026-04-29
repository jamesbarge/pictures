#!/usr/bin/env tsx
/**
 * Local-vs-Baseline Diff Audit
 *
 * Phase 8 verification tool for the local-scraping rebuild. After 3+
 * nights of the local Bree+PM2 scheduler running, this script compares
 * recent scraper outputs to the 30-day rolling baseline and surfaces
 * cinemas where the local pipeline is producing materially different
 * counts vs the historical Trigger.dev-driven flow.
 *
 * Output: tasks/local-vs-baseline-YYYY-MM-DD.md (Obsidian-ready markdown)
 *
 * Run: npx tsx --env-file=.env.local scripts/audit/local-vs-baseline.ts
 *      npx tsx --env-file=.env.local scripts/audit/local-vs-baseline.ts --window 7
 */

import { db } from "@/db";
import { scraperRuns } from "@/db/schema/admin";
import { cinemas } from "@/db/schema/cinemas";
import { sql, gte, eq } from "drizzle-orm";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";

interface CinemaDiff {
  cinemaId: string;
  cinemaName: string;
  recentRuns: number;
  recentSuccesses: number;
  recentMedianCount: number | null;
  baselineMedianCount: number | null;
  baselineSampleRuns: number;
  deltaPercent: number | null;
  status: "ok" | "warn" | "regressed" | "no-recent-data" | "no-baseline";
  lastRunAt: Date | null;
}

const DEFAULT_RECENT_WINDOW_DAYS = 3;
const BASELINE_WINDOW_DAYS = 30;

function median(values: number[]): number | null {
  const filtered = values.filter((v): v is number => Number.isFinite(v));
  if (filtered.length === 0) return null;
  const sorted = [...filtered].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function classify(recentMedian: number | null, baselineMedian: number | null): CinemaDiff["status"] {
  if (recentMedian == null) return "no-recent-data";
  if (baselineMedian == null) return "no-baseline";
  if (baselineMedian === 0) return recentMedian === 0 ? "ok" : "warn";
  const delta = (recentMedian - baselineMedian) / baselineMedian;
  if (delta < -0.5) return "regressed";  // recent < 50% of baseline
  if (delta < -0.2) return "warn";        // recent < 80% of baseline
  return "ok";
}

async function main() {
  const args = process.argv.slice(2);
  const windowIndex = args.indexOf("--window");
  const recentDays = windowIndex !== -1 ? parseInt(args[windowIndex + 1], 10) : DEFAULT_RECENT_WINDOW_DAYS;
  if (!Number.isFinite(recentDays) || recentDays < 1) {
    throw new Error(`Invalid --window value (must be a positive integer): got ${recentDays}`);
  }

  const now = new Date();
  const recentSince = new Date(now.getTime() - recentDays * 24 * 60 * 60 * 1000);
  const baselineSince = new Date(now.getTime() - BASELINE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  console.log(`[audit] Recent window: last ${recentDays}d (${recentSince.toISOString().slice(0, 10)} → today)`);
  console.log(`[audit] Baseline window: last ${BASELINE_WINDOW_DAYS}d`);

  const allCinemas = await db.select({ id: cinemas.id, name: cinemas.name }).from(cinemas);

  // Pull successful run counts in both windows
  const recentRows = await db
    .select({
      cinemaId: scraperRuns.cinemaId,
      screeningCount: scraperRuns.screeningCount,
      status: scraperRuns.status,
      completedAt: scraperRuns.completedAt,
    })
    .from(scraperRuns)
    .where(gte(scraperRuns.startedAt, recentSince));

  const baselineRows = await db
    .select({
      cinemaId: scraperRuns.cinemaId,
      screeningCount: scraperRuns.screeningCount,
      status: scraperRuns.status,
    })
    .from(scraperRuns)
    .where(gte(scraperRuns.startedAt, baselineSince));

  const recentByCinema = new Map<string, typeof recentRows>();
  for (const r of recentRows) {
    if (!recentByCinema.has(r.cinemaId)) recentByCinema.set(r.cinemaId, []);
    recentByCinema.get(r.cinemaId)!.push(r);
  }

  const baselineByCinema = new Map<string, typeof baselineRows>();
  for (const r of baselineRows) {
    if (!baselineByCinema.has(r.cinemaId)) baselineByCinema.set(r.cinemaId, []);
    baselineByCinema.get(r.cinemaId)!.push(r);
  }

  const diffs: CinemaDiff[] = [];

  for (const cinema of allCinemas) {
    const recent = recentByCinema.get(cinema.id) ?? [];
    const baseline = baselineByCinema.get(cinema.id) ?? [];

    const recentSuccesses = recent.filter((r) => r.status === "success");
    const baselineSuccesses = baseline.filter((r) => r.status === "success");

    const recentMedian = median(recentSuccesses.map((r) => r.screeningCount ?? 0));
    const baselineMedian = median(baselineSuccesses.map((r) => r.screeningCount ?? 0));

    const lastRunAt = recent
      .map((r) => r.completedAt)
      .filter((d): d is Date => d != null)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    const deltaPercent =
      recentMedian != null && baselineMedian != null && baselineMedian > 0
        ? Math.round(((recentMedian - baselineMedian) / baselineMedian) * 100)
        : null;

    diffs.push({
      cinemaId: cinema.id,
      cinemaName: cinema.name,
      recentRuns: recent.length,
      recentSuccesses: recentSuccesses.length,
      recentMedianCount: recentMedian,
      baselineMedianCount: baselineMedian,
      baselineSampleRuns: baselineSuccesses.length,
      deltaPercent,
      status: classify(recentMedian, baselineMedian),
      lastRunAt,
    });
  }

  diffs.sort((a, b) => {
    const order = ["regressed", "warn", "no-recent-data", "no-baseline", "ok"] as const;
    return order.indexOf(a.status) - order.indexOf(b.status) || a.cinemaName.localeCompare(b.cinemaName);
  });

  const today = new Date().toISOString().slice(0, 10);
  const out: string[] = [];
  out.push(`# Local-vs-Baseline Diff — ${today}`);
  out.push("");
  out.push(`Recent window: last ${recentDays} days`);
  out.push(`Baseline window: last ${BASELINE_WINDOW_DAYS} days`);
  out.push(`Cinemas total: ${diffs.length}`);
  out.push("");

  const counts = {
    regressed: diffs.filter((d) => d.status === "regressed").length,
    warn: diffs.filter((d) => d.status === "warn").length,
    noRecent: diffs.filter((d) => d.status === "no-recent-data").length,
    noBaseline: diffs.filter((d) => d.status === "no-baseline").length,
    ok: diffs.filter((d) => d.status === "ok").length,
  };

  out.push(`| Status | Count |`);
  out.push(`|---|---|`);
  out.push(`| Regressed (recent < 50% of baseline) | ${counts.regressed} |`);
  out.push(`| Warning (recent < 80% of baseline) | ${counts.warn} |`);
  out.push(`| No recent data | ${counts.noRecent} |`);
  out.push(`| No baseline | ${counts.noBaseline} |`);
  out.push(`| OK | ${counts.ok} |`);
  out.push("");

  out.push(`## Per-cinema breakdown`);
  out.push("");
  out.push(`| Status | Cinema | Recent runs | Recent success | Recent median | Baseline median | Δ% | Last run |`);
  out.push(`|---|---|---|---|---|---|---|---|`);
  for (const d of diffs) {
    const icon = {
      regressed: "🔴",
      warn: "🟡",
      "no-recent-data": "⚪",
      "no-baseline": "⚫",
      ok: "🟢",
    }[d.status];
    out.push(
      `| ${icon} ${d.status} | ${d.cinemaName} | ${d.recentRuns} | ${d.recentSuccesses} | ${d.recentMedianCount ?? "—"} | ${d.baselineMedianCount ?? "—"} | ${d.deltaPercent != null ? (d.deltaPercent > 0 ? `+${d.deltaPercent}` : `${d.deltaPercent}`) : "—"} | ${d.lastRunAt?.toISOString().slice(0, 10) ?? "**never**"} |`,
    );
  }

  const reportPath = join(process.cwd(), "tasks", `local-vs-baseline-${today}.md`);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, out.join("\n"));

  console.log("");
  console.log(`Regressed: ${counts.regressed}`);
  console.log(`Warning:   ${counts.warn}`);
  console.log(`No recent: ${counts.noRecent}`);
  console.log(`OK:        ${counts.ok}`);
  console.log("");
  console.log(`Report written: ${reportPath}`);

  // Exit nonzero if anything regressed — useful for CI / cron alerting
  process.exit(counts.regressed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

void sql; // silence unused-import warning if drizzle-orm removes sql in future
void eq;
