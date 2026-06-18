/**
 * Enrich films with Letterboxd ratings
 * Fetches ratings from Letterboxd pages using the film title
 */

import { db } from "./index";
import { films, screenings } from "./schema";
import { eq, isNull, gte, and } from "drizzle-orm";
import * as cheerio from "cheerio";
import { CHROME_USER_AGENT } from "@/scrapers/constants";

// Convert title to Letterboxd URL slug
export function titleToSlug(title: string): string {
  // Letterboxd uses lowercase, hyphenated slugs
  // Remove special characters, replace spaces with hyphens
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/['']/g, "") // Remove apostrophes
    .replace(/[&]/g, "and") // Replace & with and
    .replace(/[^a-z0-9\s-]/g, "") // Remove special chars
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Collapse multiple hyphens
    .replace(/^-|-$/g, ""); // Trim hyphens from ends

  // For some films, year helps disambiguate (e.g., remakes)
  // Letterboxd uses title-year format for some films
  return slug;
}

// Build title variants for noisy programming labels before Letterboxd lookup.
export function buildTitleCandidates(rawTitle: string): string[] {
  const candidates = new Set<string>();
  const trimmed = rawTitle.trim();

  if (!trimmed) return [];

  candidates.add(trimmed);

  // Example: "UK PREMIERE MACDO" -> "MACDO"
  const withoutPremierePrefix = trimmed.replace(
    /^(UK|WORLD|LONDON)\s+PREMIERE[:\s-]*/i,
    ""
  );
  if (withoutPremierePrefix && withoutPremierePrefix !== trimmed) {
    candidates.add(withoutPremierePrefix.trim());
  }

  // Example: "Amelie (Le fabuleux...)" -> "Amelie"
  const withoutParenTitle = trimmed.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (withoutParenTitle && withoutParenTitle !== trimmed) {
    candidates.add(withoutParenTitle);
  }

  // Example: "... in association with X" -> main title only
  const withoutAssociation = trimmed
    .replace(/\s+in association with\s+.+$/i, "")
    .trim();
  if (withoutAssociation && withoutAssociation !== trimmed) {
    candidates.add(withoutAssociation);
  }

  return [...candidates];
}

type FailureReason =
  | "slug_404"
  | "year_mismatch"
  | "no_rating_meta"
  | "rating_parse_error"
  | "fetch_error";

async function fetchLetterboxdRating(
  title: string,
  year?: number | null,
  knownSlug?: string | null
): Promise<{ rating: number; url: string; failureReason?: never } | { rating?: never; url?: never; failureReason: FailureReason } | null> {
  const headers = {
    "User-Agent": CHROME_USER_AGENT,
    Accept: "text/html",
  };

  try {
    // Highest trust: a stored canonical slug (Letterboxd's own id, captured
    // from watchlist imports or a previous enrichment redirect). Fetch it
    // directly and skip slug-guessing entirely. No year verification — the
    // slug identifies the film exactly, and restorations/reissues often list
    // a different year than ours.
    if (knownSlug) {
      const slugUrl = `https://letterboxd.com/film/${knownSlug}/`;
      const slugResponse = await fetch(slugUrl, { headers });
      if (!slugResponse.ok) {
        return { failureReason: "slug_404" };
      }
      const html = await slugResponse.text();
      const result = parseRatingWithVerification(
        html,
        slugResponse.url || slugUrl,
        null
      );
      if (result) return result;
      return { failureReason: "no_rating_meta" };
    }

    const slug = titleToSlug(title);

    // If we have a year, try year-suffixed URL FIRST to avoid wrong film matches
    // e.g., "Paprika (2006)" should try /film/paprika-2006/ before /film/paprika/
    if (year) {
      const urlWithYear = `https://letterboxd.com/film/${slug}-${year}/`;
      const yearResponse = await fetch(urlWithYear, { headers });

      if (yearResponse.ok) {
        const html = await yearResponse.text();
        // Use the post-redirect URL (response.url) so we persist the
        // canonical slug Letterboxd redirected us to.
        const result = parseRatingWithVerification(
          html,
          yearResponse.url || urlWithYear,
          year
        );
        if (result) return result;
      }
    }

    // Try plain URL (either no year, or year-suffixed URL failed)
    const url = `https://letterboxd.com/film/${slug}/`;
    const response = await fetch(url, { headers });

    if (!response.ok) {
      return { failureReason: "slug_404" };
    }

    const html = await response.text();
    const result = parseRatingWithVerification(html, response.url || url, year);
    if (result) return result;

    // Determine why verification failed
    const $ = cheerio.load(html);
    const ogTitle = $('meta[property="og:title"]').attr("content") || "";
    const yearMatch = ogTitle.match(/\((\d{4})\)$/);
    const pageYear = yearMatch ? parseInt(yearMatch[1], 10) : null;

    if (year && pageYear && Math.abs(pageYear - year) > 1) {
      return { failureReason: "year_mismatch" };
    }

    const ratingMeta = $('meta[name="twitter:data2"]').attr("content");
    if (!ratingMeta) {
      return { failureReason: "no_rating_meta" };
    }

    return { failureReason: "rating_parse_error" };
  } catch {
    return { failureReason: "fetch_error" };
  }
}

