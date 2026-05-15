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

// ─────────────────────────────────────────────────────────────────────────
// Flaky-cinema detector
// ─────────────────────────────────────────────────────────────────────────
// Complements detectSilentBreakers. Silent-breaker detection only fires when
// recent runs are all `success && screening_count=0` CONSECUTIVELY. That
// misses a real failure mode: a scraper that returns 0 screenings on ~half
// its runs and full data on the other half (e.g. BFI IMAX in May 2026 had
// 14/21 success+0 over 7 days, but never 2 in a row, so quarantine never
// flagged it). This detector evaluates the ratio across a wider window.

export type FlakySeverity = "warn" | "critical";

export interface FlakyCinema {
  cinemaId: string;
  cinemaName: string;
  totalRuns: number;
  emptySuccessCount: number;
  failedCount: number;
  emptyRatio: number;          // 0..1 — share of runs that returned success+0
  failedRatio: number;         // 0..1 — share of runs that errored outright
  lastGoodRunAt: Date | null;  // most recent success with screening_count > 0
  lastRunAt: Date;
  reasons: string[];           // human-readable signals that fired
  severity: FlakySeverity;
}

/** Minimal shape used by the pure analyzer — DB-free for easy testing. */
export interface RunRecord {
  status: string;
  screeningCount: number | null;
  startedAt: Date;
}

/**
 * Flaky-detection thresholds. Exposed as a type so call-sites (slash command,
 * scheduled jobs, tests) can tune them centrally rather than copying defaults.
 *
 * Defaults are calibrated against May 2026 ground truth:
 *   - BFI Southbank (50% empty success) → warn
 *   - BFI IMAX (67% empty success)      → critical
 *   - Close-Up (33% failed)             → warn
 */
export interface FlakyThresholds {
  /** Minimum runs in the window before evaluating (avoids false positives on brand-new cinemas). */
  minRuns: number;
  /** lookback: how many of the most recent runs to inspect. */
  lookback: number;
  /** Empty-success ratio that triggers a `warn` severity. */
  emptyRatioWarn: number;
  /** Empty-success ratio that triggers a `critical` severity. */
  emptyRatioCritical: number;
  /** Failed-status ratio that triggers a `warn` severity. */
  failedRatioWarn: number;
  /** Failed-status ratio that triggers a `critical` severity. */
  failedRatioCritical: number;
}

export const DEFAULT_FLAKY_THRESHOLDS: FlakyThresholds = {
  minRuns: 4,
  lookback: 10,
  emptyRatioWarn: 0.3,
  emptyRatioCritical: 0.5,
  failedRatioWarn: 0.3,
  failedRatioCritical: 0.5,
};

/**
 * Pure analyzer — given a window of recent runs, returns a flakiness verdict.
 * Decoupled from the DB so the policy logic is unit-testable in isolation.
 *
 * `runs` may be passed in any order — the function sorts internally by
 * `startedAt` descending, so `runs[0]` after sort is the most recent. This
 * removes a footgun where callers could otherwise silently produce wrong
 * `lastRunAt` / `lastGoodRunAt` by passing ASC-sorted data.
 *
 * Returns `null` if the cinema isn't flaky (or doesn't have enough runs yet).
 */
export function analyzeRunsForFlakiness(
  rawRuns: RunRecord[],
  thresholds: FlakyThresholds = DEFAULT_FLAKY_THRESHOLDS,
): Omit<FlakyCinema, "cinemaId" | "cinemaName"> | null {
  if (rawRuns.length < thresholds.minRuns) return null;

  // Sort by startedAt descending so runs[0] is the most recent regardless of
  // how the caller ordered them. Cheap (≤ lookback elements).
  const runs = [...rawRuns].sort(
    (a, b) => b.startedAt.getTime() - a.startedAt.getTime(),
  );

  const emptySuccessCount = runs.filter(
    (r) => r.status === "success" && (r.screeningCount ?? 0) === 0,
  ).length;
  const failedCount = runs.filter((r) => r.status === "failed").length;
  const emptyRatio = emptySuccessCount / runs.length;
  const failedRatio = failedCount / runs.length;
  const lastGoodRunAt =
    runs.find((r) => r.status === "success" && (r.screeningCount ?? 0) > 0)?.startedAt ?? null;

  const reasons: string[] = [];
  let severity: FlakySeverity | null = null;

  const bump = (next: FlakySeverity) => {
    if (severity === null) severity = next;
    else if (severity === "warn" && next === "critical") severity = "critical";
  };

  if (emptyRatio >= thresholds.emptyRatioCritical) {
    reasons.push(`${Math.round(emptyRatio * 100)}% of recent runs returned success+0`);
    bump("critical");
  } else if (emptyRatio >= thresholds.emptyRatioWarn) {
    reasons.push(`${Math.round(emptyRatio * 100)}% of recent runs returned success+0`);
    bump("warn");
  }

  if (failedRatio >= thresholds.failedRatioCritical) {
    reasons.push(`${Math.round(failedRatio * 100)}% of recent runs failed outright`);
    bump("critical");
  } else if (failedRatio >= thresholds.failedRatioWarn) {
    reasons.push(`${Math.round(failedRatio * 100)}% of recent runs failed outright`);
    bump("warn");
  }

  if (severity === null) return null;

  return {
    totalRuns: runs.length,
    emptySuccessCount,
    failedCount,
    emptyRatio,
    failedRatio,
    lastGoodRunAt,
    lastRunAt: runs[0].startedAt,
    reasons,
    severity,
  };
}

