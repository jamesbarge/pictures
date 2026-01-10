/**
 * Season Pipeline
 * Saves scraped season data to the database and links films
 *
 * Handles:
 * 1. Creating/updating Season records
 * 2. Matching film titles to existing films in the database
 * 3. Creating SeasonFilm junction table entries
 */

import { db } from "@/db";
import { seasons, seasonFilms, films } from "@/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { RawSeason, RawSeasonFilm, SeasonSaveResult } from "./types";
import type { SeasonInsert, SeasonFilmInsert } from "@/db/schema";

/**
 * Process and save scraped seasons to the database
 */
export async function processSeasons(
  rawSeasons: RawSeason[]
): Promise<SeasonSaveResult> {
  console.log(`[SeasonPipeline] Processing ${rawSeasons.length} seasons`);

  const result: SeasonSaveResult = {
    created: 0,
    updated: 0,
    filmsLinked: 0,
    filmsUnmatched: 0,
    seasonSlugs: [],
  };

  // Load film cache for matching
  const filmCache = await buildFilmCache();
  console.log(`[SeasonPipeline] Film cache loaded with ${filmCache.size} films`);

  for (const rawSeason of rawSeasons) {
    try {
      const saved = await saveSeason(rawSeason, filmCache);
      result.seasonSlugs.push(saved.slug);

      if (saved.isNew) {
        result.created++;
      } else {
        result.updated++;
      }

      result.filmsLinked += saved.filmsLinked;
      result.filmsUnmatched += saved.filmsUnmatched;
    } catch (error) {
      console.error(
        `[SeasonPipeline] Failed to save season "${rawSeason.name}":`,
        error
      );
    }
  }

  console.log(
    `[SeasonPipeline] Complete: ${result.created} created, ${result.updated} updated, ` +
      `${result.filmsLinked} films linked, ${result.filmsUnmatched} unmatched`
  );

  return result;
}

/**
 * Film cache entry
 */
interface CachedFilm {
  id: string;
  title: string;
  normalizedTitle: string;
  year: number | null;
  directors: string[];
}

/**
 * Build a cache of all films for efficient matching
 */
async function buildFilmCache(): Promise<Map<string, CachedFilm>> {
  const cache = new Map<string, CachedFilm>();

  const allFilms = await db
    .select({
      id: films.id,
      title: films.title,
      year: films.year,
      directors: films.directors,
    })
    .from(films);

  for (const film of allFilms) {
    const normalized = normalizeTitle(film.title);
    cache.set(normalized, {
      id: film.id,
      title: film.title,
      normalizedTitle: normalized,
      year: film.year,
      directors: film.directors,
    });
  }

  return cache;
}

/**
 * Save a single season and its film associations
 */
async function saveSeason(
  rawSeason: RawSeason,
  filmCache: Map<string, CachedFilm>
): Promise<{
  slug: string;
  isNew: boolean;
  filmsLinked: number;
  filmsUnmatched: number;
}> {
  // Generate slug with cinema suffix for uniqueness
  const baseSlug = generateSlug(rawSeason.name);
  const slug = `${baseSlug}-${rawSeason.sourceCinema}`;

  // Check if season already exists
  const existing = await db
    .select()
    .from(seasons)
    .where(eq(seasons.slug, slug))
    .limit(1);

  const isNew = existing.length === 0;

  // Prepare season data
  const seasonData: SeasonInsert = {
    id: isNew ? uuidv4() : existing[0].id,
    name: rawSeason.name,
    slug,
    description: rawSeason.description || null,
    directorName: rawSeason.directorName || null,
    directorTmdbId: null, // Will be enriched in Phase 6
    startDate: rawSeason.startDate
      ? formatDateForDb(rawSeason.startDate)
      : formatDateForDb(new Date()),
    endDate: rawSeason.endDate
      ? formatDateForDb(rawSeason.endDate)
      : formatDateForDb(getDefaultEndDate()),
    posterUrl: rawSeason.posterUrl || null,
    websiteUrl: rawSeason.websiteUrl,
    sourceUrl: rawSeason.websiteUrl,
    sourceCinemas: [rawSeason.sourceCinema],
    isActive: true,
    scrapedAt: new Date(),
  };

  if (isNew) {
    // Insert new season
    await db.insert(seasons).values(seasonData);
    console.log(`[SeasonPipeline] Created season: ${rawSeason.name}`);
  } else {
    // Update existing season
    await db
      .update(seasons)
      .set({
        name: seasonData.name,
        description: seasonData.description,
        directorName: seasonData.directorName,
        startDate: seasonData.startDate,
        endDate: seasonData.endDate,
        posterUrl: seasonData.posterUrl,
        websiteUrl: seasonData.websiteUrl,
        scrapedAt: seasonData.scrapedAt,
        updatedAt: new Date(),
      })
      .where(eq(seasons.id, seasonData.id));
    console.log(`[SeasonPipeline] Updated season: ${rawSeason.name}`);
  }

  // Link films to season
  const { linked, unmatched } = await linkFilmsToSeason(
    seasonData.id,
    rawSeason.films,
    filmCache
  );

  return {
    slug,
    isNew,
    filmsLinked: linked,
    filmsUnmatched: unmatched,
  };
}

