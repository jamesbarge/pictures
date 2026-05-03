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

import { desc, eq } from "drizzle-orm";
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
