/**
 * Silent-breaker detection — Prowlarr-style health state machine.
 *
 * A cinema is quarantined when its most recent N scraper_runs are all
 * `status=success` AND `screening_count=0`. This is the exact failure mode
 * BFI IMAX exhibited in tasks/bfi-imax-regression-2026-04-28.md — the
 * scraper completes cleanly but extracts nothing because the page structure
 * changed.
 *
 * Read-only. Safe to call before, during, or after a scrape run.
 */

import { desc, eq, sql } from "drizzle-orm";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "@/db";
import { scraperRuns } from "@/db/schema/admin";
import { cinemas } from "@/db/schema/cinemas";

export interface QuarantinedCinema {
  cinemaId: string;
  cinemaName: string;
  consecutiveZeroRuns: number;
  lastSuccessfulRunAt: Date | null;
  lastRunAt: Date;
}

/**
 * Inspect each cinema's most recent runs and return those whose last
 * `threshold` consecutive runs were `success && screening_count=0`.
 *
 * The threshold defaults to 2 — matches the spec in
 * `Pictures/Research/scraping-rethink-2026-05/SYNTHESIS.md` (B5: "quarantine
 * threshold = 3 consecutive runs not 1" — but for the MVP we surface at 2 as
 * a warning, the slash command can still operate on it).
 *
 * The function looks at up to `lookback` most recent runs per cinema; runs
 * older than that are ignored. This avoids quarantining a cinema that had a
 * legitimate dry spell weeks ago.
 */
export async function detectSilentBreakers(options?: {
  threshold?: number;
  lookback?: number;
}): Promise<QuarantinedCinema[]> {
  const threshold = options?.threshold ?? 2;
  const lookback = options?.lookback ?? 5;

  const allCinemas = await db.select({ id: cinemas.id, name: cinemas.name }).from(cinemas);
  const quarantined: QuarantinedCinema[] = [];

  for (const cinema of allCinemas) {
    const recentRuns = await db
      .select({
        status: scraperRuns.status,
        screeningCount: scraperRuns.screeningCount,
        startedAt: scraperRuns.startedAt,
      })
      .from(scraperRuns)
      .where(eq(scraperRuns.cinemaId, cinema.id))
      .orderBy(desc(scraperRuns.startedAt))
      .limit(lookback);

    if (recentRuns.length < threshold) continue;

    let consecutiveZero = 0;
    let lastSuccessfulRunAt: Date | null = null;
    for (const run of recentRuns) {
      if (run.status === "success" && (run.screeningCount ?? 0) === 0) {
        consecutiveZero++;
      } else if (run.status === "success" && (run.screeningCount ?? 0) > 0) {
        lastSuccessfulRunAt = run.startedAt;
        break;
      } else {
        break;
      }
    }

    if (consecutiveZero >= threshold) {
      quarantined.push({
        cinemaId: cinema.id,
        cinemaName: cinema.name,
        consecutiveZeroRuns: consecutiveZero,
        lastSuccessfulRunAt,
        lastRunAt: recentRuns[0].startedAt,
      });
    }
  }

  return quarantined.sort((a, b) => b.consecutiveZeroRuns - a.consecutiveZeroRuns);
}

/** Format quarantine list for slash-command output. */
export function formatQuarantineReport(quarantined: QuarantinedCinema[]): string {
  if (quarantined.length === 0) {
    return "No silent breakers detected.";
  }
  const lines = quarantined.map((q) => {
    const lastGood = q.lastSuccessfulRunAt
      ? q.lastSuccessfulRunAt.toISOString().slice(0, 10)
      : "never";
    return `  • ${q.cinemaName}: ${q.consecutiveZeroRuns} consecutive zero-count runs (last good: ${lastGood})`;
  });
  return `Silent breakers (${quarantined.length}):\n${lines.join("\n")}`;
}

export interface StaleCinema {
  cinemaId: string;
  cinemaName: string;
  hoursSinceLastRun: number;
}

