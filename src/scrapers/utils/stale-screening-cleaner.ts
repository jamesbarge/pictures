/**
 * Stale Screening Cleaner
 *
 * Removes screenings that are no longer present in the cinema's API.
 * This prevents old/stale data from accumulating in the database.
 *
 * The pipeline's "never delete" policy is good for preserving valid screenings,
 * but when a cinema changes their schedule, old screenings need to be removed.
 */

import { db } from "@/db";
import { screenings } from "@/db/schema";
import { and, eq, gte, lt, not, inArray } from "drizzle-orm";
import type { RawScreening } from "../types";

interface CleanupResult {
  deleted: number;
  preserved: number;
}

/**
 * Remove stale screenings for a cinema that weren't updated in the current scrape.
 *
 * A screening is considered "stale" if:
 * 1. It's for the same cinema
 * 2. It's for a future date (not past screenings)
 * 3. Its source_id is NOT in the current scrape results
 * 4. It was scraped before the current scrape started
 *
 * @param cinemaId - The cinema ID
 * @param freshScreenings - Screenings from the current scrape
 * @param scrapeStartTime - When the current scrape started
 * @returns CleanupResult with counts of deleted and preserved screenings
 */
export async function removeStaleScreenings(
  cinemaId: string,
  freshScreenings: RawScreening[],
  scrapeStartTime: Date
): Promise<CleanupResult> {
  // Get unique source IDs from fresh screenings
  const freshSourceIds = new Set(
    freshScreenings
      .map((s) => s.sourceId)
      .filter((id): id is string => id !== undefined)
  );

  // SAFETY: If no fresh screenings have sourceIds, don't delete anything.
  // This prevents catastrophic deletion when scraper returns empty results
  // or when all screenings lack sourceIds (inArray with empty array = false,
  // so not(inArray(..., [])) = true, which would delete everything).
  if (freshSourceIds.size === 0) {
    console.log(
      `[StaleCleaner] ${cinemaId}: No fresh sourceIds provided, skipping cleanup to prevent data loss`
    );
    return { deleted: 0, preserved: 0 };
  }

  // Find stale screenings:
  // - Same cinema
  // - Future date (not past)
  // - Source ID NOT in fresh screenings
  // - Scraped before this scrape started
  const staleScreenings = await db
    .select({ id: screenings.id, sourceId: screenings.sourceId })
    .from(screenings)
    .where(
      and(
        eq(screenings.cinemaId, cinemaId),
        gte(screenings.datetime, new Date()), // Future screenings only
        not(inArray(screenings.sourceId, Array.from(freshSourceIds))),
        lt(screenings.scrapedAt, scrapeStartTime)
      )
    );

  if (staleScreenings.length === 0) {
    return { deleted: 0, preserved: 0 };
  }

  // Delete stale screenings in batches
  const batchSize = 100;
  let deleted = 0;

  for (let i = 0; i < staleScreenings.length; i += batchSize) {
    const batch = staleScreenings.slice(i, i + batchSize);
    const ids = batch.map((s) => s.id);

    await db.delete(screenings).where(inArray(screenings.id, ids));
    deleted += batch.length;
  }

  console.log(
    `[StaleCleaner] ${cinemaId}: Deleted ${deleted} stale screenings, preserved ${freshSourceIds.size} fresh`
  );

  return {
    deleted,
    preserved: freshSourceIds.size,
  };
}

/**
 * Dry run version - reports what would be deleted without actually deleting
 */
export async function reportStaleScreenings(
  cinemaId: string,
  freshScreenings: RawScreening[],
  scrapeStartTime: Date
): Promise<{ wouldDelete: number; staleScreenings: Array<{ id: string; title?: string; datetime?: Date }> }> {
  const freshSourceIds = new Set(
    freshScreenings
      .map((s) => s.sourceId)
      .filter((id): id is string => id !== undefined)
  );

  // SAFETY: Same guard as removeStaleScreenings
  if (freshSourceIds.size === 0) {
    return { wouldDelete: 0, staleScreenings: [] };
  }

  const staleScreenings = await db
    .select({
      id: screenings.id,
      datetime: screenings.datetime,
    })
    .from(screenings)
    .where(
      and(
        eq(screenings.cinemaId, cinemaId),
        gte(screenings.datetime, new Date()),
        not(inArray(screenings.sourceId, Array.from(freshSourceIds))),
        lt(screenings.scrapedAt, scrapeStartTime)
      )
    );

  return {
    wouldDelete: staleScreenings.length,
    staleScreenings: staleScreenings.map((s) => ({
      id: s.id,
      datetime: s.datetime,
    })),
  };
}