/**
 * Parse rating and verify year matches expected year
 * Letterboxd URLs can match wrong films with same title but different year
 */
export function parseRatingWithVerification(
  html: string,
  url: string,
  expectedYear?: number | null
): { rating: number; url: string } | null {
  const $ = cheerio.load(html);

  // Extract year from page to verify we have the right film
  // Year is in: <meta property="og:title" content="Paprika (2006)">
  // Or in: <small class="number"><a href="/films/year/2006/">2006</a></small>
  const ogTitle = $('meta[property="og:title"]').attr("content") || "";
  const yearMatch = ogTitle.match(/\((\d{4})\)$/);
  const pageYear = yearMatch ? parseInt(yearMatch[1], 10) : null;

  // If we expect a year and the page year doesn't match (within 1 year tolerance), reject
  if (expectedYear && pageYear && Math.abs(pageYear - expectedYear) > 1) {
    return null;
  }

  // Rating is in meta tag: <meta name="twitter:data2" content="4.53 out of 5">
  const ratingMeta = $('meta[name="twitter:data2"]').attr("content");

  if (!ratingMeta) {
    return null;
  }

  // Parse both "4.53 out of 5" and "4.53 out of 5 stars" formats.
  const match = ratingMeta.match(/^([\d.]+)\s+out\s+of\s+5(?:\s+stars)?$/);
  if (!match) {
    return null;
  }

  const rating = parseFloat(match[1]);
  if (isNaN(rating) || rating < 0 || rating > 5) {
    return null;
  }

  return { rating, url };
}

// Check if a title looks like an event rather than a film
export function isLikelyEvent(title: string): boolean {
  const eventKeywords = [
    'q&a', 'preview', 'quiz', 'workshop', 'marathon',
    'ceremony', 'screening', 'party', 'tasting',
    'conversation', 'discussion', 'intro', 'talk', 'forum',
    'live broadcast', 'season', 'trilogy', 'series'
  ];

  const lowerTitle = title.toLowerCase();
  return eventKeywords.some(keyword => lowerTitle.includes(keyword));
}

// Extract clean film title from event-style titles like "BFI Classics: Vertigo"
function extractFilmTitle(rawTitle: string): string | null {
  const patterns = [
    /^[^:]+:\s*(.+)$/,                                    // "Series: Film Title"
    /^(.+?)\s*\+\s*(q&a|intro|discussion|preview)/i,      // "Film + Q&A"
    /^(.+?)\s*-\s*/,                                       // "Film - extra info"
  ];

  for (const pattern of patterns) {
    const match = rawTitle.match(pattern);
    if (match) {
      let cleaned = match[1].trim();
      cleaned = cleaned.replace(/\s*\(\d{4}\)\s*$/, ''); // Remove trailing year
      return cleaned;
    }
  }

  return null;
}

export interface EnrichmentResult {
  enriched: number;
  failed: number;
  /** Films skipped because they have no TMDB anchor (never guess slugs for these) */
  skipped: number;
  total: number;
}

/**
 * Enrich films with Letterboxd ratings
 * @param limit - Optional limit on number of films to process (for scheduled jobs)
 * @param onlyWithScreenings - If true, only enrich films with upcoming screenings
 */
