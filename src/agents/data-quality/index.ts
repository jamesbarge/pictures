/**
 * Data Quality Verification Agent
 *
 * Comprehensive verification of film and screening data using:
 * - Claude in Chrome for visual verification
 * - API checks for data completeness
 * - Duplicate detection
 * - Link validation
 *
 * Can run:
 * - Post-scrape (via pipeline hook)
 * - On-demand (via CLI)
 */

import { db, schema } from "@/db";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import { type AgentResult } from "../types";

const AGENT_NAME = "data-quality";

// Types
export interface DataQualityIssue {
  type: "missing_data" | "broken_link" | "duplicate" | "visual_issue" | "invalid_time";
  severity: "critical" | "warning" | "info";
  entityType: "film" | "screening" | "cinema";
  entityId: string;
  field?: string;
  details: string;
  suggestion?: string;
}

export interface DataQualityReport {
  checkedAt: Date;
  filmsChecked: number;
  screeningsChecked: number;
  issues: DataQualityIssue[];
  summary: {
    critical: number;
    warnings: number;
    info: number;
  };
}

interface VerifyOptions {
  cinemaId?: string;
  recent?: boolean; // Only check items added in last 24h
  quick?: boolean; // Skip browser verification
  limit?: number;
}

/**
 * Main verification function
 */
