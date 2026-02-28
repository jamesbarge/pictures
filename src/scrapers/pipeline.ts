/**
 * Scraper Pipeline
 * Normalizes, enriches, and persists scraped screening data
 */

import { db } from "@/db";
import { films, screenings as screeningsTable, cinemas, festivals, festivalScreenings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { matchFilmToTMDB, getTMDBClient, isRepertoryFilm, getDecade } from "@/lib/tmdb";
import { getPosterService } from "@/lib/posters";
import { extractFilmTitleCached, batchExtractTitles } from "@/lib/title-extraction";
import {
  findMatchingFilm,
  isSimilarityConfigured,
  isGeminiConfigured,
} from "@/lib/film-similarity";
import {
  classifyEventCached,
  likelyNeedsClassification,
} from "@/lib/event-classifier";
import type { RawScreening } from "./types";
import type { EventType, ScreeningFormat } from "@/types/screening";
import { v4 as uuidv4 } from "uuid";
import { validateScreenings, printValidationSummary } from "./utils/screening-validator";
import { generateScrapeDiff, printDiffReport, shouldBlockScrape } from "./utils/scrape-diff";
import { linkFilmToMatchingSeasons } from "./seasons/season-linker";

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

// Film cache for efficient lookups during pipeline run
// Maps normalizedTitle -> film record
type FilmRecord = typeof films.$inferSelect;
let filmCache: Map<string, FilmRecord> | null = null;
// Secondary index: Maps tmdbId -> film record for dedup by TMDB ID
let tmdbIdIndex: Map<number, FilmRecord> | null = null;

// Track cache stats for logging
let cacheStats = { hits: 0, misses: 0, dbQueries: 0 };

/**
 * Initialize film cache for O(1) lookups during pipeline run
 * Loads all films once - with ~750 films this is fast and simple
 */
async function initFilmCache(): Promise<Map<string, FilmRecord>> {
  const cache = new Map<string, FilmRecord>();
  const tmdbIndex = new Map<number, FilmRecord>();
  cacheStats = { hits: 0, misses: 0, dbQueries: 0 };

  cacheStats.dbQueries++;
  const allFilms = await db.select().from(films);

  for (const film of allFilms) {
    const normalized = normalizeTitle(film.title);
    // If duplicate normalized titles exist, keep the one with more data (has TMDB ID)
    const existing = cache.get(normalized);
    if (!existing || (film.tmdbId && !existing.tmdbId)) {
      cache.set(normalized, film);
    }
    // Build TMDB ID index — two films with same TMDB ID are always the same film
    if (film.tmdbId) {
      tmdbIndex.set(film.tmdbId, film);
    }
  }

  tmdbIdIndex = tmdbIndex;
  console.log(`[Pipeline] Film cache initialized with ${cache.size} unique films, ${tmdbIndex.size} TMDB IDs (${allFilms.length} total)`);
  return cache;
}

/**
 * Lookup a film in cache (O(1) access)
 * Returns null on cache miss - the film is likely new and will be created
 */
function lookupFilmInCache(normalizedTitle: string): FilmRecord | null {
  const cached = filmCache?.get(normalizedTitle);
  if (cached) {
    cacheStats.hits++;
    return cached;
  }
  cacheStats.misses++;
  return null;
}

/**
 * Log cache performance stats
 */
function logCacheStats(): void {
  const total = cacheStats.hits + cacheStats.misses;
  const hitRate = total > 0 ? ((cacheStats.hits / total) * 100).toFixed(1) : "0";
  console.log(`[Pipeline] Cache stats: ${cacheStats.hits} hits, ${cacheStats.misses} misses (${hitRate}% hit rate), ${cacheStats.dbQueries} DB queries`);
}

/**
 * Add a new film to the cache
 */
function addToFilmCache(film: FilmRecord) {
  if (filmCache) {
    const normalized = normalizeTitle(film.title);
    filmCache.set(normalized, film);
  }
  if (tmdbIdIndex && film.tmdbId) {
    tmdbIdIndex.set(film.tmdbId, film);
  }
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
  filmCache = await initFilmCache();

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
  // This fixes the previous bug where .limit(100) missed most films
  const existing = lookupFilmInCache(normalized);

  if (existing) {
    // If existing film lacks a poster, try to find one
    if (!existing.posterUrl) {
      await tryUpdatePoster(existing.id, title, existing.year, existing.imdbId, existing.tmdbId, scraperPosterUrl);
    }
    return existing.id;
  }

  // If no exact match, try trigram similarity search
  // This catches fuzzy matches like "Blade Runner 2049" vs "BLADE RUNNER 2049 (4K)"
  if (isSimilarityConfigured()) {
    try {
      // Use AI confirmation for medium-confidence matches if API key is available
      // Use canonical/matching title for similarity search
      const match = await findMatchingFilm(
        matchingTitle,
        scraperYear,
        isGeminiConfigured() // Enable AI confirmation if available
      );

      if (match) {
        console.log(
          `[Pipeline] Similarity match (${match.confidence}): "${matchingTitle}" → existing film`
        );
        return match.filmId;
      }
    } catch (e) {
      // Similarity search failed, continue with normal flow
      console.warn(`[Pipeline] Similarity search failed for "${matchingTitle}":`, e);
    }
  }

  // Try to match with TMDB using the canonical/matching title
  // This ensures "Apocalypse Now : Final Cut" searches for "Apocalypse Now"
  try {
    const match = await matchFilmToTMDB(matchingTitle, {
      year: scraperYear,
      director: scraperDirector,
    });

    if (match) {
      // Check if we already have this TMDB ID — cache first, then DB fallback
      const cachedByTmdb = tmdbIdIndex?.get(match.tmdbId);
      if (cachedByTmdb) {
        cacheStats.hits++;
        return cachedByTmdb.id;
      }
      const byTmdbId = await db
        .select()
        .from(films)
        .where(eq(films.tmdbId, match.tmdbId))
        .limit(1);
      cacheStats.dbQueries++;

      if (byTmdbId.length > 0) {
        return byTmdbId[0].id;
      }

      // Get full details from TMDB
      const client = getTMDBClient();
      const details = await client.getFullFilmData(match.tmdbId);

      // Determine poster URL - try TMDB first, then fallback sources
      let posterUrl = details.details.poster_path
        ? `https://image.tmdb.org/t/p/w500${details.details.poster_path}`
        : null;

      // If no TMDB poster, use poster service to find alternatives
      if (!posterUrl) {
        const posterService = getPosterService();
        const posterResult = await posterService.findPoster({
          title: details.details.title,
          year: match.year,
          imdbId: details.details.imdb_id || undefined,
          tmdbId: match.tmdbId,
          scraperPosterUrl,
        });

        // Don't use placeholder URLs in the database - leave null for later enrichment
        if (posterResult.source !== "placeholder") {
          posterUrl = posterResult.url;
          console.log(`[Pipeline] Found poster from ${posterResult.source.toUpperCase()}`);
        }
      }

      const filmId = uuidv4();

      await db.insert(films).values({
        id: filmId,
        tmdbId: match.tmdbId,
        imdbId: details.details.imdb_id,
        title: details.details.title,
        originalTitle: details.details.original_title,
        year: match.year,
        runtime: details.details.runtime,
        directors: details.directors,
        cast: details.cast,
        genres: details.details.genres.map((g) => g.name.toLowerCase()),
        countries: details.details.production_countries.map((c) => c.iso_3166_1),
        languages: details.details.spoken_languages.map((l) => l.iso_639_1),
        certification: details.certification,
        synopsis: details.details.overview,
        tagline: details.details.tagline,
        posterUrl,
        backdropUrl: details.details.backdrop_path
          ? `https://image.tmdb.org/t/p/w1280${details.details.backdrop_path}`
          : null,
        isRepertory: isRepertoryFilm(details.details.release_date),
        decade: match.year ? getDecade(match.year) : null,
        tmdbRating: details.details.vote_average,
      });

      // Add to cache so subsequent lookups in this run find it
      addToFilmCache({
        id: filmId,
        tmdbId: match.tmdbId,
        imdbId: details.details.imdb_id,
        title: details.details.title,
        originalTitle: details.details.original_title,
        year: match.year,
        runtime: details.details.runtime,
        directors: details.directors,
        cast: details.cast as FilmRecord["cast"],
        genres: details.details.genres.map((g) => g.name.toLowerCase()),
        countries: details.details.production_countries.map((c) => c.iso_3166_1),
        languages: details.details.spoken_languages.map((l) => l.iso_639_1),
        certification: details.certification,
        synopsis: details.details.overview,
        tagline: details.details.tagline,
        posterUrl,
        backdropUrl: details.details.backdrop_path
          ? `https://image.tmdb.org/t/p/w1280${details.details.backdrop_path}`
          : null,
        trailerUrl: null,
        isRepertory: isRepertoryFilm(details.details.release_date),
        releaseStatus: null,
        decade: match.year ? getDecade(match.year) : null,
        contentType: "film",
        sourceImageUrl: null,
        tmdbRating: details.details.vote_average,
        letterboxdUrl: null,
        letterboxdRating: null,
        matchConfidence: match.confidence ?? null,
        matchStrategy: "auto-with-year",
        matchedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      console.log(`[Pipeline] Created film: ${details.details.title} (${match.year})`);
      return filmId;
    }
  } catch (error) {
    console.warn(`[Pipeline] TMDB lookup failed for "${title}":`, error);
  }

  // Fallback: Create film without TMDB data
  // Try to find a poster from other sources
  let posterUrl: string | null = null;

  if (scraperPosterUrl) {
    posterUrl = scraperPosterUrl;
    console.log(`[Pipeline] Using scraper-provided poster`);
  } else {
    // Try OMDB/Fanart without TMDB match
    // Use canonical/matching title for better API matching
    try {
      const posterService = getPosterService();
      const posterResult = await posterService.findPoster({
        title: matchingTitle,
        year: scraperYear,
        scraperPosterUrl,
      });

      if (posterResult.source !== "placeholder") {
        posterUrl = posterResult.url;
        console.log(`[Pipeline] Found poster from ${posterResult.source.toUpperCase()}`);
      }
    } catch {
      // Poster search failed, continue without
    }
  }

  const filmId = uuidv4();

  // Store the canonical/matching title as the film title
  // Version suffixes like "Final Cut" are screening attributes, not film attributes
  await db.insert(films).values({
    id: filmId,
    title: matchingTitle,
    year: scraperYear,
    directors: scraperDirector ? [scraperDirector] : [],
    posterUrl,
    isRepertory: false,
    cast: [],
    genres: [],
    countries: [],
    languages: [],
  });

  // Add to cache so subsequent lookups in this run find it
  addToFilmCache({
    id: filmId,
    title: matchingTitle,
    originalTitle: null,
    year: scraperYear ?? null,
    runtime: null,
    directors: scraperDirector ? [scraperDirector] : [],
    cast: [],
    genres: [],
    countries: [],
    languages: [],
    certification: null,
    synopsis: null,
    tagline: null,
    posterUrl,
    backdropUrl: null,
    trailerUrl: null,
    isRepertory: false,
    releaseStatus: null,
    decade: null,
    contentType: "film",
    sourceImageUrl: null,
    tmdbId: null,
    imdbId: null,
    tmdbRating: null,
    letterboxdUrl: null,
    letterboxdRating: null,
    matchConfidence: null,
    matchStrategy: null,
    matchedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log(`[Pipeline] Created film without TMDB: ${matchingTitle}${posterUrl ? " (with poster)" : ""}`);
  return filmId;
}

/**
 * Try to update a film's poster using multiple sources
 */
async function tryUpdatePoster(
  filmId: string,
  title: string,
  year: number | null,
  imdbId: string | null,
  tmdbId: number | null,
  scraperPosterUrl?: string
): Promise<void> {
  try {
    const posterService = getPosterService();
    const result = await posterService.findPoster({
      title,
      year: year ?? undefined,
      imdbId: imdbId ?? undefined,
      tmdbId: tmdbId ?? undefined,
      scraperPosterUrl,
    });

    if (result.source !== "placeholder") {
      await db
        .update(films)
        .set({ posterUrl: result.url, updatedAt: new Date() })
        .where(eq(films.id, filmId));

      console.log(`[Pipeline] Updated poster for "${title}" from ${result.source.toUpperCase()}`);
    }
  } catch (error) {
    console.warn(`[Pipeline] Failed to find poster for "${title}":`, error);
  }
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
  // Determine screening metadata - use scraper-provided data or classify
  let eventType = screening.eventType as EventType | undefined;
  let eventDescription = screening.eventDescription;
  let format = screening.format as ScreeningFormat | undefined;
  let isSpecialEvent = false;
  let is3D = false;
  let hasSubtitles = false;
  let subtitleLanguage: string | null = null;
  let hasAudioDescription = false;
  let isRelaxedScreening = false;
  let season: string | null = null;

  // If scraper didn't provide event data, try to classify the title
  const needsClassification =
    !screening.eventType &&
    !screening.format &&
    likelyNeedsClassification(screening.filmTitle);

  if (needsClassification) {
    try {
      const classification = await classifyEventCached(screening.filmTitle);

      if (classification.eventTypes.length > 0 || classification.format) {
        console.log(
          `[Pipeline] Classified: "${screening.filmTitle}" → ${classification.eventTypes.join(", ") || classification.format || "accessibility"}`
        );
      }

      // Apply classification results
      isSpecialEvent = classification.isSpecialEvent;
      eventType = classification.eventTypes[0] || null;
      eventDescription =
        classification.eventTypes.length > 1
          ? `Also: ${classification.eventTypes.slice(1).join(", ")}`
          : classification.eventDescription ?? undefined;
      format = classification.format || format;
      is3D = classification.is3D;
      hasSubtitles = classification.hasSubtitles;
      subtitleLanguage = classification.subtitleLanguage;
      hasAudioDescription = classification.hasAudioDescription;
      isRelaxedScreening = classification.isRelaxedScreening;
      season = classification.season;
    } catch (e) {
      console.warn(`[Pipeline] Event classification failed:`, e);
      // Continue with scraper-provided data
    }
  }

  // Check for existing screening using exact composite key
  // (Direct query is more efficient and doesn't have the .limit(100) bug)
  const [duplicate] = await db
    .select()
    .from(screeningsTable)
    .where(
      and(
        eq(screeningsTable.filmId, filmId),
        eq(screeningsTable.cinemaId, cinemaId),
        eq(screeningsTable.datetime, screening.datetime)
      )
    )
    .limit(1);

  // Secondary dedup guard: check for same (cinemaId, datetime) with a different filmId
  // This catches cases where duplicate film records create duplicate screenings
  if (!duplicate) {
    const [sameTimeDifferentFilm] = await db
      .select({ filmId: screeningsTable.filmId })
      .from(screeningsTable)
      .where(
        and(
          eq(screeningsTable.cinemaId, cinemaId),
          eq(screeningsTable.datetime, screening.datetime)
        )
      )
      .limit(1);

    if (sameTimeDifferentFilm && sameTimeDifferentFilm.filmId !== filmId) {
      // Look up both film titles and compare normalized versions
      const [existingFilm] = await db
        .select({ title: films.title })
        .from(films)
        .where(eq(films.id, sameTimeDifferentFilm.filmId))
        .limit(1);
      const [newFilm] = await db
        .select({ title: films.title })
        .from(films)
        .where(eq(films.id, filmId))
        .limit(1);

      if (existingFilm && newFilm) {
        const existingNorm = normalizeTitle(existingFilm.title);
        const newNorm = normalizeTitle(newFilm.title);
        if (existingNorm === newNorm) {
          console.warn(
            `[Pipeline] Skipping duplicate screening: "${newFilm.title}" at ${cinemaId} ${screening.datetime.toISOString()} ` +
            `(already exists under different filmId with title "${existingFilm.title}")`
          );
          return false; // Skip this duplicate
        }
      }
    }
  }

  if (duplicate) {
    // Update existing
    const now = new Date();
    await db
      .update(screeningsTable)
      .set({
        format,
        screen: screening.screen,
        isSpecialEvent,
        eventType,
        eventDescription,
        is3D,
        hasSubtitles,
        subtitleLanguage,
        hasAudioDescription,
        isRelaxedScreening,
        season,
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
    format,
    screen: screening.screen,
    isSpecialEvent,
    eventType,
    eventDescription,
    is3D,
    hasSubtitles,
    subtitleLanguage,
    hasAudioDescription,
    isRelaxedScreening,
    season,
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
    const [festival] = await db
      .select({ id: festivals.id })
      .from(festivals)
      .where(eq(festivals.slug, screening.festivalSlug))
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

  return true; // Added
}

/**
 * Known event prefixes that should be stripped to find the actual film title
 * These are screening event names, not part of the film title itself
 */
const EVENT_PREFIXES = [
  // Kids/Family events
  /^saturday\s+morning\s+picture\s+club[:\s]+/i,
  /^kids['\s]*club[:\s]+/i,
  /^family\s+film\s+club[:\s]+/i,
  /^family\s+film[:\s]+/i,
  /^toddler\s+time[:\s]+/i,
  /^big\s+scream[:\s]+/i,
  /^baby\s+club[:\s]+/i,

  // Special screenings
  /^uk\s+premiere\s*[:\|I]\s*/i,
  /^world\s+premiere\s*[:\|I]\s*/i,
  /^preview[:\s]+/i,
  /^sneak\s+preview[:\s]+/i,
  /^advance\s+screening[:\s]+/i,
  /^special\s+screening[:\s]+/i,
  /^member['\s]*s?\s+screening[:\s]+/i,

  // Format-based event names
  /^35mm[:\s]+/i,
  /^70mm[:\s]+/i,
  /^70mm\s+imax[:\s]+/i,
  /^imax[:\s]+/i,
  /^4k\s+restoration[:\s]+/i,
  /^restoration[:\s]+/i,
  /^director['\s]*s?\s+cut[:\s]+/i,

  // Season/Series prefixes
  /^cult\s+classic[s]?[:\s]+/i,
  /^classic[s]?[:\s]+/i,
  /^throwback\s+thursday[:\s]+/i,
  /^flashback[:\s]+/i,
  /^film\s+club[:\s]+/i,
  /^cinema\s+club[:\s]+/i,
  /^late\s+night[:\s]+/i,
  /^midnight\s+madness[:\s]+/i,
  /^double\s+bill[:\s]+/i,
  /^double\s+feature[:\s]+/i,
  /^triple\s+bill[:\s]+/i,
  /^marathon[:\s]+/i,
  /^retrospective[:\s]+/i,

  // Q&A and special events
  /^q\s*&\s*a[:\s]+/i,
  /^live\s+q\s*&\s*a[:\s]+/i,
  /^with\s+q\s*&\s*a[:\s]+/i,
  /^intro\s+by[^:]*[:\s]+/i,
  /^introduced\s+by[^:]*[:\s]+/i,

  // Sing-along and interactive
  /^sing[\s-]*a[\s-]*long[\s-]*a?\s+/i,
  /^quote[\s-]*a[\s-]*long[:\s]+/i,
  /^singalong[:\s]+/i,

  // Holiday/Themed events
  /^christmas\s+classic[s]?[:\s]+/i,
  /^holiday\s+film[:\s]+/i,
  /^festive\s+film[:\s]+/i,
  /^galentine['\u2019]?s?\s+day[:\s]+/i,
  /^valentine['\u2019]?s?\s+day[:\s]+/i,

  // Venue-specific curated series
  /^dochouse[:\s]+/i,
  /^pink\s+palace[:\s]+/i,
  /^classic\s+matinee[:\s]+/i,
  /^category\s+h\b[^:]*[:\s]+/i,
  /^seniors['']?\s*paid\s+matinee[:\s]+/i,
  /^dog\s+friendly\s+screening[:\s]+/i,
  /^toddler\s+club[:\s]+/i,
  /^queer\s+horror\s+nights?[:\s]+/i,
  /^varda\s+film\s+club[:\s]+/i,
  /^awards\s+lunch[:\s]+/i,

  // Branded series
  /^bar\s+trash\s+\d+[:\s]+/i,
  /^pitchblack\s+playback[:\s]+/i,
  /^phoenix\s+classics?\s*[-:]\s*/i,
  /^the\s+liberated\s+film\s+club[:\s]+/i,

  // Cultural / themed
  /^s[üu]rreal\s+sinema[:\s]+/i,
  /^never\s+watching\s+movies[:\s]+/i,
  /^drink\s+&?\s*dine[:\s]+/i,
  /^valentine['']?s?\s+throwback[:\s]+/i,

  // Broadcast/RBO/ROH encore screenings
  /^rbo\s+cinema\s+season\b[^:]*[:\s]+/i,
  /^rbo\s+encore[:\s]+/i,
  /^roh\s+encore[:\s]+/i,
  /^encore[:\s]+/i,
  /^rbo[:\s]+/i,
  /^nt\s+live[:\s]+/i,
  /^met\s+opera[:\s]+/i,
];

/**
 * Clean a film title by removing common cruft from scrapers
 */
export function cleanFilmTitle(title: string): string {
  let cleaned = title
    // Collapse whitespace (including newlines)
    .replace(/\s+/g, " ")
    .trim();

  // Strip known event prefixes to extract actual film title
  for (const prefix of EVENT_PREFIXES) {
    if (prefix.test(cleaned)) {
      cleaned = cleaned.replace(prefix, "").trim();
      // Only strip one prefix (don't want to accidentally remove too much)
      break;
    }
  }

  // Handle remaining colon-separated titles where film is after colon
  // but only if the part before colon looks like an event name (not a film title)
  const colonMatch = cleaned.match(/^([^:]+):\s*(.+)$/);
  if (colonMatch) {
    const beforeColon = colonMatch[1].trim();
    const afterColon = colonMatch[2].trim();

    // Check if before-colon looks like a film series/franchise (keep these intact)
    const isFilmSeries = /^(star\s+wars|indiana\s+jones|harry\s+potter|lord\s+of\s+the\s+rings|mission\s+impossible|pirates\s+of\s+the\s+caribbean|fast\s+(&|and)\s+furious|jurassic\s+(park|world)|the\s+matrix|batman|spider[\s-]?man|x[\s-]?men|avengers|guardians\s+of\s+the\s+galaxy|toy\s+story|shrek|finding\s+(nemo|dory)|the\s+dark\s+knight|alien|terminator|mad\s+max|back\s+to\s+the\s+future|die\s+hard|lethal\s+weapon|home\s+alone|rocky|rambo|the\s+godfather|twin\s+peaks|blade\s+runner|john\s+wick|planet\s+of\s+the\s+apes)/i.test(beforeColon);

    // Check if before-colon is a known event-type word pattern
    const isEventPattern = /^(season|series|part|episode|chapter|vol(ume)?|act|double\s+feature|marathon|retrospective|tribute|celebration|anniversary|special|presents?|screening|showing|feature)/i.test(beforeColon);

    // Check if after-colon looks like a subtitle (short, starts with article/adjective)
    const isSubtitle = /^(the|a|an|new|last|final|return|rise|fall|revenge|attack|empire|phantom|force|rogue|solo)\s/i.test(afterColon);

    // If before colon is a film series or after-colon is a subtitle, keep the full title
    if (isFilmSeries || isSubtitle) {
      // Keep as-is (it's a legitimate film title with subtitle)
    } else if (!isEventPattern) {
      // For other cases, check if it looks like an event name vs film title
      const hasYear = /\b(19|20)\d{2}\b/.test(beforeColon);
      const isVeryShort = beforeColon.split(/\s+/).length <= 3; // 3 words or less
      const afterColonHasYear = /\b(19|20)\d{2}\b/.test(afterColon);

      // Use after-colon if: before is very short event-like name without year
      if (isVeryShort && !hasYear && afterColon.length > 3) {
        cleaned = afterColon;
      } else if (afterColonHasYear) {
        // After-colon has a year, so it's probably the real title
        cleaned = afterColon;
      }
    }
  }

  // Strip trailing year like "(1997)" or "(2026)" — year is used as TMDB hint, not title text
  cleaned = cleaned.replace(/\s*\(\d{4}\)\s*$/, "").trim();

  return cleaned
    // Remove BBFC ratings: (U), (PG), (12), (12A), (15), (18), with optional asterisk
    .replace(/\s*\((U|PG|12A?|15|18)\*?\)\s*$/i, "")
    // Remove bracketed notes like [is a Christmas Movie]
    .replace(/\s*\[.*?\]\s*$/g, "")
    // Remove trailing "- 35mm", "- 70mm" format notes (already captured as format)
    .replace(/\s*-\s*(35mm|70mm|4k|imax)\s*$/i, "")
    // Remove trailing "+ Q&A" (including HTML-encoded &amp;) / "+ pre-recorded intro by ..." / "+ discussion with ..." / "+ Live Music"
    .replace(/\s*\+\s*(q\s*(&amp;|&)\s*a|discussion|intro|live\s+music)\b.*$/i, "")
    // Remove trailing format parentheticals like "(ON VHS)", "(ON 35MM)"
    .replace(/\s*\(on\s+(vhs|35mm|70mm|blu-?ray|dvd|4k)\)\s*$/i, "")
    // Remove "Presented by ..." suffixes
    .replace(/\s+presented\s+by\s+.*$/i, "")
    // Remove "• Nth Anniversary" suffixes
    .replace(/\s*[•·]\s*\d+\w*\s+anniversary\b.*$/i, "")
    // Remove "(Extended Edition)" / "(Extended Cut)" parentheticals
    .replace(/\s*\(extended\s+(edition|cut)\)\s*$/i, "")
    .trim();
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
