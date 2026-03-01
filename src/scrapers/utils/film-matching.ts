/**
 * Film Matching Utilities
 *
 * Handles TMDB search, similarity matching, poster resolution, and
 * film record creation. Extracted from the scraper pipeline to keep
 * getOrCreateFilm() focused on orchestration.
 */

import { db } from "@/db";
import { films } from "@/db/schema";
import { eq } from "drizzle-orm";
import { matchFilmToTMDB, getTMDBClient, isRepertoryFilm, getDecade } from "@/lib/tmdb";
import { getPosterService } from "@/lib/posters";
import {
  findMatchingFilm,
  isSimilarityConfigured,
  isGeminiConfigured,
} from "@/lib/film-similarity";
import { v4 as uuidv4 } from "uuid";

type FilmRecord = typeof films.$inferSelect;

// ============================================================================
// Film Cache
// ============================================================================

/** Film cache for efficient lookups during pipeline run (normalizedTitle -> film record) */
let filmCache: Map<string, FilmRecord> | null = null;
/** Secondary index: Maps tmdbId -> film record for dedup by TMDB ID */
let tmdbIdIndex: Map<number, FilmRecord> | null = null;
/** Track cache stats for logging */
let cacheStats = { hits: 0, misses: 0, dbQueries: 0 };
/** Stored normalizeTitle function reference (set during initFilmCache) */
let normalizeFn: ((title: string) => string) | null = null;

/**
 * Initialize film cache for O(1) lookups during pipeline run.
 * Loads all films once - with ~750 films this is fast and simple.
 */
export async function initFilmCache(
  normalizeTitle: (title: string) => string
): Promise<Map<string, FilmRecord>> {
  const cache = new Map<string, FilmRecord>();
  const tmdbIndex = new Map<number, FilmRecord>();
  cacheStats = { hits: 0, misses: 0, dbQueries: 0 };
  normalizeFn = normalizeTitle;

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
  filmCache = cache;
  console.log(`[Pipeline] Film cache initialized with ${cache.size} unique films, ${tmdbIndex.size} TMDB IDs (${allFilms.length} total)`);
  return cache;
}

/** Lookup a film in cache (O(1) access). Returns null on cache miss. */
export function lookupFilmInCache(normalizedTitle: string): FilmRecord | null {
  const cached = filmCache?.get(normalizedTitle);
  if (cached) {
    cacheStats.hits++;
    return cached;
  }
  cacheStats.misses++;
  return null;
}

/** Log cache performance stats. */
export function logCacheStats(): void {
  const total = cacheStats.hits + cacheStats.misses;
  const hitRate = total > 0 ? ((cacheStats.hits / total) * 100).toFixed(1) : "0";
  console.log(`[Pipeline] Cache stats: ${cacheStats.hits} hits, ${cacheStats.misses} misses (${hitRate}% hit rate), ${cacheStats.dbQueries} DB queries`);
}

/** Add a new film to the cache. */
export function addToFilmCache(film: FilmRecord) {
  if (filmCache && normalizeFn) {
    const normalized = normalizeFn(film.title);
    filmCache.set(normalized, film);
  }
  if (tmdbIdIndex && film.tmdbId) {
    tmdbIdIndex.set(film.tmdbId, film);
  }
}

/** Reset cache state (for testing or between pipeline runs). */
export function resetFilmCache(): void {
  filmCache = null;
  tmdbIdIndex = null;
  normalizeFn = null;
  cacheStats = { hits: 0, misses: 0, dbQueries: 0 };
}

// ============================================================================
// Similarity Search
// ============================================================================

/**
 * Try to find an existing film via trigram similarity search.
 * Returns the matching filmId or null.
 */
export async function findFilmBySimilarity(
  matchingTitle: string,
  scraperYear?: number
): Promise<string | null> {
  if (!isSimilarityConfigured()) {
    return null;
  }

  try {
    const match = await findMatchingFilm(
      matchingTitle,
      scraperYear,
      isGeminiConfigured()
    );

    if (match) {
      console.log(
        `[Pipeline] Similarity match (${match.confidence}): "${matchingTitle}" → existing film`
      );
      return match.filmId;
    }
  } catch (e) {
    console.warn(`[Pipeline] Similarity search failed for "${matchingTitle}":`, e);
  }

  return null;
}

// ============================================================================
// TMDB Matching & Film Creation
// ============================================================================

/**
 * Try to match a film via TMDB and create a new record if found.
 * Returns the new filmId or null if no TMDB match.
 */
export async function matchAndCreateFromTMDB(
  matchingTitle: string,
  scraperYear?: number,
  scraperDirector?: string,
  scraperPosterUrl?: string
): Promise<string | null> {
  const match = await matchFilmToTMDB(matchingTitle, {
    year: scraperYear,
    director: scraperDirector,
  });

  if (!match) {
    return null;
  }

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
    posterUrl = await findPosterFromService({
      title: details.details.title,
      year: match.year,
      imdbId: details.details.imdb_id || undefined,
      tmdbId: match.tmdbId,
      scraperPosterUrl,
    });
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

/**
 * Create a film record without TMDB data (fallback path).
 * Returns the new filmId.
 */
export async function createFilmWithoutTMDB(
  matchingTitle: string,
  scraperYear?: number,
  scraperDirector?: string,
  scraperPosterUrl?: string
): Promise<string> {
  // Try to find a poster from other sources
  let posterUrl: string | null = null;

  if (scraperPosterUrl) {
    posterUrl = scraperPosterUrl;
    console.log(`[Pipeline] Using scraper-provided poster`);
  } else {
    posterUrl = await findPosterFromService({
      title: matchingTitle,
      year: scraperYear,
      scraperPosterUrl,
    });
  }

  const filmId = uuidv4();

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

// ============================================================================
// Poster Utilities
// ============================================================================

interface PosterSearchParams {
  title: string;
  year?: number;
  imdbId?: string;
  tmdbId?: number;
  scraperPosterUrl?: string;
}

/**
 * Find a poster from the poster service (OMDB, Fanart, etc.).
 * Returns the poster URL or null.
 */
async function findPosterFromService(params: PosterSearchParams): Promise<string | null> {
  try {
    const posterService = getPosterService();
    const posterResult = await posterService.findPoster({
      title: params.title,
      year: params.year,
      imdbId: params.imdbId,
      tmdbId: params.tmdbId,
      scraperPosterUrl: params.scraperPosterUrl,
    });

    // Don't use placeholder URLs in the database - leave null for later enrichment
    if (posterResult.source !== "placeholder") {
      console.log(`[Pipeline] Found poster from ${posterResult.source.toUpperCase()}`);
      return posterResult.url;
    }
  } catch {
    // Poster search failed, continue without
  }

  return null;
}

/**
 * Try to update a film's poster using multiple sources.
 */
export async function tryUpdatePoster(
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
