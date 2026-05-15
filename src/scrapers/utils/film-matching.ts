/**
 * Film Matching Utilities
 *
 * Handles TMDB search, similarity matching, poster resolution, and
 * film record creation. Extracted from the scraper pipeline to keep
 * getOrCreateFilm() focused on orchestration.
 */

import { db, withDbTimeout } from "@/db";
import { films } from "@/db/schema";
import { eq } from "drizzle-orm";
import { matchFilmToTMDB, getTMDBClient, isRepertoryFilm, getDecade } from "@/lib/tmdb";
import { getPosterService } from "@/lib/posters";
import {
  findMatchingFilm,
  isSimilarityConfigured,
} from "@/lib/film-similarity";
import { v4 as uuidv4 } from "uuid";
import { sanitizeDirectors, sanitizeYear } from "./film-write-guards";

type FilmRecord = typeof films.$inferSelect;

// ============================================================================
// Film Cache
// ============================================================================

/**
 * Per-pipeline-run film cache.
 *
 * Replaces module-level singletons (was a real concurrency hazard:
 * `runWave` runs cinemas in parallel — cap 4 — and the pre-2026-05-07
 * shape reset module-level cache state on every per-cinema call to
 * `initFilmCache`, so cinema B's reset could wipe cinema A's mid-run
 * cache and cause A to create duplicate film rows for entries it had
 * already cached. Now each `processScreenings` invocation owns its own
 * `FilmCache` object — no shared mutable state.)
 */
export interface FilmCache {
  /** normalizedTitle -> film record */
  byTitle: Map<string, FilmRecord>;
  /** tmdbId -> film record, for dedup by TMDB ID */
  byTmdbId: Map<number, FilmRecord>;
  /** Stats for end-of-run logging */
  stats: { hits: number; misses: number; dbQueries: number };
  /** Stored normalizer so cache writes use the same one as the load */
  normalizeTitle: (title: string) => string;
}

/**
 * Initialize a film cache for O(1) lookups during one pipeline run.
 * Loads all films once - with ~750 films this is fast and simple.
 */
export async function initFilmCache(
  normalizeTitle: (title: string) => string,
): Promise<FilmCache> {
  const cache: FilmCache = {
    byTitle: new Map(),
    byTmdbId: new Map(),
    stats: { hits: 0, misses: 0, dbQueries: 1 },
    normalizeTitle,
  };

  const allFilms = await withDbTimeout(
    db.select().from(films),
    15_000,
    "initFilmCache: select films",
  );

  for (const film of allFilms) {
    const normalized = normalizeTitle(film.title);
    // If duplicate normalized titles exist, keep the one with more data (has TMDB ID)
    const existing = cache.byTitle.get(normalized);
    if (!existing || (film.tmdbId && !existing.tmdbId)) {
      cache.byTitle.set(normalized, film);
    }
    // Build TMDB ID index — two films with same TMDB ID are always the same film
    if (film.tmdbId) {
      cache.byTmdbId.set(film.tmdbId, film);
    }
  }

  console.log(
    `[Pipeline] Film cache initialized with ${cache.byTitle.size} unique films, ${cache.byTmdbId.size} TMDB IDs (${allFilms.length} total)`,
  );
  return cache;
}

/** Lookup a film in cache (O(1) access). Returns null on cache miss. */
export function lookupFilmInCache(cache: FilmCache, normalizedTitle: string): FilmRecord | null {
  const cached = cache.byTitle.get(normalizedTitle);
  if (cached) {
    cache.stats.hits++;
    return cached;
  }
  cache.stats.misses++;
  return null;
}

/** Log cache performance stats. */
export function logCacheStats(cache: FilmCache): void {
  const total = cache.stats.hits + cache.stats.misses;
  const hitRate = total > 0 ? ((cache.stats.hits / total) * 100).toFixed(1) : "0";
  console.log(
    `[Pipeline] Cache stats: ${cache.stats.hits} hits, ${cache.stats.misses} misses (${hitRate}% hit rate), ${cache.stats.dbQueries} DB queries`,
  );
}

