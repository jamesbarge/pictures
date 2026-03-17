/**
 * DQS Snapshot Persistence
 *
 * Records Data Quality Score at the start and end of every AutoQuality run,
 * creating a time-series for trend analysis. This is the "don't trust the loss"
 * layer — DQS is the optimization target, but the snapshot history lets us verify
 * that improvements are real over time.
 */

import { db, isDatabaseAvailable } from "@/db";
import { dqsSnapshots } from "@/db/schema/admin";
import { eq, desc } from "drizzle-orm";
import type { DqsBreakdown } from "../types";

/**
 * Save a DQS snapshot to the database.
 * Called at the start and end of each AutoQuality run.
 */
export async function saveDqsSnapshot(
  runId: string,
  snapshotType: "start" | "end",
  breakdown: DqsBreakdown,
  totalFilms?: number
): Promise<void> {
  if (!isDatabaseAvailable) {
    console.warn("[dqs-snapshots] DB unavailable — skipping snapshot");
    return;
  }

  try {
    await db.insert(dqsSnapshots).values({
      runId,
      snapshotType,
      compositeScore: breakdown.compositeScore,
      missingTmdbPercent: breakdown.missingTmdbPercent,
      missingPosterPercent: breakdown.missingPosterPercent,
      missingSynopsisPercent: breakdown.missingSynopsisPercent,
      duplicatesPercent: breakdown.duplicatesPercent,
      dodgyEntriesPercent: breakdown.dodgyEntriesPercent,
      totalFilms: totalFilms ?? null,
    });

    console.log(
      `[dqs-snapshots] Saved ${snapshotType} snapshot: DQS ${breakdown.compositeScore.toFixed(1)} (run: ${runId})`
    );
  } catch (err) {
    console.error(`[dqs-snapshots] Failed to save ${snapshotType} snapshot:`, err);
  }
}

/** Shared Drizzle select fields for DQS trend queries. */
const DQS_TREND_FIELDS = {
  runId: dqsSnapshots.runId,
  compositeScore: dqsSnapshots.compositeScore,
  missingTmdbPercent: dqsSnapshots.missingTmdbPercent,
  missingPosterPercent: dqsSnapshots.missingPosterPercent,
  missingSynopsisPercent: dqsSnapshots.missingSynopsisPercent,
  duplicatesPercent: dqsSnapshots.duplicatesPercent,
  dodgyEntriesPercent: dqsSnapshots.dodgyEntriesPercent,
  createdAt: dqsSnapshots.createdAt,
};

export interface DqsTrendEntry {
  runId: string;
  compositeScore: number;
  missingTmdbPercent: number;
  missingPosterPercent: number;
  missingSynopsisPercent: number;
  duplicatesPercent: number;
  dodgyEntriesPercent: number;
  createdAt: Date;
}

/**
 * Load the DQS trend — the last N "end" snapshots in chronological order.
 * Returns newest last (for display as left-to-right timeline).
 */
export async function loadDqsTrend(count = 4): Promise<DqsTrendEntry[]> {
  if (!isDatabaseAvailable) return [];

  try {
    const rows = await db
      .select(DQS_TREND_FIELDS)
      .from(dqsSnapshots)
      .where(eq(dqsSnapshots.snapshotType, "end"))
      .orderBy(desc(dqsSnapshots.createdAt))
      .limit(count);

    // Reverse to chronological order (oldest first)
    return rows.reverse();
  } catch (err) {
    console.warn("[dqs-snapshots] Failed to load trend:", err);
    return [];
  }
}

/**
 * Format DQS trend for the Telegram overnight report.
 *
 * Output example:
 *   DQS TREND: 72.3 → 74.1 → 74.8 → 75.2
 *   tmdb: 18.2→15.1 | poster: 12.1→11.8 | synopsis: 8.3→8.0
 */
export function formatDqsTrend(trend: DqsTrendEntry[]): string[] {
  if (trend.length === 0) return [];

  const lines: string[] = [];

  // Composite score timeline
  const scores = trend.map((t) => t.compositeScore.toFixed(1));
  lines.push(`DQS TREND: ${scores.join(" → ")}`);

  // Per-component breakdown (first → last only, to keep it concise)
  if (trend.length >= 2) {
    const first = trend[0];
    const last = trend[trend.length - 1];

    const components = [
      `tmdb: ${first.missingTmdbPercent.toFixed(1)}→${last.missingTmdbPercent.toFixed(1)}`,
      `poster: ${first.missingPosterPercent.toFixed(1)}→${last.missingPosterPercent.toFixed(1)}`,
      `synopsis: ${first.missingSynopsisPercent.toFixed(1)}→${last.missingSynopsisPercent.toFixed(1)}`,
    ];
    lines.push(components.join(" | "));
  }

  return lines;
}

/**
 * Get the start and end snapshots for a specific run.
 */
export async function getRunSnapshots(
  runId: string
): Promise<{ start?: DqsTrendEntry; end?: DqsTrendEntry }> {
  if (!isDatabaseAvailable) return {};

  try {
    const rows = await db
      .select({ snapshotType: dqsSnapshots.snapshotType, ...DQS_TREND_FIELDS })
      .from(dqsSnapshots)
      .where(eq(dqsSnapshots.runId, runId));

    const result: { start?: DqsTrendEntry; end?: DqsTrendEntry } = {};
    for (const row of rows) {
      if (row.snapshotType === "start") result.start = row;
      if (row.snapshotType === "end") result.end = row;
    }
    return result;
  } catch (err) {
    console.warn("[dqs-snapshots] Failed to load run snapshots:", err);
    return {};
  }
}
