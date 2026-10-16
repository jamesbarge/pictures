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
import { isBlockedTmdbId } from "@/lib/tmdb/blocklist";
import { sanitizeDirectors, sanitizeYear } from "./film-write-guards";

/**
 * The cache stores only the columns its consumers actually read, NOT the whole
 * films row. `SELECT *` pulled 3,456 rows / 5.10 MB per venue, and because
 * `initFilmCache` runs once per venue for all 71 venues (every venue inside
 * every chain included), a concurrency-4 wave put four of those on the pooler
 * at once and the select could exceed its own 15s `withDbTimeout` ceiling —
 * measured blowing it at 15,001ms with nothing else touching the DB. Each throw
 * then cost 4 attempts (retryAttempts: 3) that RE-SCRAPE the venue's site.
 *
 * The six columns below are the complete read set:
 *   - `title`    — initFilmCache/addToFilmCache normalize it for the byTitle key
 *   - `tmdbId`   — byTmdbId index + the "prefer the row with TMDB data" tiebreak
 *   - `id`       — every caller returns this as the resolved filmId
 *   - `posterUrl`, `year`, `imdbId` — pipeline.ts getOrCreateFilm's
 *     tryUpdatePoster backfill for a cached film with no poster
 *   - `originalTitle` — initFilmCache's original-title alias keys
 *
 * Adding a consumer that needs another column means adding it to BOTH this Pick
 * and the select projection in initFilmCache. Correctness beats the byte count:
 * widen it rather than re-deriving the column from something else.
 */
type FilmRecord = Pick<
  typeof films.$inferSelect,
  "id" | "title" | "originalTitle" | "year" | "tmdbId" | "imdbId" | "posterUrl"
>;

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
  /** normalizedTitle -> the film a listing with no release year gets (see `prefersForTitle`) */
  byTitle: Map<string, FilmRecord>;
  /**
   * normalizedTitle -> every film with that title. Remakes and namesakes share a
   * key ("Heat" 1972/1995, "Halloween" 1978/2007), and only the scraper's release
   * year can tell them apart, so `lookupFilmInCache` picks from this list.
   */
  namesakes: Map<string, FilmRecord[]>;
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
    namesakes: new Map(),
    byTmdbId: new Map(),
    stats: { hits: 0, misses: 0, dbQueries: 1 },
    normalizeTitle,
  };

  // Projection is deliberately narrow — see the FilmRecord JSDoc above. Keep
  // this column list and the Pick<> in sync.
  const allFilms = await withDbTimeout(
    db
      .select({
        id: films.id,
        title: films.title,
        originalTitle: films.originalTitle,
        year: films.year,
        tmdbId: films.tmdbId,
        imdbId: films.imdbId,
        posterUrl: films.posterUrl,
      })
      .from(films),
    15_000,
    "initFilmCache: select films",
  );

  let blockedCount = 0;
  for (const film of allFilms) {
    const normalized = normalizeTitle(film.title);
    addNamesake(cache, normalized, film);
    const existing = cache.byTitle.get(normalized);
    if (!existing || prefersForTitle(film, existing)) {
      cache.byTitle.set(normalized, film);
    }
    // Build TMDB ID index — two films with same TMDB ID are always the same film.
    // Preventive blocklist (plan 008): a film carrying a blocklisted (known
    // wrong) TMDB id must NOT be reachable through the tmdb-id index, so the
    // wrong id can't be reused by tmdb-id lookups. Belt-and-braces: the
    // matcher already filters blocked ids from search results, so this skip
    // only matters if a blocked id reaches the dedup path some other way.
    // The byTitle entry above is intentionally kept — skipping it too would
    // make the same-title path create a duplicate film row per scrape. Row
    // REPAIR (re-matching to the correct id) is the rematch sweep's job
    // (rematch-unmatched-films.ts), not this cache's.
    if (film.tmdbId) {
      if (isBlockedTmdbId(film.tmdbId)) {
        blockedCount++;
      } else {
        cache.byTmdbId.set(film.tmdbId, film);
      }
    }
  }

  const aliasCount = addOriginalTitleAliases(cache, allFilms);

  console.log(
    `[Pipeline] Film cache initialized with ${cache.byTitle.size - aliasCount} unique films, ${aliasCount} original-title aliases, ${cache.byTmdbId.size} TMDB IDs (${allFilms.length} total)`,
  );
  if (blockedCount > 0) {
    console.log(
      `[Pipeline] ${blockedCount} cached films carry blocklisted TMDB ids — invisible to tmdb-id lookups; run the rematch sweep to repair the rows`,
    );
  }
  return cache;
}