/**
 * Returns cinemas whose most recent scraper_run started more than `thresholdHours`
 * ago — orthogonal to silent-breaker detection: a stale cinema may have only had
 * one successful run a week ago, whereas a silent breaker has had recent runs
 * that all return zero screenings.
 *
 * Used in the /scrape post-run report to surface cinemas the user should
 * investigate. Read-only.
 *
 * Inactive cinemas (`is_active = false`) are excluded — they have no scraper
 * by design (e.g. permanently-closed Everyman Walthamstow, orphan `nickel`
 * row superseded by `the-nickel`, defunct Curzon Camden/Richmond/Wimbledon).
 * Including them would mean every /scrape run reports the same 5 "never
 * scraped" zombies indefinitely.
 */
export async function detectStaleCinemas(options?: {
  thresholdHours?: number;
}): Promise<StaleCinema[]> {
  const thresholdHours = options?.thresholdHours ?? 24;

  // For each ACTIVE cinema, get the most recent run's startedAt and compute
  // hours since. Done in a single query rather than N+1.
  const rows = await db.execute(sql`
    SELECT
      c.id AS cinema_id,
      c.name AS cinema_name,
      EXTRACT(EPOCH FROM (NOW() - MAX(r.started_at))) / 3600.0 AS hours_since
    FROM cinemas c
    LEFT JOIN scraper_runs r ON r.cinema_id = c.id
    WHERE c.is_active = true
    GROUP BY c.id, c.name
    HAVING (MAX(r.started_at) IS NULL OR EXTRACT(EPOCH FROM (NOW() - MAX(r.started_at))) / 3600.0 > ${thresholdHours})
    -- NULLS FIRST: never-scraped cinemas are the most urgent case and must
    -- appear at the top of the list. The 15-row slice in
    -- formatStaleCinemaReport would otherwise hide them.
    ORDER BY hours_since DESC NULLS FIRST
  `);

  const list = rows as unknown as Array<{
    cinema_id: string;
    cinema_name: string;
    hours_since: number | null;
  }>;

  return list.map((r) => ({
    cinemaId: r.cinema_id,
    cinemaName: r.cinema_name,
    hoursSinceLastRun: r.hours_since ?? Number.POSITIVE_INFINITY,
  }));
}

/** Format stale-cinema list for slash-command output. */
export function formatStaleCinemaReport(stale: StaleCinema[]): string {
  if (stale.length === 0) {
    return "All cinemas scraped within the last 24h.";
  }
  const lines = stale.slice(0, 15).map((s) => {
    const h =
      s.hoursSinceLastRun === Number.POSITIVE_INFINITY
        ? "never run"
        : `${s.hoursSinceLastRun.toFixed(1)}h`;
    return `  • ${s.cinemaName}: last run ${h} ago`;
  });
  const extra = stale.length > 15 ? `\n  … and ${stale.length - 15} more` : "";
  return `Stale cinemas (${stale.length}):\n${lines.join("\n")}${extra}`;
}

/** Read recent DQS history from .claude/data-check-learnings.json (read-only). */
export interface DqsSnapshot {
  runCount24h: number;
  avgComposite24h: number | null;
  lowestComposite24h: number | null;
}

export function readRecentDqs(): DqsSnapshot {
  try {
    const path = resolve(process.cwd(), ".claude/data-check-learnings.json");
    if (!existsSync(path)) {
      return { runCount24h: 0, avgComposite24h: null, lowestComposite24h: null };
    }
    const data = JSON.parse(readFileSync(path, "utf-8")) as {
      dqsHistory?: Array<{ timestamp: string; compositeScore: number }>;
    };
    const history = data.dqsHistory ?? [];
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recent = history.filter((h) => new Date(h.timestamp).getTime() >= cutoff);
    if (recent.length === 0) {
      return { runCount24h: 0, avgComposite24h: null, lowestComposite24h: null };
    }
    const scores = recent.map((r) => r.compositeScore);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const min = Math.min(...scores);
    return {
      runCount24h: recent.length,
      avgComposite24h: Math.round(avg * 100) / 100,
      lowestComposite24h: Math.round(min * 100) / 100,
    };
  } catch {
    return { runCount24h: 0, avgComposite24h: null, lowestComposite24h: null };
  }
}

export function formatDqsSnapshot(snapshot: DqsSnapshot): string {
  if (snapshot.runCount24h === 0) {
    return "Patrol DQS (24h): no runs recorded.";
  }
  return `Patrol DQS (24h): ${snapshot.runCount24h} runs, avg ${snapshot.avgComposite24h}, low ${snapshot.lowestComposite24h}`;
}
