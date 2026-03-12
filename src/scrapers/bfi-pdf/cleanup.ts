/**
 * BFI Ghost Screening Cleanup
 *
 * Cross-references our DB against the live BFI A-Z programme page
 * and removes ghost entries — films/screenings that no longer exist
 * in BFI's programming.
 *
 * Safety guardrails:
 * - Zero-title abort: if BFI A-Z returns 0 titles (Cloudflare blocked), skip entirely
 * - 50% threshold: if >50% of DB films are unmatched, skip (bad scrape detection)
 * - Future-only: only deletes screenings with datetime >= now
 * - Orphan check: only deletes films with 0 remaining screenings at ANY cinema
 */

import * as cheerio from "cheerio";
import { db } from "@/db";
import { films } from "@/db/schema/films";
import { screenings } from "@/db/schema/screenings";
import { eq, gte, inArray, and, sql } from "drizzle-orm";
import { fetchWithRetry } from "../utils/fetch-with-retry";

const BFI_CINEMA_IDS = ["bfi-southbank", "bfi-imax"];

const BFI_AZ_URLS = [
  "https://whatson.bfi.org.uk/Online/article/filmsindex",
  "https://whatson.bfi.org.uk/imax/Online/article/filmsindex",
];

// ─── Types ───────────────────────────────────────────────────────────

export interface BFICleanupResult {
  status: "success" | "skipped" | "error";
  reason?: string;
  bfiProgrammeCount: number;
  dbFilmCount: number;
  matched: number;
  ghostScreeningsDeleted: number;
  orphanFilmsDeleted: number;
  ghostTitles: string[];
  errors: string[];
  durationMs: number;
}

interface CleanupOptions {
  triggeredBy?: string;
  dryRun?: boolean;
}

interface DBFilm {
  filmId: string;
  title: string;
  screeningCount: number;
}

// ─── Proxy Fetch ─────────────────────────────────────────────────────

async function proxyFetch(url: string): Promise<Response> {
  const scraperApiKey = process.env.SCRAPER_API_KEY;

  if (scraperApiKey) {
    const trimmedKey = scraperApiKey.trim();
    const proxyUrl = new URL("https://api.scraperapi.com/");
    proxyUrl.searchParams.set("api_key", trimmedKey);
    proxyUrl.searchParams.set("url", url);

    console.log(`[BFI-Cleanup] Using ScraperAPI proxy for: ${url.slice(0, 60)}...`);
    return fetchWithRetry(proxyUrl.toString(), undefined, "[BFI-Cleanup] ScraperAPI proxy");
  }

  return fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
    },
  });
}

// ─── BFI A-Z Fetching ────────────────────────────────────────────────

/**
 * Fetches both BFI A-Z programme pages and returns a merged, deduplicated
 * array of programme titles.
 */
async function fetchBFIProgrammeTitles(): Promise<string[]> {
  const allTitles: Set<string> = new Set();

  for (const url of BFI_AZ_URLS) {
    try {
      console.log(`[BFI-Cleanup] Fetching: ${url}`);
      const response = await proxyFetch(url);

      if (!response.ok) {
        console.warn(`[BFI-Cleanup] ${url} returned ${response.status}, skipping`);
        continue;
      }

      const html = await response.text();

      // Check for Cloudflare challenge
      const isActualChallenge =
        (html.includes("Checking your browser") && html.includes("before accessing")) ||
        (html.includes("Just a moment") && html.includes("Enable JavaScript")) ||
        (!html.includes("<title>") && html.includes("challenge-platform"));

      if (isActualChallenge) {
        console.warn(`[BFI-Cleanup] Cloudflare challenge detected for: ${url}`);
        continue;
      }

      const $ = cheerio.load(html);
      $('a[href^="article/"]').each((_, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 1) {
          allTitles.add(text);
        }
      });

      console.log(`[BFI-Cleanup] Found ${allTitles.size} titles so far`);
    } catch (err) {
      console.warn(`[BFI-Cleanup] Failed to fetch ${url}: ${err instanceof Error ? err.message : err}`);
    }
  }

  return Array.from(allTitles);
}

// ─── Title Normalization ─────────────────────────────────────────────

/**
 * Strip BFI prefixes, Q&A/intro suffixes, and "The " prefix for matching.
 */