/**
 * Index each film under its original title as well, so a venue that lists
 * "Le Boucher" or "Festen" finds the row TMDB titled "The Butcher" or "The
 * Celebration". Returns the number of aliases added.
 *
 * Aliases never redirect a title that already resolves: a title key always
 * wins, and an alias that two different films share is indexed for neither.
 * Rows of the same TMDB film count as one film. A film carrying a blocklisted
 * TMDB id gets no alias, because its original title came from the wrong film.
 */
function addOriginalTitleAliases(cache: FilmCache, allFilms: FilmRecord[]): number {
  const owners = new Map<string, FilmRecord | null>();
  for (const film of allFilms) {
    if (!film.originalTitle || (film.tmdbId && isBlockedTmdbId(film.tmdbId))) continue;
    const alias = cache.normalizeTitle(film.originalTitle);
    if (!alias || cache.byTitle.has(alias)) continue;

    const owner = owners.get(alias);
    if (owner === undefined) {
      owners.set(alias, film);
    } else if (owner && owner.id !== film.id && !(owner.tmdbId && owner.tmdbId === film.tmdbId)) {
      owners.set(alias, null);
    }
  }

  let added = 0;
  for (const [alias, film] of owners) {
    if (!film) continue;
    cache.byTitle.set(alias, film);
    added++;
  }
  return added;
}

/**
 * Lookup a film in cache (O(1) access). Returns null on cache miss.
 *
 * With a release year, a same-title film within a year of it wins ("Heat" 1995
 * at PCC gets Mann's film, not the 1972 one). Otherwise the title's default
 * film comes back, and `yearConflicts` tells the caller it disagrees.
 */
export function lookupFilmInCache(
  cache: FilmCache,
  normalizedTitle: string,
  scraperYear?: number,
): FilmRecord | null {
  const cached = cache.byTitle.get(normalizedTitle);
  if (cached) {
    cache.stats.hits++;
    const hint = releaseYearHint(scraperYear);
    if (hint !== undefined && yearConflicts(cached, hint)) {
      const sameYear = cache.namesakes
        .get(normalizedTitle)
        ?.find((film) => film.year != null && Math.abs(film.year - hint) <= 1);
      if (sameYear) return sameYear;
    }
    return cached;
  }
  cache.stats.misses++;
  return null;
}

/**
 * Many scrapers send the SCREENING year, and a current-year "(YYYY)" in a title
 * is indistinguishable from it, so only a year strictly before this one counts
 * as a release year (and only a sane one).
 */
export function releaseYearHint(scraperYear?: number): number | undefined {
  return scraperYear && scraperYear >= 1900 && scraperYear < new Date().getFullYear()
    ? scraperYear
    : undefined;
}

/** True when the scraper's release year and the film's known year are more than a year apart. */
export function yearConflicts(film: Pick<FilmRecord, "year">, scraperYear?: number): boolean {
  const hint = releaseYearHint(scraperYear);
  return hint !== undefined && film.year != null && Math.abs(film.year - hint) > 1;
}