/**
 * Walk every active cinema, fetch its most recent runs, and return those whose
 * outcome distribution looks unhealthy by the configured thresholds.
 *
 * Read-only — safe to call before, during, or after a scrape run.
 *
 * Performance: collapses the per-cinema fetch into a single windowed query
 * (ROW_NUMBER() OVER (PARTITION BY cinema_id ORDER BY started_at DESC) <=
 * lookback). Going from 60 round-trips to 1 cuts pre-flight from ~2s to <100ms.
 */
export async function detectFlakyCinemas(
  thresholds: FlakyThresholds = DEFAULT_FLAKY_THRESHOLDS,
): Promise<FlakyCinema[]> {
  const rows = (await db.execute(sql`
    WITH ranked AS (
      SELECT
        r.cinema_id,
        r.status,
        r.screening_count,
        r.started_at,
        ROW_NUMBER() OVER (PARTITION BY r.cinema_id ORDER BY r.started_at DESC) AS rn
      FROM scraper_runs r
      JOIN cinemas c ON c.id = r.cinema_id
      WHERE c.is_active = true
    )
    SELECT
      ranked.cinema_id,
      cinemas.name AS cinema_name,
      ranked.status,
      ranked.screening_count,
      ranked.started_at
    FROM ranked
    JOIN cinemas ON cinemas.id = ranked.cinema_id
    WHERE ranked.rn <= ${thresholds.lookback}
    ORDER BY ranked.cinema_id, ranked.started_at DESC
  `)) as unknown as Array<{
    cinema_id: string;
    cinema_name: string;
    status: string;
    screening_count: number | null;
    started_at: Date;
  }>;

  // Group by cinema, then run the pure analyzer over each window.
  const byCinema = new Map<
    string,
    { name: string; runs: RunRecord[] }
  >();
  for (const row of rows) {
    const startedAt =
      row.started_at instanceof Date
        ? row.started_at
        : new Date(row.started_at);
    let entry = byCinema.get(row.cinema_id);
    if (!entry) {
      entry = { name: row.cinema_name, runs: [] };
      byCinema.set(row.cinema_id, entry);
    }
    entry.runs.push({
      status: row.status,
      screeningCount: row.screening_count,
      startedAt,
    });
  }

  const flaky: FlakyCinema[] = [];
  for (const [cinemaId, { name, runs }] of byCinema) {
    const verdict = analyzeRunsForFlakiness(runs, thresholds);
    if (verdict !== null) {
      flaky.push({ cinemaId, cinemaName: name, ...verdict });
    }
  }

  // critical first, then by emptyRatio desc — most-broken-first
  return flaky.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return b.emptyRatio - a.emptyRatio;
  });
}

/** Format the flaky list for slash-command output. */
export function formatFlakyReport(flaky: FlakyCinema[]): string {
  if (flaky.length === 0) {
    return "No flaky cinemas detected.";
  }
  const lines = flaky.map((f) => {
    const tag = f.severity === "critical" ? "🔴 critical" : "🟡 warn";
    const lastGood = f.lastGoodRunAt
      ? f.lastGoodRunAt.toISOString().slice(0, 10)
      : "never";
    const reasonText = f.reasons.join(", ");
    return `  • ${tag} ${f.cinemaName} (${f.totalRuns} runs): ${reasonText} — last good ${lastGood}`;
  });
  return `Flaky cinemas (${flaky.length}):\n${lines.join("\n")}`;
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
