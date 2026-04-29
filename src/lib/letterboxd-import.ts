/**
 * Letterboxd Watchlist Import
 *
 * Scrapes a user's Letterboxd watchlist, matches entries against our film
 * database, and enriches matched films with upcoming screening data.
 *
 * Used by:
 * - API routes (unauthenticated preview + authenticated import)
 * - the cloud orchestrator background task for unmatched entries
 */

import * as cheerio from "cheerio";
import { db } from "@/db";
import { films, screenings, cinemas } from "@/db/schema";
import { eq, gte, and, or, isNull, inArray } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LetterboxdEntry {
  title: string;
  year: number | null;
  letterboxdSlug: string;
  letterboxdId: string;
}

export interface EnrichedFilm {
  filmId: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  directors: string[];
  screenings: {
    count: number;
    next: {
      datetime: string;
      cinemaName: string;
      format: string | null;
      isSpecialEvent: boolean;
      eventDescription: string | null;
    } | null;
    isLastChance: boolean; // count <= 2
  };
}

export interface ImportResults {
  matched: EnrichedFilm[];
  unmatched: LetterboxdEntry[];
  total: number;
  username: string;
  capped: boolean; // true if watchlist > 500
}

export type ImportError =
  | "user_not_found"
  | "private_watchlist"
  | "empty_watchlist"
  | "rate_limited"
  | "network_error";

/** Typed error for Letterboxd import failures, carrying a machine-readable {@link ImportError} code. */
export class LetterboxdImportError extends Error {
  code: ImportError;