export async function verifyDataQuality(
  options: VerifyOptions = {}
): Promise<AgentResult<DataQualityReport>> {
  const startTime = Date.now();
  const issues: DataQualityIssue[] = [];

  console.log(`[${AGENT_NAME}] Starting data quality verification...`);

  try {
    // 1. Check film data completeness
    const filmIssues = await checkFilmCompleteness(options);
    issues.push(...filmIssues);

    // 2. Check for duplicate films
    const duplicateIssues = await checkDuplicateFilms();
    issues.push(...duplicateIssues);

    // 3. Check screening validity
    const screeningIssues = await checkScreeningValidity(options);
    issues.push(...screeningIssues);

    // 4. Check booking links (sample)
    const linkIssues = await checkBookingLinks(options);
    issues.push(...linkIssues);

    // 5. Visual verification (if not quick mode and browser available)
    if (!options.quick) {
      const visualIssues = await runVisualVerification(options);
      issues.push(...visualIssues);
    }

    // Build report
    const report: DataQualityReport = {
      checkedAt: new Date(),
      filmsChecked: await countFilmsChecked(options),
      screeningsChecked: await countScreeningsChecked(options),
      issues,
      summary: {
        critical: issues.filter((i) => i.severity === "critical").length,
        warnings: issues.filter((i) => i.severity === "warning").length,
        info: issues.filter((i) => i.severity === "info").length,
      },
    };

    // Log summary
    console.log(`[${AGENT_NAME}] Verification complete:`);
    console.log(`  Films checked: ${report.filmsChecked}`);
    console.log(`  Screenings checked: ${report.screeningsChecked}`);
    console.log(`  Issues found: ${issues.length}`);
    console.log(`    Critical: ${report.summary.critical}`);
    console.log(`    Warnings: ${report.summary.warnings}`);
    console.log(`    Info: ${report.summary.info}`);

    return {
      success: true,
      data: report,
      tokensUsed: 0, // Updated if AI calls are made
      executionTimeMs: Date.now() - startTime,
      agentName: AGENT_NAME,
      timestamp: new Date(),
    };
  } catch (error) {
    console.error(`[${AGENT_NAME}] Error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      tokensUsed: 0,
      executionTimeMs: Date.now() - startTime,
      agentName: AGENT_NAME,
      timestamp: new Date(),
    };
  }
}

/**
 * Check film records for missing required data
 */
async function checkFilmCompleteness(options: VerifyOptions): Promise<DataQualityIssue[]> {
  console.log(`[${AGENT_NAME}] Checking film completeness...`);
  const issues: DataQualityIssue[] = [];

  // Build query conditions
  let query = db
    .select({
      id: schema.films.id,
      title: schema.films.title,
      year: schema.films.year,
      posterUrl: schema.films.posterUrl,
      directors: schema.films.directors,
      tmdbId: schema.films.tmdbId,
      createdAt: schema.films.createdAt,
    })
    .from(schema.films)
    .$dynamic();

  if (options.recent) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    query = query.where(gte(schema.films.createdAt, yesterday));
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const films = await query;

  for (const film of films) {
    // Check for missing poster
    if (!film.posterUrl) {
      issues.push({
        type: "missing_data",
        severity: "warning",
        entityType: "film",
        entityId: film.id,
        field: "posterUrl",
        details: `Film "${film.title}" has no poster image`,
        suggestion: "Run TMDB enrichment or add poster manually",
      });
    }

    // Check for missing year
    if (!film.year) {
      issues.push({
        type: "missing_data",
        severity: "warning",
        entityType: "film",
        entityId: film.id,
        field: "year",
        details: `Film "${film.title}" has no year`,
        suggestion: "Check TMDB match or add year manually",
      });
    }

    // Check for missing directors (if not an event)
    if ((!film.directors || film.directors.length === 0) && film.tmdbId) {
      issues.push({
        type: "missing_data",
        severity: "info",
        entityType: "film",
        entityId: film.id,
        field: "directors",
        details: `Film "${film.title}" has no directors listed`,
        suggestion: "Check TMDB data",
      });
    }

    // Check for films without TMDB match
    if (!film.tmdbId && film.year && film.year < 2025) {
      issues.push({
        type: "missing_data",
        severity: "info",
        entityType: "film",
        entityId: film.id,
        field: "tmdbId",
        details: `Film "${film.title}" (${film.year}) not matched to TMDB`,
        suggestion: "May need manual TMDB matching",
      });
    }
  }

  console.log(`[${AGENT_NAME}] Film check: ${films.length} films, ${issues.length} issues`);
  return issues;
}

/**
 * Check for potential duplicate films
 */
async function checkDuplicateFilms(): Promise<DataQualityIssue[]> {
  console.log(`[${AGENT_NAME}] Checking for duplicate films...`);
  const issues: DataQualityIssue[] = [];

  // Find films with very similar normalized titles
  const duplicates = await db.execute(sql`
    WITH normalized_films AS (
      SELECT
        id,
        title,
        year,
        LOWER(REGEXP_REPLACE(title, '[^a-zA-Z0-9]', '', 'g')) as normalized_title
      FROM films
    )
    SELECT
      f1.id as id1,
      f1.title as title1,
      f1.year as year1,
      f2.id as id2,
      f2.title as title2,
      f2.year as year2
    FROM normalized_films f1
    JOIN normalized_films f2 ON
      f1.normalized_title = f2.normalized_title
      AND f1.id < f2.id
    LIMIT 50
  `);

  type DuplicateRow = {
    id1: string;
    title1: string;
    year1: number | null;
    id2: string;
    title2: string;
    year2: number | null;
  };

  const rows: DuplicateRow[] = Array.isArray(duplicates)
    ? (duplicates as unknown as DuplicateRow[])
    : ((duplicates as unknown as { rows?: DuplicateRow[] }).rows ?? []);

  for (const row of rows) {
    // If years match or one is null, likely duplicate
    if (!row.year1 || !row.year2 || row.year1 === row.year2) {
      issues.push({
        type: "duplicate",
        severity: "warning",
        entityType: "film",
        entityId: row.id1,
        details: `Potential duplicate: "${row.title1}" and "${row.title2}"`,
        suggestion: `Consider merging film ${row.id2} into ${row.id1}`,
      });
    }
  }

  console.log(`[${AGENT_NAME}] Duplicate check: ${issues.length} potential duplicates`);
  return issues;
}

/**
 * Check screening data validity
 */
async function checkScreeningValidity(options: VerifyOptions = {}): Promise<DataQualityIssue[]> {
  console.log(`[${AGENT_NAME}] Checking screening validity...`);
  const issues: DataQualityIssue[] = [];
  const now = new Date();

  // Build conditions - always filter future screenings, optionally by cinema
  const conditions = [
    gte(schema.screenings.datetime, now),
    // Check for screenings before 10am in UK time
    sql`EXTRACT(HOUR FROM ${schema.screenings.datetime} AT TIME ZONE 'Europe/London') < 10`,
  ];
  if (options.cinemaId) {
    conditions.push(eq(schema.screenings.cinemaId, options.cinemaId));
  }

  const earlyScreenings = await db
    .select({
      id: schema.screenings.id,
      datetime: schema.screenings.datetime,
      // Also get the UK hour from SQL to ensure consistency
      ukHour: sql<number>`EXTRACT(HOUR FROM ${schema.screenings.datetime} AT TIME ZONE 'Europe/London')`,
      filmTitle: schema.films.title,
      cinemaName: schema.cinemas.name,
    })
    .from(schema.screenings)
    .innerJoin(schema.films, eq(schema.screenings.filmId, schema.films.id))
    .innerJoin(schema.cinemas, eq(schema.screenings.cinemaId, schema.cinemas.id))
    .where(and(...conditions))
    .limit(options.limit || 20);

  for (const screening of earlyScreenings) {
    // Use the UK hour from SQL to avoid DST inconsistencies
    const ukHour = Number(screening.ukHour);
    // Allow 9am matinees but flag anything earlier
    if (ukHour < 9) {
      issues.push({
        type: "invalid_time",
        severity: "warning",
        entityType: "screening",
        entityId: screening.id,
        field: "datetime",
        details: `"${screening.filmTitle}" at ${screening.cinemaName} scheduled for ${screening.datetime.toISOString()} (${ukHour}:00 UK time - very early)`,
        suggestion: "Verify time parsing is correct (AM/PM confusion?)",
      });
    }
  }

  console.log(`[${AGENT_NAME}] Screening check: ${issues.length} issues`);
  return issues;
}

/**
 * Check a sample of booking links
 */
async function checkBookingLinks(options: VerifyOptions): Promise<DataQualityIssue[]> {
  console.log(`[${AGENT_NAME}] Checking booking links...`);
  const issues: DataQualityIssue[] = [];
  const now = new Date();

  // Build conditions - filter by cinema if specified
  const conditions = [gte(schema.screenings.datetime, now)];
  if (options.cinemaId) {
    conditions.push(eq(schema.screenings.cinemaId, options.cinemaId));
  }

  // Get sample of upcoming screenings
  const screeningsToCheck = await db
    .select({
      id: schema.screenings.id,
      bookingUrl: schema.screenings.bookingUrl,
      filmTitle: schema.films.title,
      cinemaName: schema.cinemas.name,
    })
    .from(schema.screenings)
    .innerJoin(schema.films, eq(schema.screenings.filmId, schema.films.id))
    .innerJoin(schema.cinemas, eq(schema.screenings.cinemaId, schema.cinemas.id))
    .where(and(...conditions))
    .orderBy(desc(schema.screenings.scrapedAt))
    .limit(options.limit || 20);

  for (const screening of screeningsToCheck) {
    if (!screening.bookingUrl) {
      issues.push({
        type: "broken_link",
        severity: "warning",
        entityType: "screening",
        entityId: screening.id,
        field: "bookingUrl",
        details: `"${screening.filmTitle}" at ${screening.cinemaName} has no booking URL`,
      });
      continue;
    }

    // Basic URL validation
    try {
      new URL(screening.bookingUrl);
    } catch {
      issues.push({
        type: "broken_link",
        severity: "critical",
        entityType: "screening",
        entityId: screening.id,
        field: "bookingUrl",
        details: `Invalid booking URL for "${screening.filmTitle}": ${screening.bookingUrl}`,
      });
    }

    // Check for placeholder URLs
    if (
      screening.bookingUrl.includes("example.com") ||
      screening.bookingUrl.includes("placeholder") ||
      screening.bookingUrl.includes("TODO")
    ) {
      issues.push({
        type: "broken_link",
        severity: "critical",
        entityType: "screening",
        entityId: screening.id,
        field: "bookingUrl",
        details: `Placeholder booking URL for "${screening.filmTitle}"`,
      });
    }
  }

  console.log(`[${AGENT_NAME}] Link check: ${screenings.length} checked, ${issues.length} issues`);
  return issues;
}

/**
 * Visual verification using Claude in Chrome
 * This is the browser-based verification component
 */
async function runVisualVerification(_options: VerifyOptions = {}): Promise<DataQualityIssue[]> {
  console.log(`[${AGENT_NAME}] Visual verification requires Claude in Chrome connection...`);
  void _options;

  // Note: This function is designed to be called when Claude in Chrome is available
  // In a standalone script context, we skip visual verification
  // The visual verification happens through the MCP browser tools when available

  // For now, return empty - visual verification is done interactively
  // TODO: Implement headless Playwright-based verification as fallback
  return [];
}

/**
 * Helper to count films checked
 */
async function countFilmsChecked(options: VerifyOptions): Promise<number> {
  let query = db.select({ count: sql<number>`count(*)` }).from(schema.films).$dynamic();

  if (options.recent) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    query = query.where(gte(schema.films.createdAt, yesterday));
  }

  const result = await query;
  return Number(result[0]?.count || 0);
}

/**
 * Helper to count screenings checked
 */
async function countScreeningsChecked(options: VerifyOptions): Promise<number> {
  const now = new Date();

  // Build conditions array to avoid where() override issue in dynamic mode
  const conditions = [gte(schema.screenings.datetime, now)];
  if (options.cinemaId) {
    conditions.push(eq(schema.screenings.cinemaId, options.cinemaId));
  }

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.screenings)
    .where(and(...conditions));

  return Number(result[0]?.count || 0);
}

/**
 * Run verification after a scrape completes (pipeline hook)
 */
export async function verifyAfterScrape(
  cinemaId: string,
  screeningsAdded: number
): Promise<void> {
  if (screeningsAdded === 0) {
    console.log(`[${AGENT_NAME}] No new screenings, skipping verification`);
    return;
  }

  console.log(`[${AGENT_NAME}] Running post-scrape verification for ${cinemaId}...`);

  const result = await verifyDataQuality({
    cinemaId,
    recent: true,
    quick: true, // Don't do visual verification in pipeline
    limit: 50,
  });

  if (result.success && result.data) {
    const { summary } = result.data;
    if (summary.critical > 0) {
      console.warn(`[${AGENT_NAME}] ⚠️ Found ${summary.critical} critical issues after scrape!`);
      // TODO: Send alert (Slack, email, etc.)
    }
  }
}