/**
 * Which same-title film a listing with NO year gets: the one with TMDB data,
 * then, between two TMDB films, the newer. Everyman and Picturehouse send no
 * year and mostly show new releases, so "Dracula" there stays Radu Jude's 2025
 * film after Hammer's 1958 one gets a row. Two rows without TMDB data keep the
 * first loaded: the newer one is usually a screening-year stub ("Nostalghia"
 * 2026 next to Tarkovsky's 1983 row).
 * ponytail: a repertory venue that sends no year also gets the newer TMDB film;
 * it has to send a year to reach an older namesake.
 */
function prefersForTitle(film: FilmRecord, current: FilmRecord): boolean {
  if (!!film.tmdbId !== !!current.tmdbId) return !!film.tmdbId;
  return !!film.tmdbId && (film.year ?? 0) > (current.year ?? 0);
}

function addNamesake(cache: FilmCache, normalized: string, film: FilmRecord) {
  const list = cache.namesakes.get(normalized);
  if (list) list.push(film);
  else cache.namesakes.set(normalized, [film]);
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
  addNamesake(cache, normalized, film);
  const existing = cache.byTitle.get(normalized);
  if (!existing || prefersForTitle(film, existing)) {
    cache.byTitle.set(normalized, film);
  }
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
  scraperPosterUrl?: string,
  scraperRuntime?: number,
  venueLanguages?: string[],
  allowCurrentRelease = false,
  requireYearAgreement = false
): Promise<string | null> {
  // Year discipline (`releaseYearHint`): a wrong current-year hint gives junk
  // stubs a +0.2/+0.3 exact-year bonus and SELECTS the wrong film; losing a
  // true hint merely costs a bonus. Same rule as createFilmWithoutTMDB.
  const yearHint = releaseYearHint(scraperYear);

  const match = await matchFilmToTMDB(matchingTitle, {
    year: yearHint,
    director: scraperDirector,
    runtime: scraperRuntime,
    venueLanguages,
    allowCurrentRelease,
  });

  if (!match) {
    return null;
  }

  // The year-conflict path in getOrCreateFilm only wants a film the scraper's
  // year vouches for; anything else keeps the cached film it already had.
  if (requireYearAgreement && yearHint !== undefined && Math.abs(match.year - yearHint) > 1) {
    return null;
  }

  // Audit-trail accuracy: record the strategy that actually applied. After
  // year-stripping, a current-year film matches with NO year hint — labeling
  // it "auto-with-year" would be wrong (schema vocabulary: films.ts). A match
  // from the current-release rule says so itself.
  const matchStrategy =
    match.strategy ??
    (yearHint
      ? "auto-with-year"
      : scraperDirector
        ? "auto-with-director"
        : "auto-no-hints");

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

  // Get full details from TMDB. When the runtime cross-check already fetched
  // the details for this match, reuse them instead of refetching.
  const client = getTMDBClient();
  const details = await client.getFullFilmData(match.tmdbId, match.details);

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
    tmdbVoteCount: details.details.vote_count,
    // Match audit trail — must mirror the addToFilmCache call below. These
    // were silently dropped before plan 005: only 4.3% of matched films had
    // any recorded confidence.
    letterboxdUrl: `https://letterboxd.com/tmdb/${match.tmdbId}`,
    matchConfidence: match.confidence ?? null,
    matchStrategy,
    matchedAt: new Date(),
  });

  // Add to cache so subsequent lookups in this run find it. Only the cached
  // column set — the row we just INSERTed above carries the rest.
  addToFilmCache(cache, {
    id: filmId,
    title: details.details.title,
    originalTitle: details.details.original_title,
    year: guardedYear,
    tmdbId: match.tmdbId,
    imdbId: details.details.imdb_id,
    posterUrl,
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

  // Add to cache so subsequent lookups in this run find it. Only the cached
  // column set — the row we just INSERTed above carries the rest.
  addToFilmCache(cache, {
    id: filmId,
    title: matchingTitle,
    originalTitle: null,
    year: cleanYear ?? null,
    tmdbId: null,
    imdbId: null,
    posterUrl,
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