function normalize(title: string): string {
  let normalized = title.toLowerCase();

  // Remove common BFI prefixes
  normalized = normalized.replace(
    /^(relaxed screening:\s*|tv preview:\s*|preview:\s*|member picks:\s*|member exclusive:\s*|member salon:\s*|bfi member poll:\s*|uk premiere:\s*|uk premiere of 4k restoration:\s*|woman with a movie camera preview:\s*|funday:\s*|25 and under:\s*|\d+(?:st|nd|rd|th) anniversary(?:\s+screening)?:\s*|the war trilogy:\s*|the solidarity trilogy:\s*|season introduction talk \+ world premiere:\s*|opening night:\s*|closing night:\s*|family funday preview:\s*|library event:\s*|ghibliotheque presents:\s*|kinoteka gala screening:\s*|milktea presents – uk premiere:\s*|galentine's day:\s*|reece shearsmith presents:\s*|tribute to claudia cardinale:\s*|seniors' (?:free |paid )?matinee:\s*)/,
    ""
  );

  // Remove "+ intro/Q&A/discussion..." suffixes
  normalized = normalized.replace(/\s*\+\s*(intro|q&a|extended intro|pre-recorded intro|discussion|in conversation).*$/i, "");

  // Remove parenthetical suffixes like (4k Restoration), (Director's Cut), (IMAX)
  normalized = normalized.replace(/\s*\([^)]*\)\s*$/, "");

  // Remove "The " prefix for matching
  normalized = normalized.replace(/^the\s+/, "");

  // Collapse whitespace and trim
  normalized = normalized.replace(/\s+/g, " ").trim();

  // Normalize special characters
  normalized = normalized.replace(/['']/g, "'");
  normalized = normalized.replace(/[""]/g, '"');
  normalized = normalized.replace(/–/g, "-");
  normalized = normalized.replace(/â/g, "a");

  return normalized;
}

/**
 * Deep normalization for comparison — handles encoding differences,
 * accented chars, special symbols.
 */