  constructor(code: ImportError, message?: string) {
    super(message ?? code);
    this.name = "LetterboxdImportError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_AGENT = "pictures.london/1.0";
const MAX_ENTRIES = 500;
const PAGE_DELAY_MS = 1000;
const FETCH_TIMEOUT_MS = 15000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_ENTRIES = 50;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normalize a film title for comparison.
 * Mirrors the pattern in src/lib/tmdb/match.ts but without stripping subtitles
 * (Letterboxd titles include the full title as the user expects it).
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/^the\s+/i, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\w\s'-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse title and year from a Letterboxd data attribute.
 * Format: "Film Title (2024)" or just "Film Title"
 */
function parseTitleYear(raw: string): { title: string; year: number | null } {
  const match = raw.match(/^(.+?)\s*\((\d{4})\)\s*$/);
  if (match) {
    return { title: match[1].trim(), year: parseInt(match[2], 10) };
  }
  return { title: raw.trim(), year: null };
}

// ---------------------------------------------------------------------------
// Scraper
// ---------------------------------------------------------------------------

/**
 * Scrape a Letterboxd user's watchlist.
 *
 * Fetches each page, extracts film entries via Cheerio, paginates until
 * there are no more pages or we hit the 500-entry cap.
 *
 * @throws {LetterboxdImportError} with appropriate code on failure
 */
export async function scrapeLetterboxdWatchlist(
  username: string,
): Promise<LetterboxdEntry[]> {
  // Validate username format (defense-in-depth; API route also validates)
  if (!/^[a-zA-Z0-9_-]+$/.test(username) || username.length > 40) {
    throw new LetterboxdImportError("user_not_found", "Invalid username format");
  }

  const entries: LetterboxdEntry[] = [];
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage && entries.length < MAX_ENTRIES) {
    const url =
      page === 1
        ? `https://letterboxd.com/${username}/watchlist/`
        : `https://letterboxd.com/${username}/watchlist/page/${page}/`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      throw new LetterboxdImportError(
        "network_error",
        `Failed to fetch watchlist page ${page}`,
      );
    }

    // Handle HTTP errors
    if (response.status === 404) {
      throw new LetterboxdImportError(
        "user_not_found",
        `Letterboxd user "${username}" not found`,
      );
    }
    if (response.status === 429 || response.status === 503) {
      throw new LetterboxdImportError(
        "rate_limited",
        `Letterboxd returned ${response.status}`,
      );
    }
    if (!response.ok) {
      throw new LetterboxdImportError(
        "network_error",
        `Letterboxd returned ${response.status}`,
      );
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Parse film entries from poster containers
    const pageEntries: LetterboxdEntry[] = [];

    // Letterboxd watchlist uses li.poster-container with a nested div.film-poster
    $("li.poster-container").each((_i, el) => {
      const poster = $(el).find("div.film-poster");
      if (!poster.length) return;

      const filmId = poster.attr("data-film-id") ?? "";
      const slug = poster.attr("data-film-slug") ?? "";
      const itemName = poster.attr("data-film-name") ?? "";

      // Some older markup uses data-item-name on the li itself
      const altName =
        itemName || $(el).attr("data-item-name") || poster.find("img").attr("alt") || "";
      const altSlug = slug || $(el).attr("data-item-slug") || "";
      const altId = filmId || $(el).attr("data-film-id") || "";

      if (!altName) return;

      // Letterboxd data-film-name is just the title; year comes from data-film-release-year
      const releaseYear = poster.attr("data-film-release-year");
      let title: string;
      let year: number | null;

      if (releaseYear) {
        title = altName.trim();
        year = parseInt(releaseYear, 10) || null;
      } else {
        // Fallback: try parsing "Title (Year)" from the name attribute
        const parsed = parseTitleYear(altName);
        title = parsed.title;
        year = parsed.year;
      }

      if (title) {
        pageEntries.push({
          title,
          year,
          letterboxdSlug: altSlug,
          letterboxdId: altId,
        });
      }
    });

    // First page with no results: determine if private or empty
    if (page === 1 && pageEntries.length === 0) {
      const bodyText = $("body").text().toLowerCase();
      if (
        bodyText.includes("private") ||
        bodyText.includes("this watchlist is not public") ||
        bodyText.includes("content is not publicly available") ||
        $(".private-list, .private-profile").length > 0
      ) {
        throw new LetterboxdImportError(
          "private_watchlist",
          `Watchlist for "${username}" is private`,
        );
      }
      throw new LetterboxdImportError(
        "empty_watchlist",
        `Watchlist for "${username}" is empty`,
      );
    }

    entries.push(...pageEntries);

    // Check for next page link
    const nextLink = $(".paginate-nextprev a.next");
    hasNextPage = nextLink.length > 0;

    // Stop if we've hit the cap
    if (entries.length >= MAX_ENTRIES) {
      break;
    }

    page++;

    // Rate limit between page fetches
    if (hasNextPage) {
      await sleep(PAGE_DELAY_MS);
    }
  }

  // Trim to cap
  return entries.slice(0, MAX_ENTRIES);
}

// ---------------------------------------------------------------------------
// Matching + Enrichment
// ---------------------------------------------------------------------------

/**
 * Match Letterboxd entries against local film DB and enrich with screening data.
 *
 * 1. Load all films from DB into a normalized-title map
 * 2. Match each Letterboxd entry (exact normalized title + year +/-1 tolerance)
 * 3. Batch-query upcoming screenings for all matched films
 * 4. Build EnrichedFilm results with next-screening info
 */
export async function matchAndEnrich(
  entries: LetterboxdEntry[],
): Promise<{ matched: EnrichedFilm[]; unmatched: LetterboxdEntry[] }> {
  if (entries.length === 0) {
    return { matched: [], unmatched: [] };
  }

  // Step 1: Load all films (filter to actual films, not events/live broadcasts)
  const allFilms = await db
    .select({
      id: films.id,
      title: films.title,
      year: films.year,
      directors: films.directors,
      posterUrl: films.posterUrl,
    })
    .from(films)
    .where(or(eq(films.contentType, "film"), isNull(films.contentType)));

  // Step 2: Build normalized title -> films map
  const titleMap = new Map<string, typeof allFilms>();

  for (const film of allFilms) {
    const normalized = normalizeTitle(film.title);
    const existing = titleMap.get(normalized);
    if (existing) {
      existing.push(film);
    } else {
      titleMap.set(normalized, [film]);
    }
  }

  // Step 3: Match entries
  const matched: Array<{ entry: LetterboxdEntry; film: (typeof allFilms)[0] }> =
    [];
  const unmatched: LetterboxdEntry[] = [];

  for (const entry of entries) {
    const normalized = normalizeTitle(entry.title);
    const candidates = titleMap.get(normalized);

    if (!candidates || candidates.length === 0) {
      unmatched.push(entry);
      continue;
    }

    // Find best match with year tolerance
    let bestMatch: (typeof allFilms)[0] | null = null;

    if (entry.year !== null) {
      // Prefer exact year match, then +/-1
      bestMatch =
        candidates.find((f) => f.year === entry.year) ??
        candidates.find(
          (f) => f.year !== null && Math.abs(f.year - entry.year!) <= 1,
        ) ??
        null;
    }

    // If no year on the entry, or no year-matched candidate, take first candidate
    // (only if there's exactly one candidate to avoid ambiguity)
    if (!bestMatch) {
      if (candidates.length === 1) {
        bestMatch = candidates[0];
      } else if (entry.year === null) {
        // Multiple candidates and no year hint -- take the first but it's risky
        bestMatch = candidates[0];
      }
    }

    if (bestMatch) {
      matched.push({ entry, film: bestMatch });
    } else {
      unmatched.push(entry);
    }
  }

  if (matched.length === 0) {
    return { matched: [], unmatched };
  }

  // Step 4: Batch-query upcoming screenings for all matched films
  const matchedFilmIds = [...new Set(matched.map((m) => m.film.id))];

  const upcomingScreenings = await db
    .select({
      id: screenings.id,
      filmId: screenings.filmId,
      datetime: screenings.datetime,
      format: screenings.format,
      isSpecialEvent: screenings.isSpecialEvent,
      eventDescription: screenings.eventDescription,
      cinema: {
        id: cinemas.id,
        name: cinemas.name,
        shortName: cinemas.shortName,
      },
    })
    .from(screenings)
    .innerJoin(cinemas, eq(screenings.cinemaId, cinemas.id))
    .innerJoin(films, eq(screenings.filmId, films.id))
    .where(
      and(
        inArray(screenings.filmId, matchedFilmIds),
        gte(screenings.datetime, new Date()), // Drizzle helper serializes Date
        or(eq(films.contentType, "film"), isNull(films.contentType)),
      ),
    )
    .orderBy(screenings.datetime);

  // Group screenings by filmId
  const screeningsByFilm = new Map<string, typeof upcomingScreenings>();
  for (const s of upcomingScreenings) {
    const existing = screeningsByFilm.get(s.filmId);
    if (existing) {
      existing.push(s);
    } else {
      screeningsByFilm.set(s.filmId, [s]);
    }
  }

  // Step 5: Build enriched results (deduplicate by filmId)
  const seenFilmIds = new Set<string>();
  const enrichedFilms: EnrichedFilm[] = [];

  for (const { film } of matched) {
    if (seenFilmIds.has(film.id)) continue;
    seenFilmIds.add(film.id);

    const filmScreenings = screeningsByFilm.get(film.id) ?? [];
    const count = filmScreenings.length;
    const next = filmScreenings[0] ?? null; // Already sorted by datetime

    enrichedFilms.push({
      filmId: film.id,
      title: film.title,
      year: film.year,
      posterUrl: film.posterUrl,
      directors: film.directors,
      screenings: {
        count,
        next: next
          ? {
              datetime: next.datetime.toISOString(),
              cinemaName: next.cinema.shortName ?? next.cinema.name,
              format: next.format,
              isSpecialEvent: next.isSpecialEvent,
              eventDescription: next.eventDescription,
            }
          : null,
        isLastChance: count > 0 && count <= 2,
      },
    });
  }

  return { matched: enrichedFilms, unmatched };
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const cache = new Map<
  string,
  { results: ImportResults; expiresAt: number }
>();

/**
 * Get (or create and cache) import results for a Letterboxd username.
 *
 * Results are cached in-memory for 1 hour, keyed by lowercased username.
 *
 * @throws {LetterboxdImportError} on scraping failures
 */
export async function getOrCreateImportResults(
  username: string,
): Promise<ImportResults> {
  const key = username.toLowerCase();
  const now = Date.now();

  // Check cache
  const cached = cache.get(key);
  if (cached) {
    if (cached.expiresAt > now) {
      return cached.results;
    }
    cache.delete(key); // Evict expired entry
  }

  // Scrape watchlist
  const entries = await scrapeLetterboxdWatchlist(username);
  const capped = entries.length >= MAX_ENTRIES;

  // Match and enrich
  const { matched, unmatched } = await matchAndEnrich(entries);

  const results: ImportResults = {
    matched,
    unmatched,
    total: entries.length,
    username,
    capped,
  };

  // Evict oldest entry if cache is full
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }

  // Cache results
  cache.set(key, {
    results,
    expiresAt: now + CACHE_TTL_MS,
  });

  return results;
}
