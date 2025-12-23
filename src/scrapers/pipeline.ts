/**
 * Scraper Pipeline
 * Normalizes, enriches, and persists scraped screening data
 */

import { db } from "@/db";
import { films, screenings, cinemas } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { matchFilmToTMDB, getTMDBClient, isRepertoryFilm, getDecade } from "@/lib/tmdb";
import { getPosterService } from "@/lib/posters";
import { extractFilmTitleCached, batchExtractTitles } from "@/lib/title-extractor";
import {
  findMatchingFilm,
  isSimilarityConfigured,
  isClaudeConfigured,
} from "@/lib/film-similarity";
import {
  classifyEventCached,
  likelyNeedsClassification,
} from "@/lib/event-classifier";
import type { RawScreening } from "./types";
import { v4 as uuidv4 } from "uuid";

interface PipelineResult {
  cinemaId: string;
  added: number;
  updated: number;
  failed: number;
  scrapedAt: Date;
}

// Film cache for efficient lookups during pipeline run
// Maps normalizedTitle -> film record
type FilmRecord = typeof films.$inferSelect;
let filmCache: Map<string, FilmRecord> | null = null;

/**
 * Initialize or refresh the film cache
 * Loads ALL films from DB once per pipeline run for O(1) lookups
 */
async function initFilmCache(): Promise<Map<string, FilmRecord>> {
  const allFilms = await db.select().from(films);
  const cache = new Map<string, FilmRecord>();

  for (const film of allFilms) {
    const normalized = normalizeTitle(film.title);
    // If duplicate normalized titles exist, keep the one with more data (has TMDB ID)
    const existing = cache.get(normalized);
    if (!existing || (film.tmdbId && !existing.tmdbId)) {
      cache.set(normalized, film);
    }
  }

  console.log(`[Pipeline] Film cache initialized with ${cache.size} unique films (${allFilms.length} total)`);
  return cache;
}

/**
 * Add a new film to the cache
 */
function addToFilmCache(film: FilmRecord) {
  if (filmCache) {
    const normalized = normalizeTitle(film.title);
    filmCache.set(normalized, film);
  }
}

/**
 * Process raw screenings through the full pipeline
 */