/** Add a new film to the cache. */
function addToFilmCache(cache: FilmCache, film: FilmRecord) {
  const normalized = cache.normalizeTitle(film.title);
  cache.byTitle.set(normalized, film);
  if (film.tmdbId) {
    cache.byTmdbId.set(film.tmdbId, film);
  }
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
    const match = await findMatchingFilm(matchingTitle, scraperYear);

    if (match) {
      console.log(
        `[Pipeline] Similarity match (${match.confidence}): "${matchingTitle}" → existing film`
      );
      return match.filmId;
    }
  } catch (error) {
    console.warn(`[Pipeline] Similarity search failed for "${matchingTitle}":`, error);
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
  cache: FilmCache,
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
  const cachedByTmdb = cache.byTmdbId.get(match.tmdbId);
  if (cachedByTmdb) {
    cache.stats.hits++;
    return cachedByTmdb.id;
  }

  const byTmdbId = await withDbTimeout(
    db.select().from(films).where(eq(films.tmdbId, match.tmdbId)).limit(1),
    10_000,
    `matchAndCreateFromTMDB: tmdbId lookup ${match.tmdbId}`,
  );
  cache.stats.dbQueries++;

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

  const guardedYear = sanitizeYear(match.year);
  const guardedDirectors = sanitizeDirectors(
    details.directors,
    `film-matching tmdb=${match.tmdbId} title="${details.details.title}"`
  );

  await db.insert(films).values({
    id: filmId,
    tmdbId: match.tmdbId,
    imdbId: details.details.imdb_id,
    title: details.details.title,
    originalTitle: details.details.original_title,
    year: guardedYear,
    runtime: details.details.runtime,
    directors: guardedDirectors,
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
    decade: guardedYear ? getDecade(guardedYear) : null,
    tmdbRating: details.details.vote_average,
    tmdbPopularity: details.details.popularity,
  });

  // Add to cache so subsequent lookups in this run find it
  addToFilmCache(cache, {
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
    tmdbPopularity: details.details.popularity,
    letterboxdUrl: `https://letterboxd.com/tmdb/${match.tmdbId}`,
    letterboxdRating: null,
    matchConfidence: match.confidence ?? null,
    matchStrategy: "auto-with-year",
    matchedAt: new Date(),
    enrichmentStatus: null,
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
  cache: FilmCache,
  matchingTitle: string,
  scraperYear?: number,
  scraperDirector?: string,
  scraperPosterUrl?: string
): Promise<string> {
  // Sanitize scraperYear: many scrapers send the SCREENING year (the year the
  // screening takes place) when they can't extract a true release year. That
  // contaminated `films.year` for ~12 films per patrol batch and broke the
  // isRepertory heuristic for every old film mis-tagged with the current year.
  //
  // Rule: only accept `scraperYear` if it's strictly before the current year.
  // For the current calendar year we can't distinguish "new release" from
  // "screening year as placeholder" with confidence, so leave it null and let
  // TMDB enrichment fill it. Sane bounds also reject 0/negative/future years.
  const currentYear = new Date().getFullYear();
  const cleanYear =
    scraperYear && scraperYear >= 1900 && scraperYear < currentYear
      ? scraperYear
      : undefined;

  // Try to find a poster from other sources
  let posterUrl: string | null = null;

  if (scraperPosterUrl) {
    posterUrl = scraperPosterUrl;
    console.log(`[Pipeline] Using scraper-provided poster`);
  } else {
    posterUrl = await findPosterFromService({
      title: matchingTitle,
      year: cleanYear,
      scraperPosterUrl,
    });
  }

  const filmId = uuidv4();

  // Clean director: strip "Starring ..." suffix that cinema websites sometimes include
  const cleanedDirector = scraperDirector
    ?.replace(/\s+Starring\s+.*/i, "")
    .replace(/\s+With\s+.*/i, "")
    .trim() || undefined;

  // isRepertory is intentionally false when we have no year — enrichment will
  // overwrite it from the TMDB release date. Don't guess.
  const isRepertory = cleanYear ? cleanYear < currentYear - 2 : false;

  await db.insert(films).values({
    id: filmId,
    title: matchingTitle,
    year: cleanYear,
    directors: cleanedDirector ? [cleanedDirector] : [],
    posterUrl,
    isRepertory,
    cast: [],
    genres: [],
    countries: [],
    languages: [],
  });

  // Add to cache so subsequent lookups in this run find it
  addToFilmCache(cache, {
    id: filmId,
    title: matchingTitle,
    originalTitle: null,
    year: cleanYear ?? null,
    runtime: null,
    directors: cleanedDirector ? [cleanedDirector] : [],
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
    isRepertory,
    releaseStatus: null,
    decade: null,
    contentType: "film",
    sourceImageUrl: null,
    tmdbId: null,
    imdbId: null,
    tmdbRating: null,
    tmdbPopularity: null,
    letterboxdUrl: null,
    letterboxdRating: null,
    matchConfidence: null,
    matchStrategy: null,
    matchedAt: null,
    enrichmentStatus: null,
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
