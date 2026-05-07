/**
 * Scrape Diff Report
 *
 * Compares new scrape data against existing database records to show:
 * - New screenings being added
 * - Screenings that will be removed (no longer on source)
 * - Changes in screening counts
 * - Suspicious patterns (sudden drops, holiday screenings, etc.)
 */

import { db, withDbTimeout } from "@/db";
import { screenings, films, cinemas } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import type { RawScreening } from "../types";
import { format, addDays } from "date-fns";

interface ScrapeDiffReport {
  cinemaId: string;
  cinemaName: string;
  timestamp: Date;

  // Counts
  existingCount: number;
  newCount: number;
  addedCount: number;
  removedCount: number;
  unchangedCount: number;

  // Details
  added: Array<{ title: string; datetime: Date }>;
  removed: Array<{ title: string; datetime: Date; daysSinceScraped: number }>;

  // Warnings
  warnings: string[];

  // Overall status
  hasIssues: boolean;
}

// Thresholds for warnings
const LARGE_DROP_THRESHOLD = 0.5;  // Warn if >50% of screenings removed
const MIN_SCREENINGS_FOR_DROP_CHECK = 5;  // Don't warn about drops for small counts
const MAX_DAYS_IN_FUTURE_FOR_COMPARISON = 30;  // Only compare next 30 days

/**
 * Generate a diff report comparing new scrape data to existing database records
 */