/**
 * Link films to a season, matching by title
 */
async function linkFilmsToSeason(
  seasonId: string,
  rawFilms: RawSeasonFilm[],
  filmCache: Map<string, CachedFilm>
): Promise<{ linked: number; unmatched: number }> {
  let linked = 0;
  let unmatched = 0;

  // Delete existing associations (we'll recreate them)
  await db.delete(seasonFilms).where(eq(seasonFilms.seasonId, seasonId));

  for (let i = 0; i < rawFilms.length; i++) {
    const rawFilm = rawFilms[i];
    const matchedFilm = findMatchingFilm(rawFilm, filmCache);

    if (matchedFilm) {
      // Create association
      const association: SeasonFilmInsert = {
        seasonId,
        filmId: matchedFilm.id,
        orderIndex: rawFilm.orderIndex ?? i,
      };

      try {
        await db.insert(seasonFilms).values(association);
        linked++;
      } catch (error) {
        // Likely duplicate - ignore
        console.warn(
          `[SeasonPipeline] Duplicate film association: ${rawFilm.title}`
        );
      }
    } else {
      unmatched++;
      console.log(
        `[SeasonPipeline] Could not match film: "${rawFilm.title}"${
          rawFilm.year ? ` (${rawFilm.year})` : ""
        }`
      );
    }
  }

  return { linked, unmatched };
}

/**
 * Find a matching film in the cache
 * Tries multiple matching strategies in order of confidence
 */
function findMatchingFilm(
  rawFilm: RawSeasonFilm,
  filmCache: Map<string, CachedFilm>
): CachedFilm | null {
  const normalizedTitle = normalizeTitle(rawFilm.title);

  // Strategy 1: Exact normalized title match
  const exactMatch = filmCache.get(normalizedTitle);
  if (exactMatch) {
    // If we have year info, verify it matches
    if (rawFilm.year && exactMatch.year && rawFilm.year !== exactMatch.year) {
      // Year mismatch - might be wrong film, try other strategies
    } else {
      return exactMatch;
    }
  }

  // Strategy 2: Title with year stripped (common pattern: "Film Title (1992)")
  const titleWithoutYear = rawFilm.title.replace(/\s*\(\d{4}\)\s*$/, "").trim();
  const normalizedWithoutYear = normalizeTitle(titleWithoutYear);
  if (normalizedWithoutYear !== normalizedTitle) {
    const match = filmCache.get(normalizedWithoutYear);
    if (match) return match;
  }

  // Strategy 3: Title + year match (check all films for year match)
  if (rawFilm.year) {
    for (const film of filmCache.values()) {
      if (film.year === rawFilm.year) {
        // Check if titles are similar enough
        if (titlesMatch(normalizedTitle, film.normalizedTitle)) {
          return film;
        }
      }
    }
  }

  // Strategy 4: Director match (if both have director info)
  if (rawFilm.director) {
    const normalizedDirector = rawFilm.director.toLowerCase();
    for (const film of filmCache.values()) {
      if (film.directors.some((d) => d.toLowerCase().includes(normalizedDirector))) {
        if (titlesMatch(normalizedTitle, film.normalizedTitle)) {
          return film;
        }
      }
    }
  }

  return null;
}

/**
 * Check if two normalized titles match (with fuzzy tolerance)
 */
function titlesMatch(a: string, b: string): boolean {
  // Exact match
  if (a === b) return true;

  // One is a prefix of the other (handles subtitles)
  if (a.startsWith(b) || b.startsWith(a)) return true;

  // Edit distance for typo tolerance (only for similar-length titles)
  if (Math.abs(a.length - b.length) <= 3) {
    const distance = levenshteinDistance(a, b);
    const maxLen = Math.max(a.length, b.length);
    if (distance / maxLen < 0.2) {
      // Less than 20% difference
      return true;
    }
  }

  return false;
}

/**
 * Simple Levenshtein distance implementation
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Normalize a film title for comparison
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^the\s+/i, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Generate a URL-safe slug from text
 */
function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[:;,!?()[\]{}]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Format a Date for database (YYYY-MM-DD string)
 */
function formatDateForDb(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Get a default end date (3 months from now)
 */
function getDefaultEndDate(): Date {
  const date = new Date();
  date.setMonth(date.getMonth() + 3);
  return date;
}

/**
 * Merge a season that appears at multiple cinemas
 * Used when the same director season runs at BFI + Barbican, etc.
 */
export async function mergeSeasonSources(
  primarySlug: string,
  additionalCinema: string
): Promise<void> {
  const season = await db
    .select()
    .from(seasons)
    .where(eq(seasons.slug, primarySlug))
    .limit(1);

  if (season.length === 0) {
    console.warn(`[SeasonPipeline] Cannot merge - season not found: ${primarySlug}`);
    return;
  }

  const currentCinemas = season[0].sourceCinemas || [];
  if (!currentCinemas.includes(additionalCinema)) {
    await db
      .update(seasons)
      .set({
        sourceCinemas: [...currentCinemas, additionalCinema],
        updatedAt: new Date(),
      })
      .where(eq(seasons.slug, primarySlug));

    console.log(
      `[SeasonPipeline] Merged ${additionalCinema} into season: ${primarySlug}`
    );
  }
}