function deepNormalize(s: string): string {
  return s
    .replace(/[''ʼ]/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[āâàáä]/g, "a")
    .replace(/[éèêë]/g, "e")
    .replace(/[íìîï]/g, "i")
    .replace(/[óòôö]/g, "o")
    .replace(/[úùûü]/g, "u")
    .replace(/½/g, " 1/2")
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Two-pass matching: exact after deep normalization, then substring with
 * minimum length and ratio constraints.
 */
function findMatch(dbTitle: string, bfiTitles: string[]): string | null {
  const normalizedDb = deepNormalize(normalize(dbTitle));
  const MIN_MATCH_LEN = 8;

  // Pass 1: exact match after normalization
  for (const bfiTitle of bfiTitles) {
    const normalizedBfi = deepNormalize(normalize(bfiTitle));
    if (normalizedDb === normalizedBfi) return bfiTitle;
  }

  // Pass 2: substring matching with length constraints
  for (const bfiTitle of bfiTitles) {
    const normalizedBfi = deepNormalize(normalize(bfiTitle));
    const shorter = normalizedDb.length <= normalizedBfi.length ? normalizedDb : normalizedBfi;
    const longer = normalizedDb.length <= normalizedBfi.length ? normalizedBfi : normalizedDb;

    if (shorter.length >= MIN_MATCH_LEN && longer.includes(shorter)) {
      if (shorter.length / longer.length >= 0.6) {
        return bfiTitle;
      }
    }
  }

  return null;
}

// ─── DB Queries ──────────────────────────────────────────────────────

async function getUpcomingBFIFilms(): Promise<DBFilm[]> {
  const now = new Date();
  const rows = await db
    .select({
      filmId: films.id,
      title: films.title,
      screeningCount: sql<number>`count(*)::int`,
    })
    .from(screenings)
    .innerJoin(films, eq(screenings.filmId, films.id))
    .where(
      and(
        inArray(screenings.cinemaId, BFI_CINEMA_IDS),
        gte(screenings.datetime, now)
      )
    )
    .groupBy(films.id, films.title)
    .orderBy(films.title);

  return rows;
}

// ─── Main Cleanup ────────────────────────────────────────────────────

export async function runBFICleanup(options?: CleanupOptions): Promise<BFICleanupResult> {
  const start = Date.now();
  const errors: string[] = [];
  const dryRun = options?.dryRun ?? false;

  console.log(`[BFI-Cleanup] Starting${dryRun ? " (DRY RUN)" : ""}... triggered by: ${options?.triggeredBy ?? "manual"}`);

  try {
    // 1. Fetch BFI A-Z titles
    const bfiTitles = await fetchBFIProgrammeTitles();
    console.log(`[BFI-Cleanup] BFI programme: ${bfiTitles.length} titles`);

    if (bfiTitles.length === 0) {
      return {
        status: "skipped",
        reason: "BFI A-Z returned 0 titles (Cloudflare blocked or site down)",
        bfiProgrammeCount: 0,
        dbFilmCount: 0,
        matched: 0,
        ghostScreeningsDeleted: 0,
        orphanFilmsDeleted: 0,
        ghostTitles: [],
        errors,
        durationMs: Date.now() - start,
      };
    }

    // 2. Query upcoming BFI films from our DB
    const dbFilms = await getUpcomingBFIFilms();
    console.log(`[BFI-Cleanup] DB: ${dbFilms.length} films with upcoming BFI screenings`);

    // 3. Cross-reference
    const matched: DBFilm[] = [];
    const ghosts: DBFilm[] = [];

    for (const film of dbFilms) {
      const match = findMatch(film.title, bfiTitles);
      if (match) {
        matched.push(film);
      } else {
        ghosts.push(film);
      }
    }

    console.log(`[BFI-Cleanup] Matched: ${matched.length}, Ghosts: ${ghosts.length}`);

    // 4. Safety: abort if >50% unmatched
    if (dbFilms.length > 0 && ghosts.length / dbFilms.length > 0.5) {
      return {
        status: "skipped",
        reason: `Safety abort: ${ghosts.length}/${dbFilms.length} films unmatched (>${Math.round((ghosts.length / dbFilms.length) * 100)}%). Likely bad scrape.`,
        bfiProgrammeCount: bfiTitles.length,
        dbFilmCount: dbFilms.length,
        matched: matched.length,
        ghostScreeningsDeleted: 0,
        orphanFilmsDeleted: 0,
        ghostTitles: ghosts.map((f) => f.title),
        errors,
        durationMs: Date.now() - start,
      };
    }

    if (ghosts.length === 0) {
      console.log("[BFI-Cleanup] No ghosts found. DB is clean.");
      return {
        status: "success",
        bfiProgrammeCount: bfiTitles.length,
        dbFilmCount: dbFilms.length,
        matched: matched.length,
        ghostScreeningsDeleted: 0,
        orphanFilmsDeleted: 0,
        ghostTitles: [],
        errors,
        durationMs: Date.now() - start,
      };
    }

    // 5. Delete future BFI screenings for ghost films
    const now = new Date();
    const ghostFilmIds = ghosts.map((f) => f.filmId);
    let ghostScreeningsDeleted = 0;

    if (!dryRun) {
      for (const filmId of ghostFilmIds) {
        const result = await db
          .delete(screenings)
          .where(
            and(
              eq(screenings.filmId, filmId),
              inArray(screenings.cinemaId, BFI_CINEMA_IDS),
              gte(screenings.datetime, now)
            )
          )
          .returning({ id: screenings.id });

        ghostScreeningsDeleted += result.length;
      }
    } else {
      // In dry run, count what would be deleted
      for (const film of ghosts) {
        ghostScreeningsDeleted += film.screeningCount;
      }
    }

    console.log(`[BFI-Cleanup] Deleted ${ghostScreeningsDeleted} ghost screenings`);

    // 6. Delete orphaned films (0 remaining screenings at ANY cinema)
    let orphanFilmsDeleted = 0;

    if (!dryRun) {
      for (const filmId of ghostFilmIds) {
        const remaining = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(screenings)
          .where(eq(screenings.filmId, filmId));

        if (remaining[0].count === 0) {
          await db.delete(films).where(eq(films.id, filmId));
          orphanFilmsDeleted++;
        }
      }
    }

    console.log(`[BFI-Cleanup] Deleted ${orphanFilmsDeleted} orphaned films`);

    for (const ghost of ghosts) {
      console.log(`[BFI-Cleanup]   Ghost: "${ghost.title}" (${ghost.screeningCount} screenings)`);
    }

    return {
      status: "success",
      bfiProgrammeCount: bfiTitles.length,
      dbFilmCount: dbFilms.length,
      matched: matched.length,
      ghostScreeningsDeleted,
      orphanFilmsDeleted,
      ghostTitles: ghosts.map((f) => f.title),
      errors,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[BFI-Cleanup] Error: ${message}`);
    return {
      status: "error",
      reason: message,
      bfiProgrammeCount: 0,
      dbFilmCount: 0,
      matched: 0,
      ghostScreeningsDeleted: 0,
      orphanFilmsDeleted: 0,
      ghostTitles: [],
      errors: [message],
      durationMs: Date.now() - start,
    };
  }
}
