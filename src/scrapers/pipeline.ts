/**
 * Scraper Pipeline
 * Normalizes, enriches, and persists scraped screening data
 */

import { db } from "@/db";
import { screenings as screeningsTable, cinemas, festivals, festivalScreenings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { extractFilmTitleCached, batchExtractTitles } from "@/lib/title-extraction";
import type { RawScreening } from "./types";
import { v4 as uuidv4 } from "uuid";
import { validateScreenings, printValidationSummary } from "./utils/screening-validator";
import { generateScrapeDiff, printDiffReport, shouldBlockScrape } from "./utils/scrape-diff";
import { linkFilmToMatchingSeasons } from "./seasons/season-linker";

// Extracted utility modules
import {
  initFilmCache,
  lookupFilmInCache,
  logCacheStats,
  findFilmBySimilarity,
  matchAndCreateFromTMDB,
  createFilmWithoutTMDB,
  tryUpdatePoster,
} from "./utils/film-matching";
import {
  classifyScreening,
  checkForDuplicate,
} from "./utils/screening-classification";

// Import for local use + re-export for external consumers
import { cleanFilmTitle } from "./utils/film-title-cleaner";
export { cleanFilmTitle } from "./utils/film-title-cleaner";

// Agent imports - conditionally used when ENABLE_AGENTS=true
const AGENTS_ENABLED = process.env.ENABLE_AGENTS === "true";

export interface PipelineResult {
  cinemaId: string;
  added: number;
  updated: number;
  failed: number;
  rejected: number;  // Validation failures
  blocked: boolean;  // True when scrape was blocked by diff check
  scrapedAt: Date;
}

/**
 * Normalize a film title for comparison
 * Uses unicode-aware normalization that preserves accented characters:
 * - "Amélie" → "amelie" (not "amlie" which the old [^\w\s] produced)
 * - "Delicatessen" → "delicatessen"
 * - "Crouching Tiger, Hidden Dragon" → "crouching tiger hidden dragon"
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFKD")                    // Decompose unicode (é → e + combining accent)
    .replace(/[\u0300-\u036f]/g, "")      // Strip combining diacritical marks only
    .toLowerCase()
    .replace(/^the\s+/i, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")     // Unicode-aware: keep letters + numbers + spaces
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Process raw screenings through the full pipeline
 *
 * IMPORTANT: This function ONLY ADDS or UPDATES screenings.
 * It NEVER DELETES existing screenings. If a scraper returns fewer
 * results than before, existing screenings are preserved.
 * See CLAUDE.md for the "Never Delete Valid Screenings" rule.
 */
export async function processScreenings(
  cinemaId: string,
  rawScreenings: RawScreening[]
): Promise<PipelineResult> {
  console.log(`[Pipeline] Processing ${rawScreenings.length} screenings for ${cinemaId}`);

  // Validate screenings before processing - reject invalid data early
  const { validScreenings, rejectedScreenings, summary } = validateScreenings(rawScreenings);

  if (rejectedScreenings.length > 0) {
    console.warn(`[Pipeline] Rejected ${rejectedScreenings.length} invalid screenings`);
    printValidationSummary(summary);
  }

  // Use validated screenings for rest of pipeline
  const screeningsToProcess = validScreenings;
  console.log(`[Pipeline] ${screeningsToProcess.length} valid screenings to process`);

  // Generate diff report to detect suspicious patterns
  const diffReport = await generateScrapeDiff(cinemaId, screeningsToProcess);
  if (diffReport.hasIssues) {
    printDiffReport(diffReport);

    // Block scrape if it looks like the scraper is broken
    if (shouldBlockScrape(diffReport)) {
      console.error(`[Pipeline] BLOCKED: Scrape appears broken - ${diffReport.warnings[0]}`);
      return {
        cinemaId,
        added: 0,
        updated: 0,
        failed: rawScreenings.length,
        rejected: rejectedScreenings.length,
        blocked: true,
        scrapedAt: new Date(),
      };
    }
  }

  // Initialize film cache for O(1) lookups
  await initFilmCache(normalizeTitle);

  const result: PipelineResult = {
    cinemaId,
    added: 0,
    updated: 0,
    failed: 0,
    rejected: rejectedScreenings.length,
    blocked: false,
    scrapedAt: new Date(),
  };

  // Extract film titles using AI for event-style names
  // This ensures "Saturday Morning Picture Club: The Muppets Christmas Carol" and
  // "The Muppets Christmas Carol" get grouped together
  const uniqueRawTitles = [...new Set(screeningsToProcess.map((s) => s.filmTitle))];
  console.log(`[Pipeline] Extracting titles from ${uniqueRawTitles.length} unique raw titles`);
  const titleExtractions = await batchExtractTitles(uniqueRawTitles);

  // Group screenings by canonical title for deduplication
  // This ensures "Apocalypse Now" and "Apocalypse Now : Final Cut" are grouped together
  const screeningsByFilm = new Map<string, RawScreening[]>();
  for (const screening of screeningsToProcess) {
    const extraction = titleExtractions.get(screening.filmTitle);
    // Use canonical title for grouping (base title without version suffixes)
    // Fall back to filmTitle if canonicalTitle is not available
    let matchingTitle = extraction?.canonicalTitle ?? extraction?.filmTitle ?? screening.filmTitle;
    if (extraction?.confidence === "low" && !extraction.canonicalTitle) {
      matchingTitle = cleanFilmTitle(screening.filmTitle);
    }
    const key = normalizeTitle(matchingTitle);
    if (!screeningsByFilm.has(key)) {
      screeningsByFilm.set(key, []);
    }
    screeningsByFilm.get(key)!.push(screening);
  }

  console.log(`[Pipeline] ${screeningsByFilm.size} unique films after AI extraction`);

  // Process each film
  for (const [normalizedTitle, filmScreenings] of screeningsByFilm) {
    try {
      // Get the first screening for film metadata (use any scraper-provided data)
      const firstScreening = filmScreenings[0];

      // Get or create film record, passing any scraper-extracted metadata
      const filmId = await getOrCreateFilm(
        firstScreening.filmTitle,
        firstScreening.year,
        firstScreening.director,
        firstScreening.posterUrl
      );

      if (!filmId) {
        console.warn(`[Pipeline] Could not create film: ${firstScreening.filmTitle}`);
        result.failed += filmScreenings.length;
        continue;
      }

      // Link film to any matching seasons
      // This ensures films are associated with seasons as soon as they're scraped
      await linkFilmToMatchingSeasons(filmId, firstScreening.filmTitle);

      // Insert screenings
      for (const screening of filmScreenings) {
        const added = await insertScreening(filmId, cinemaId, screening);
        if (added) {
          result.added++;
        } else {
          result.updated++;
        }
      }
    } catch (error) {
      console.error(`[Pipeline] Error processing film "${normalizedTitle}":`, error);
      result.failed += filmScreenings.length;
    }
  }

  // Update cinema's lastScrapedAt
  await db
    .update(cinemas)
    .set({ lastScrapedAt: result.scrapedAt, updatedAt: result.scrapedAt })
    .where(eq(cinemas.id, cinemaId));

  console.log(
    `[Pipeline] Complete: ${result.added} added, ${result.updated} updated, ${result.failed} failed`
  );

  // Log cache performance stats
  logCacheStats();

  // Run agent-based analysis if enabled
  if (AGENTS_ENABLED && result.added > 0) {
    try {
      await runPostScrapeAgents(cinemaId, screeningsToProcess, result);
    } catch (agentError) {
      console.warn(`[Pipeline] Agent analysis failed (non-blocking):`, agentError);
    }
  }

  return result;
}

/**
 * Run post-scrape agent analysis
 * This is optional and won't block the scrape if it fails
 */
async function runPostScrapeAgents(
  cinemaId: string,
  screenings: RawScreening[],
  _result: PipelineResult
): Promise<void> {
  void _result; // Reserved for future agent analysis
  // Dynamically import agents to avoid loading SDK if not needed
  const { analyzeScraperHealth } = await import("@/agents/scraper-health");
  const { verifyBookingLinks } = await import("@/agents/link-validator");

  console.log(`[Pipeline] Running agent analysis...`);

  // Sample screenings for agent analysis
  const samples = screenings.slice(0, 5).map((s) => ({
    title: s.filmTitle,
    datetime: s.datetime,
    bookingUrl: s.bookingUrl,
  }));

  // Run scraper health check
  const healthResult = await analyzeScraperHealth(
    cinemaId,
    screenings.length,
    samples
  );

  if (healthResult.success && healthResult.data) {
    const report = healthResult.data;
    if (report.anomalyDetected) {
      console.warn(`[Agent] Anomaly detected: ${report.warnings.join(", ")}`);
      // Could store this in data_issues table for review
    }
  }

  // Verify a sample of booking links (non-blocking)
  // Get screening IDs from the database for recently added screenings
  const recentScreenings = await db
    .select({ id: screeningsTable.id })
    .from(screeningsTable)
    .where(eq(screeningsTable.cinemaId, cinemaId))
    .orderBy(screeningsTable.scrapedAt)
    .limit(10);

  if (recentScreenings.length > 0) {
    const linkResult = await verifyBookingLinks(
      recentScreenings.map((s) => s.id),
      { dryRun: false, batchSize: 10 }
    );

    if (linkResult.success && linkResult.data) {
      const broken = linkResult.data.filter((r) => r.status === "broken");
      if (broken.length > 0) {
        console.warn(`[Agent] Found ${broken.length} broken links`);
      }
    }
  }

  console.log(`[Pipeline] Agent analysis complete`);
}

/**
 * Get existing film or create new one with TMDB enrichment
 * Uses multi-source poster fallback when TMDB poster unavailable
 * Uses AI-powered title extraction for event-style titles
 */
async function getOrCreateFilm(
  title: string,
  scraperYear?: number,
  scraperDirector?: string,
  scraperPosterUrl?: string
): Promise<string | null> {
  // Use AI to extract the actual film title from event-style names
  // e.g., "Saturday Morning Picture Club: The Muppets Christmas Carol" → "The Muppets Christmas Carol"
  const extraction = await extractFilmTitleCached(title);

  // If AI extraction failed or has low confidence, apply regex-based cleaning as fallback
  let cleanedTitle = extraction.filmTitle;
  if (extraction.confidence === "low" && !extraction.canonicalTitle) {
    cleanedTitle = cleanFilmTitle(title);
  }

  // Extract year from title as a hint for TMDB matching if scraper didn't provide one
  if (!scraperYear) {
    const yearMatch = title.match(/\((\d{4})\)\s*$/);
    if (yearMatch) {
      scraperYear = parseInt(yearMatch[1], 10);
    }
  }

  // Use canonical title for matching (without version suffixes like "Final Cut")
  // This ensures "Apocalypse Now" and "Apocalypse Now : Final Cut" match to the same film
  const matchingTitle = extraction.canonicalTitle || cleanedTitle;

  if (cleanedTitle !== title) {
    const versionNote = extraction.version ? ` [version: ${extraction.version}]` : "";
    console.log(`[Pipeline] Cleaned: "${title}" → "${cleanedTitle}"${versionNote} (${extraction.confidence})`);
  }

  const normalized = normalizeTitle(matchingTitle);

  // Try to find existing film using the pre-loaded cache (O(1) lookup)
  const existing = lookupFilmInCache(normalized);

  if (existing) {
    // If existing film lacks a poster, try to find one
    if (!existing.posterUrl) {
      await tryUpdatePoster(existing.id, title, existing.year, existing.imdbId, existing.tmdbId, scraperPosterUrl);
    }
    return existing.id;
  }

  // If no exact match, try trigram similarity search
  const similarityMatch = await findFilmBySimilarity(matchingTitle, scraperYear);
  if (similarityMatch) {
    return similarityMatch;
  }

  // Try to match with TMDB
  try {
    const tmdbFilmId = await matchAndCreateFromTMDB(
      matchingTitle,
      scraperYear,
      scraperDirector,
      scraperPosterUrl
    );
    if (tmdbFilmId) {
      return tmdbFilmId;
    }
  } catch (error) {
    console.warn(`[Pipeline] TMDB lookup failed for "${title}":`, error);
  }

  // Fallback: Create film without TMDB data
  return createFilmWithoutTMDB(matchingTitle, scraperYear, scraperDirector, scraperPosterUrl);
}

/**
 * Insert or update a screening
 * If scraper didn't provide event data and title looks like it needs classification,
 * use AI to extract event type, format, and accessibility info
 */
async function insertScreening(
  filmId: string,
  cinemaId: string,
  screening: RawScreening
): Promise<boolean> {
  // Classify screening metadata (event type, format, accessibility)
  const metadata = await classifyScreening(screening);

  // Check for duplicate screenings (exact match + normalized title dedup)
  const { duplicate, shouldSkip } = await checkForDuplicate(
    filmId,
    cinemaId,
    screening.datetime,
    normalizeTitle
  );

  if (shouldSkip) {
    return false;
  }

  if (duplicate) {
    // Update existing
    const now = new Date();
    await db
      .update(screeningsTable)
      .set({
        format: metadata.format,
        screen: screening.screen,
        isSpecialEvent: metadata.isSpecialEvent,
        eventType: metadata.eventType,
        eventDescription: metadata.eventDescription,
        is3D: metadata.is3D,
        hasSubtitles: metadata.hasSubtitles,
        subtitleLanguage: metadata.subtitleLanguage,
        hasAudioDescription: metadata.hasAudioDescription,
        isRelaxedScreening: metadata.isRelaxedScreening,
        season: metadata.season,
        bookingUrl: screening.bookingUrl,
        // Update availability if provided by scraper
        ...(screening.availabilityStatus && {
          availabilityStatus: screening.availabilityStatus,
          availabilityCheckedAt: now,
        }),
        scrapedAt: now,
        updatedAt: now,
      })
      .where(eq(screeningsTable.id, duplicate.id));

    return false; // Updated, not added
  }

  // Insert new screening with conflict handling for race conditions
  const now = new Date();
  await db.insert(screeningsTable).values({
    id: uuidv4(),
    filmId,
    cinemaId,
    datetime: screening.datetime,
    format: metadata.format,
    screen: screening.screen,
    isSpecialEvent: metadata.isSpecialEvent,
    eventType: metadata.eventType,
    eventDescription: metadata.eventDescription,
    is3D: metadata.is3D,
    hasSubtitles: metadata.hasSubtitles,
    subtitleLanguage: metadata.subtitleLanguage,
    hasAudioDescription: metadata.hasAudioDescription,
    isRelaxedScreening: metadata.isRelaxedScreening,
    season: metadata.season,
    bookingUrl: screening.bookingUrl,
    sourceId: screening.sourceId,
    scrapedAt: now,
    // Set festival flag
    isFestivalScreening: !!screening.festivalSlug,
    // Availability status from scraper
    availabilityStatus: screening.availabilityStatus ?? null,
    availabilityCheckedAt: screening.availabilityStatus ? now : null,
  }).onConflictDoUpdate({
    target: [screeningsTable.filmId, screeningsTable.cinemaId, screeningsTable.datetime],
    set: {
      scrapedAt: now,
      bookingUrl: screening.bookingUrl,
      updatedAt: now,
    },
  });

  // Handle festival linking
  if (screening.festivalSlug) {
    await linkScreeningToFestival(filmId, cinemaId, screening);
  }

  return true; // Added
}

/**
 * Link a screening to its festival if applicable.
 */
async function linkScreeningToFestival(
  filmId: string,
  cinemaId: string,
  screening: RawScreening
): Promise<void> {
  const [festival] = await db
    .select({ id: festivals.id })
    .from(festivals)
    .where(eq(festivals.slug, screening.festivalSlug!))
    .limit(1);

  if (festival) {
    // Get the newly created/updated screening ID
    const [savedScreening] = await db
      .select({ id: screeningsTable.id })
      .from(screeningsTable)
      .where(
        and(
          eq(screeningsTable.filmId, filmId),
          eq(screeningsTable.cinemaId, cinemaId),
          eq(screeningsTable.datetime, screening.datetime)
        )
      )
      .limit(1);

    if (savedScreening) {
      // Create festival association
      await db
        .insert(festivalScreenings)
        .values({
          festivalId: festival.id,
          screeningId: savedScreening.id,
          festivalSection: screening.festivalSection,
          isPremiere: screening.eventType === "premiere",
          premiereType: null, // Scrapers don't reliably provide this yet
        })
        .onConflictDoNothing();

      console.log(`[Pipeline] Linked screening to festival: ${screening.festivalSlug}`);
    }
  } else {
    console.warn(`[Pipeline] Festival not found: ${screening.festivalSlug}`);
  }
}

// ============================================================================
// Helper exports for run scripts
// ============================================================================

interface CinemaInput {
  id: string;
  name: string;
  shortName: string;
  chain?: string;
  website: string;
  // Address is flexible - scrapers provide partial data, we cast as needed
  address?: Record<string, string>;
  features?: string[];
}

/**
 * Ensure a cinema exists in the database, create if not
 */
export async function ensureCinemaExists(cinema: CinemaInput): Promise<void> {
  const existing = await db
    .select()
    .from(cinemas)
    .where(eq(cinemas.id, cinema.id))
    .limit(1);

  if (existing.length > 0) {
    // Update existing cinema
    await db
      .update(cinemas)
      .set({
        name: cinema.name,
        shortName: cinema.shortName,
        chain: cinema.chain,
        website: cinema.website,
        // Cast address to schema type - scrapers provide partial data
        address: cinema.address as typeof cinemas.$inferInsert["address"],
        features: cinema.features || [],
        updatedAt: new Date(),
      })
      .where(eq(cinemas.id, cinema.id));
    return;
  }

  // Create new cinema
  await db.insert(cinemas).values({
    id: cinema.id,
    name: cinema.name,
    shortName: cinema.shortName,
    chain: cinema.chain,
    website: cinema.website,
    // Cast address to schema type - scrapers provide partial data
    address: cinema.address as typeof cinemas.$inferInsert["address"],
    features: cinema.features || [],
    isActive: true,
  });

  console.log(`[Pipeline] Created cinema: ${cinema.name}`);
}

/**
 * Simplified alias for processScreenings
 */
export async function saveScreenings(
  cinemaId: string,
  rawScreenings: RawScreening[]
): Promise<PipelineResult> {
  return processScreenings(cinemaId, rawScreenings);
}