export async function enrichLetterboxdRatings(
  limit?: number,
  onlyWithScreenings = false
): Promise<EnrichmentResult> {
  console.log("🎬 Enriching films with Letterboxd ratings...\n");

  const now = new Date();

  // FIRST: Get films with upcoming screenings that need ratings (highest priority)
  const filmsWithScreenings = await db
    .selectDistinct({
      id: films.id,
      title: films.title,
      year: films.year,
      tmdbId: films.tmdbId,
      letterboxdSlug: films.letterboxdSlug,
    })
    .from(films)
    .innerJoin(screenings, eq(films.id, screenings.filmId))
    .where(
      and(
        isNull(films.letterboxdRating),
        eq(films.contentType, "film"),
        gte(screenings.datetime, now)
      )
    );

  console.log(
    `Found ${filmsWithScreenings.length} films with upcoming screenings needing ratings\n`
  );

  let filmsToEnrich = filmsWithScreenings;

  // If not limiting to screenings only, also get other films
  if (!onlyWithScreenings) {
    const otherFilms = await db
      .select({
        id: films.id,
        title: films.title,
        year: films.year,
        tmdbId: films.tmdbId,
        letterboxdSlug: films.letterboxdSlug,
      })
      .from(films)
      .where(and(isNull(films.letterboxdRating), eq(films.contentType, "film")));

    // Combine with priority films first, deduplicate
    const priorityIds = new Set(filmsWithScreenings.map((f) => f.id));
    const remainingFilms = otherFilms.filter((f) => !priorityIds.has(f.id));
    filmsToEnrich = [...filmsWithScreenings, ...remainingFilms];
  }

  // Apply limit if specified
  if (limit && limit > 0) {
    filmsToEnrich = filmsToEnrich.slice(0, limit);
  }

  console.log(
    `Processing ${filmsToEnrich.length} films${limit ? ` (limited to ${limit})` : ""}\n`
  );

  let enriched = 0;
  let failed = 0;
  let skipped = 0;
  const failureBreakdown: Record<string, number> = {
    event_filtered: 0,
    no_tmdb_anchor: 0,
    slug_404: 0,
    year_mismatch: 0,
    no_rating_meta: 0,
    rating_parse_error: 0,
    fetch_error: 0,
    unknown: 0,
  };

  // Filter out likely events before processing
  const filteredFilms = filmsToEnrich.filter(f => !isLikelyEvent(f.title));
  const skippedEvents = filmsToEnrich.length - filteredFilms.length;
  failureBreakdown.event_filtered = skippedEvents;
  if (skippedEvents > 0) {
    console.log(`Skipped ${skippedEvents} likely events\n`);
  }

  for (const film of filteredFilms) {
    try {
      process.stdout.write(`Processing: ${film.title} (${film.year || "?"})... `);

      // Never guess a Letterboxd slug for a film without a TMDB anchor.
      // For event-titled rows the guess is garbage ("Doctors Under Attack…"
      // → /film/gaza/). A missing link is correct; a wrong link is a bug.
      if (!film.tmdbId) {
        failureBreakdown.no_tmdb_anchor++;
        console.log("⊘ skipped (no TMDB anchor)");
        skipped++;
        continue;
      }

      let result = await fetchLetterboxdRating(
        film.title,
        film.year,
        film.letterboxdSlug
      );

      // If not found, try extracting a clean film title — but only when we
      // had no stored canonical slug (the slug path skips guessing entirely).
      if (!result || ("failureReason" in result && result.failureReason)) {
        const firstFailure = result && "failureReason" in result ? result.failureReason : null;
        const cleanTitle = film.letterboxdSlug ? null : extractFilmTitle(film.title);
        if (cleanTitle && cleanTitle !== film.title) {
          result = await fetchLetterboxdRating(cleanTitle, film.year);
        }
        // If still failed, record the failure reason from the first attempt
        if (!result || ("failureReason" in result && result.failureReason)) {
          const reason = (result && "failureReason" in result ? result.failureReason : firstFailure) || "unknown";
          failureBreakdown[reason] = (failureBreakdown[reason] || 0) + 1;
          console.log(`✗ ${reason}`);
          failed++;
          // Rate limiting
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }
      }

      if (!result || !("rating" in result) || !result.rating) {
        failureBreakdown.unknown++;
        console.log("✗ unknown");
        failed++;
        continue;
      }

      // Update the film, persisting Letterboxd's canonical slug from the
      // final (post-redirect) URL so future enrichment never has to guess.
      // A slug already stored from a watchlist import (Letterboxd's own
      // data-film-slug) is higher-trust than a redirect — never downgrade it.
      const slugMatch = result.url.match(/letterboxd\.com\/film\/([^/]+)\//);
      await db
        .update(films)
        .set({
          letterboxdRating: result.rating,
          letterboxdUrl: result.url,
          letterboxdSlug: film.letterboxdSlug ?? slugMatch?.[1] ?? null,
          letterboxdEnrichedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(films.id, film.id));

      console.log(`✓ ${result.rating.toFixed(2)}/5`);
      enriched++;

      // Rate limiting - be nice to Letterboxd
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.log(`✗ Error: ${error}`);
      failureBreakdown.unknown++;
      failed++;
    }
  }

  console.log("\n📊 Summary:");
  console.log(`  ✓ Enriched: ${enriched}`);
  console.log(`  ✗ Failed: ${failed}`);
  console.log(`  ⊘ Skipped (no TMDB anchor): ${skipped}`);
  console.log("\n📋 Failure breakdown:");
  for (const [reason, count] of Object.entries(failureBreakdown)) {
    if (count > 0) {
      console.log(`  ${reason}: ${count}`);
    }
  }

  return { enriched, failed, skipped, total: filteredFilms.length };
}

// Run if called directly (not when imported as a module)
const isDirectRun =
  process.argv[1]?.endsWith("enrich-letterboxd.ts") ||
  process.argv[1]?.endsWith("enrich-letterboxd.js");

if (isDirectRun) {
  enrichLetterboxdRatings()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}
