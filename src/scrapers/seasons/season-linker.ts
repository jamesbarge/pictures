/**
 * Season Linker
 * 
 * Links films to seasons during the main scrape pipeline.
 * When a film is created/updated, checks if it matches any existing season's
 * raw film titles and creates the season_films junction record.
 */

import { db } from "@/db";
import { seasons, seasonFilms, films } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

// Cache of active seasons with their raw film titles (normalized)
interface SeasonCache {
  id: string;
  name: string;
  rawFilmTitles: string[];
  normalizedTitles: Set<string>;
}

let seasonCache: SeasonCache[] | null = null;
let cacheLoadedAt: Date | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Normalize a title for comparison
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
 * Load all active seasons into cache
 */
async function loadSeasonCache(): Promise<SeasonCache[]> {
  // Check if cache is still valid
  if (seasonCache && cacheLoadedAt) {
    const age = Date.now() - cacheLoadedAt.getTime();
    if (age < CACHE_TTL_MS) {
      return seasonCache;
    }
  }

  // Load active seasons with raw film titles
  const activeSeasons = await db
    .select({
      id: seasons.id,
      name: seasons.name,
      rawFilmTitles: seasons.rawFilmTitles,
    })
    .from(seasons)
    .where(eq(seasons.isActive, true));

  seasonCache = activeSeasons.map((s) => ({
    id: s.id,
    name: s.name,
    rawFilmTitles: s.rawFilmTitles || [],
    normalizedTitles: new Set((s.rawFilmTitles || []).map(normalizeTitle)),
  }));

  cacheLoadedAt = new Date();
  console.log(`[SeasonLinker] Loaded ${seasonCache.length} active seasons`);

  return seasonCache;
}

/**
 * Clear the season cache (call after season scrapers run)
 */
export function clearSeasonCache(): void {
  seasonCache = null;
  cacheLoadedAt = null;
}

/**
 * Link a film to any matching seasons
 * 
 * Called after a film is created/updated in the main pipeline.
 * Checks if the film title matches any season's raw film titles.
 * 
 * @param filmId - The film's database ID
 * @param filmTitle - The film's title (will be normalized for matching)
 * @returns Number of seasons the film was linked to
 */
export async function linkFilmToMatchingSeasons(
  filmId: string,
  filmTitle: string
): Promise<number> {
  const cache = await loadSeasonCache();
  
  if (cache.length === 0) {
    return 0;
  }

  const normalizedFilmTitle = normalizeTitle(filmTitle);
  let linkedCount = 0;

  for (const season of cache) {
    // Check if this film matches any of the season's raw titles
    if (!season.normalizedTitles.has(normalizedFilmTitle)) {
      // Try fuzzy match - check if film title starts with or contains season title
      let matched = false;
      for (const seasonTitle of season.normalizedTitles) {
        if (
          normalizedFilmTitle.startsWith(seasonTitle) ||
          seasonTitle.startsWith(normalizedFilmTitle) ||
          levenshteinSimilarity(normalizedFilmTitle, seasonTitle) > 0.85
        ) {
          matched = true;
          break;
        }
      }
      if (!matched) continue;
    }

    // Check if link already exists
    const existing = await db
      .select({ seasonId: seasonFilms.seasonId })
      .from(seasonFilms)
      .where(
        and(
          eq(seasonFilms.seasonId, season.id),
          eq(seasonFilms.filmId, filmId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      continue; // Already linked
    }

    // Create the link
    try {
      await db.insert(seasonFilms).values({
        seasonId: season.id,
        filmId: filmId,
      });
      linkedCount++;
      console.log(`[SeasonLinker] Linked "${filmTitle}" to season "${season.name}"`);
    } catch (error) {
      // Likely a duplicate key error - ignore
      console.warn(`[SeasonLinker] Failed to link film to season:`, error);
    }
  }

  return linkedCount;
}

/**
 * Re-link all films for a specific season
 * 
 * Called after a season scraper runs to link films that already exist.
 * 
 * @param seasonId - The season's database ID
 * @returns Number of new links created
 */
export async function relinkSeasonFilms(seasonId: string): Promise<number> {
  // Get the season's raw film titles
  const [season] = await db
    .select({
      id: seasons.id,
      name: seasons.name,
      rawFilmTitles: seasons.rawFilmTitles,
    })
    .from(seasons)
    .where(eq(seasons.id, seasonId))
    .limit(1);

  if (!season) {
    console.warn(`[SeasonLinker] Season not found: ${seasonId}`);
    return 0;
  }

  const rawTitles = season.rawFilmTitles || [];
  if (rawTitles.length === 0) {
    return 0;
  }

  // Normalize all titles
  const normalizedTitles = rawTitles.map(normalizeTitle);

  // Get all films
  const allFilms = await db
    .select({
      id: films.id,
      title: films.title,
    })
    .from(films);

  let linkedCount = 0;

  for (const film of allFilms) {
    const normalizedFilmTitle = normalizeTitle(film.title);

    // Check for match
    const isMatch = normalizedTitles.some(
      (seasonTitle) =>
        seasonTitle === normalizedFilmTitle ||
        normalizedFilmTitle.startsWith(seasonTitle) ||
        seasonTitle.startsWith(normalizedFilmTitle) ||
        levenshteinSimilarity(normalizedFilmTitle, seasonTitle) > 0.85
    );

    if (!isMatch) continue;

    // Check if link exists
    const existing = await db
      .select({ seasonId: seasonFilms.seasonId })
      .from(seasonFilms)
      .where(
        and(
          eq(seasonFilms.seasonId, seasonId),
          eq(seasonFilms.filmId, film.id)
        )
      )
      .limit(1);

    if (existing.length > 0) continue;

    // Create link
    try {
      await db.insert(seasonFilms).values({
        seasonId: seasonId,
        filmId: film.id,
      });
      linkedCount++;
      console.log(`[SeasonLinker] Linked "${film.title}" to season "${season.name}"`);
    } catch {
      // Ignore duplicates
    }
  }

  return linkedCount;
}

/**
 * Calculate Levenshtein similarity (0-1 scale)
 */
function levenshteinSimilarity(a: string, b: string): number {
  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - distance / maxLen;
}

/**
 * Levenshtein distance implementation
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
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}