export async function processScreenings(
  cinemaId: string,
  rawScreenings: RawScreening[]
): Promise<PipelineResult> {
  console.log(`[Pipeline] Processing ${rawScreenings.length} screenings for ${cinemaId}`);

  // Initialize film cache for this pipeline run (loads ALL films once)
  filmCache = await initFilmCache();

  const result: PipelineResult = {
    cinemaId,
    added: 0,
    updated: 0,
    failed: 0,
    scrapedAt: new Date(),
  };

  // Extract film titles using AI for event-style names
  // This ensures "Saturday Morning Picture Club: The Muppets Christmas Carol" and
  // "The Muppets Christmas Carol" get grouped together
  const uniqueRawTitles = [...new Set(rawScreenings.map((s) => s.filmTitle))];
  console.log(`[Pipeline] Extracting titles from ${uniqueRawTitles.length} unique raw titles`);
  const titleExtractions = await batchExtractTitles(uniqueRawTitles);

  // Group screenings by extracted film title
  const screeningsByFilm = new Map<string, RawScreening[]>();
  for (const screening of rawScreenings) {
    const extraction = titleExtractions.get(screening.filmTitle);
    // Use AI result if confident, otherwise fall back to regex cleaning
    let cleanTitle = extraction?.filmTitle ?? screening.filmTitle;
    if (extraction?.confidence === "low") {
      cleanTitle = cleanFilmTitle(screening.filmTitle);
    }
    const key = normalizeTitle(cleanTitle);
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

  return result;
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
  if (extraction.confidence === "low") {
    cleanedTitle = cleanFilmTitle(title);
  }

  if (cleanedTitle !== title) {
    console.log(`[Pipeline] Cleaned: "${title}" → "${cleanedTitle}" (${extraction.confidence})`);
  }

  const normalized = normalizeTitle(cleanedTitle);

  // Try to find existing film using the pre-loaded cache (O(1) lookup)
  // This fixes the previous bug where .limit(100) missed most films
  const existing = filmCache?.get(normalized);

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
      // Use Claude confirmation for medium-confidence matches if API key is available
      const match = await findMatchingFilm(
        cleanedTitle,
        scraperYear,
        isClaudeConfigured() // Enable Claude confirmation if available
      );

      if (match) {
        console.log(
          `[Pipeline] Similarity match (${match.confidence}): "${cleanedTitle}" → existing film`
        );
        return match.filmId;
      }
    } catch (e) {
      // Similarity search failed, continue with normal flow
      console.warn(`[Pipeline] Similarity search failed for "${cleanedTitle}":`, e);
    }
  }

  // Try to match with TMDB using the cleaned title
  try {
    const match = await matchFilmToTMDB(cleanedTitle, {
      year: scraperYear,
      director: scraperDirector,
    });

    if (match) {
      // Check if we already have this TMDB ID
      const byTmdbId = await db
        .select()
        .from(films)
        .where(eq(films.tmdbId, match.tmdbId))
        .limit(1);

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
        tmdbRating: details.details.vote_average,
        letterboxdUrl: null,
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
    try {
      const posterService = getPosterService();
      const posterResult = await posterService.findPoster({
        title: cleanedTitle,
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

  await db.insert(films).values({
    id: filmId,
    title: cleanedTitle, // Use cleaned title
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
    title: cleanedTitle,
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
    tmdbId: null,
    imdbId: null,
    tmdbRating: null,
    letterboxdUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log(`[Pipeline] Created film without TMDB: ${cleanedTitle}${posterUrl ? " (with poster)" : ""}`);
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
 * use Claude to extract event type, format, and accessibility info
 */
async function insertScreening(
  filmId: string,
  cinemaId: string,
  screening: RawScreening
): Promise<boolean> {
  // Determine screening metadata - use scraper-provided data or classify
  let eventType = screening.eventType as any;
  let eventDescription = screening.eventDescription;
  let format = screening.format as any;
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
    .from(screenings)
    .where(
      and(
        eq(screenings.filmId, filmId),
        eq(screenings.cinemaId, cinemaId),
        eq(screenings.datetime, screening.datetime)
      )
    )
    .limit(1);

  if (duplicate) {
    // Update existing
    await db
      .update(screenings)
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
        scrapedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(screenings.id, duplicate.id));

    return false; // Updated, not added
  }

  // Insert new screening
  await db.insert(screenings).values({
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
    scrapedAt: new Date(),
  });

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
  /^sing[\s-]*a[\s-]*long[:\s]+/i,
  /^quote[\s-]*a[\s-]*long[:\s]+/i,
  /^singalong[:\s]+/i,

  // Christmas/Holiday
  /^christmas\s+classic[s]?[:\s]+/i,
  /^holiday\s+film[:\s]+/i,
  /^festive\s+film[:\s]+/i,
];

/**
 * Clean a film title by removing common cruft from scrapers
 */
function cleanFilmTitle(title: string): string {
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
    const isFilmSeries = /^(star\s+wars|indiana\s+jones|harry\s+potter|lord\s+of\s+the\s+rings|mission\s+impossible|pirates\s+of\s+the\s+caribbean|fast\s+(&|and)\s+furious|jurassic\s+(park|world)|the\s+matrix|batman|spider[\s-]?man|x[\s-]?men|avengers|guardians\s+of\s+the\s+galaxy|toy\s+story|shrek|finding\s+(nemo|dory)|the\s+dark\s+knight|alien|terminator|mad\s+max|back\s+to\s+the\s+future|die\s+hard|lethal\s+weapon|home\s+alone|rocky|rambo|the\s+godfather)/i.test(beforeColon);

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

  return cleaned
    // Remove BBFC ratings: (U), (PG), (12), (12A), (15), (18), with optional asterisk
    .replace(/\s*\((U|PG|12A?|15|18)\*?\)\s*$/i, "")
    // Remove bracketed notes like [is a Christmas Movie]
    .replace(/\s*\[.*?\]\s*$/g, "")
    // Remove trailing "- 35mm", "- 70mm" format notes (already captured as format)
    .replace(/\s*-\s*(35mm|70mm|4k|imax)\s*$/i, "")
    // Remove trailing "+ Q&A" etc
    .replace(/\s*\+\s*(q\s*&\s*a|discussion|intro)\s*$/i, "")
    .trim();
}

/**
 * Normalize a film title for comparison
 * Assumes title is already cleaned via AI extraction
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^the\s+/i, "")
    .replace(/[^\w\s]/g, "")
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
        address: cinema.address as any,
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
    address: cinema.address as any,
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