export async function generateScrapeDiff(
  cinemaId: string,
  newScreenings: RawScreening[]
): Promise<ScrapeDiffReport> {
  const now = new Date();
  const futureLimit = addDays(now, MAX_DAYS_IN_FUTURE_FOR_COMPARISON);

  // Get cinema info
  const [cinema] = await withDbTimeout(
    db.select().from(cinemas).where(eq(cinemas.id, cinemaId)),
    15_000,
    `generateScrapeDiff: cinema lookup (${cinemaId})`,
  );

  const cinemaName = cinema?.name ?? cinemaId;

  // Get existing screenings for this cinema (next 30 days)
  const existingScreenings = await withDbTimeout(
    db
      .select({
        id: screenings.id,
        datetime: screenings.datetime,
        filmTitle: films.title,
        scrapedAt: screenings.scrapedAt,
      })
      .from(screenings)
      .innerJoin(films, eq(screenings.filmId, films.id))
      .where(
        and(
          eq(screenings.cinemaId, cinemaId),
          gte(screenings.datetime, now),
          lte(screenings.datetime, futureLimit),
        ),
      ),
    15_000,
    `generateScrapeDiff: existing screenings (${cinemaId})`,
  );

  // Create lookup key for screenings (title + datetime)
  const makeKey = (title: string, datetime: Date) =>
    `${title.toLowerCase().trim()}|${datetime.toISOString()}`;

  // Build sets of existing and new screenings
  const existingSet = new Map<string, { title: string; datetime: Date; scrapedAt: Date | null }>();
  for (const s of existingScreenings) {
    existingSet.set(makeKey(s.filmTitle, s.datetime), {
      title: s.filmTitle,
      datetime: s.datetime,
      scrapedAt: s.scrapedAt,
    });
  }

  const newSet = new Set<string>();
  for (const s of newScreenings) {
    if (s.datetime >= now && s.datetime <= futureLimit) {
      newSet.add(makeKey(s.filmTitle, s.datetime));
    }
  }

  // Find added and removed screenings
  const added: Array<{ title: string; datetime: Date }> = [];
  const removed: Array<{ title: string; datetime: Date; daysSinceScraped: number }> = [];

  // New screenings not in existing
  for (const s of newScreenings) {
    if (s.datetime >= now && s.datetime <= futureLimit) {
      const key = makeKey(s.filmTitle, s.datetime);
      if (!existingSet.has(key)) {
        added.push({ title: s.filmTitle, datetime: s.datetime });
      }
    }
  }

  // Existing screenings not in new
  for (const [key, data] of existingSet) {
    if (!newSet.has(key)) {
      const daysSinceScraped = data.scrapedAt
        ? Math.floor((now.getTime() - data.scrapedAt.getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      removed.push({
        title: data.title,
        datetime: data.datetime,
        daysSinceScraped,
      });
    }
  }

  // Generate warnings
  const warnings: string[] = [];

  // Warning: Large drop in screenings
  if (
    existingScreenings.length >= MIN_SCREENINGS_FOR_DROP_CHECK &&
    removed.length > existingScreenings.length * LARGE_DROP_THRESHOLD
  ) {
    warnings.push(
      `LARGE_DROP: ${removed.length}/${existingScreenings.length} screenings removed (${Math.round((removed.length / existingScreenings.length) * 100)}%) - possible scraper issue`
    );
  }

  // Warning: All screenings removed (scraper likely broken)
  if (existingScreenings.length > 0 && newSet.size === 0) {
    warnings.push(
      `SCRAPER_BROKEN: All ${existingScreenings.length} screenings would be removed - scraper may have failed`
    );
  }

  // Warning: New screenings on Christmas Day
  for (const s of added) {
    const month = s.datetime.getMonth() + 1;
    const day = s.datetime.getDate();
    if (month === 12 && day === 25) {
      warnings.push(`HOLIDAY: New screening on Christmas Day: ${s.title}`);
    }
  }

  // Warning: Recently added screenings being removed
  for (const s of removed) {
    if (s.daysSinceScraped <= 1) {
      warnings.push(
        `RECENTLY_ADDED_THEN_REMOVED: "${s.title}" was added ${s.daysSinceScraped} days ago and is now gone`
      );
    }
  }

  const unchangedCount = existingSet.size - removed.length;

  return {
    cinemaId,
    cinemaName,
    timestamp: now,
    existingCount: existingScreenings.length,
    newCount: newSet.size,
    addedCount: added.length,
    removedCount: removed.length,
    unchangedCount,
    added: added.sort((a, b) => a.datetime.getTime() - b.datetime.getTime()),
    removed: removed.sort((a, b) => a.datetime.getTime() - b.datetime.getTime()),
    warnings,
    hasIssues: warnings.length > 0,
  };
}

/**
 * Print diff report to console
 */
export function printDiffReport(report: ScrapeDiffReport): void {
  console.log(`\n=== ${report.cinemaName} Scrape Diff ===`);
  console.log(`Timestamp: ${format(report.timestamp, "yyyy-MM-dd HH:mm:ss")}`);
  console.log(`Existing: ${report.existingCount} | New: ${report.newCount}`);
  console.log(
    `Added: ${report.addedCount} | Removed: ${report.removedCount} | Unchanged: ${report.unchangedCount}`
  );

  if (report.added.length > 0) {
    console.log("\nADDED:");
    for (const s of report.added.slice(0, 10)) {
      console.log(`  + ${s.title} @ ${format(s.datetime, "EEE d MMM HH:mm")}`);
    }
    if (report.added.length > 10) {
      console.log(`  ... and ${report.added.length - 10} more`);
    }
  }

  if (report.removed.length > 0) {
    console.log("\nREMOVED:");
    for (const s of report.removed.slice(0, 10)) {
      const recentFlag = s.daysSinceScraped <= 1 ? " [RECENT!]" : "";
      console.log(
        `  - ${s.title} @ ${format(s.datetime, "EEE d MMM HH:mm")}${recentFlag}`
      );
    }
    if (report.removed.length > 10) {
      console.log(`  ... and ${report.removed.length - 10} more`);
    }
  }

  if (report.warnings.length > 0) {
    console.log("\n⚠️  WARNINGS:");
    for (const w of report.warnings) {
      console.log(`  ! ${w}`);
    }
  }

  console.log("");
}

/**
 * Check if diff report indicates serious issues that should block the scrape
 */
export function shouldBlockScrape(report: ScrapeDiffReport): boolean {
  // Block if it looks like the scraper is broken (all screenings removed)
  const hasBrokenScraperWarning = report.warnings.some((w) =>
    w.startsWith("SCRAPER_BROKEN")
  );

  return hasBrokenScraperWarning;
}
