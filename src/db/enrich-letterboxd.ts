/**
 * Enrich films with Letterboxd ratings
 * Fetches ratings from Letterboxd pages using the film title
 */

import { db } from "./index";
import { films, screenings } from "./schema";
import { eq, isNull, gte, and } from "drizzle-orm";
import * as cheerio from "cheerio";

// Convert title to Letterboxd URL slug
function titleToSlug(title: string, year?: number | null): string {
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

async function fetchLetterboxdRating(
  title: string,
  year?: number | null
): Promise<{ rating: number; url: string } | null> {
  const slug = titleToSlug(title, year);
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    Accept: "text/html",
  };

  try {
    // If we have a year, try year-suffixed URL FIRST to avoid wrong film matches
    // e.g., "Paprika (2006)" should try /film/paprika-2006/ before /film/paprika/
    if (year) {
      const urlWithYear = `https://letterboxd.com/film/${slug}-${year}/`;
      const yearResponse = await fetch(urlWithYear, { headers });

      if (yearResponse.ok) {
        const html = await yearResponse.text();
        const result = parseRatingWithVerification(html, urlWithYear, year);
        if (result) return result;
      }
    }

    // Try plain URL (either no year, or year-suffixed URL failed)
    const url = `https://letterboxd.com/film/${slug}/`;
    const response = await fetch(url, { headers });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    return parseRatingWithVerification(html, url, year);
  } catch (error) {
    return null;
  }
}

/**
 * Parse rating and verify year matches expected year
 * Letterboxd URLs can match wrong films with same title but different year
 */
function parseRatingWithVerification(
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

  // Parse "4.53 out of 5" format
  const match = ratingMeta.match(/^([\d.]+)\s+out\s+of\s+5$/);
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
function isLikelyEvent(title: string): boolean {
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

  // Filter out likely events before processing
  const filteredFilms = filmsToEnrich.filter(f => !isLikelyEvent(f.title));
  const skippedEvents = filmsToEnrich.length - filteredFilms.length;
  if (skippedEvents > 0) {
    console.log(`Skipped ${skippedEvents} likely events\n`);
  }

  for (const film of filteredFilms) {
    try {
      process.stdout.write(`Processing: ${film.title} (${film.year || "?"})... `);

      let result = await fetchLetterboxdRating(film.title, film.year);

      // If not found, try extracting a clean film title
      if (!result) {
        const cleanTitle = extractFilmTitle(film.title);
        if (cleanTitle && cleanTitle !== film.title) {
          result = await fetchLetterboxdRating(cleanTitle, film.year);
        }
      }

      if (!result) {
        console.log("✗ Not found");
        failed++;
        continue;
      }

      // Update the film
      await db
        .update(films)
        .set({
          letterboxdRating: result.rating,
          letterboxdUrl: result.url,
          updatedAt: new Date(),
        })
        .where(eq(films.id, film.id));

      console.log(`✓ ${result.rating.toFixed(2)}/5`);
      enriched++;

      // Rate limiting - be nice to Letterboxd
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.log(`✗ Error: ${error}`);
      failed++;
    }
  }

  console.log("\n📊 Summary:");
  console.log(`  ✓ Enriched: ${enriched}`);
  console.log(`  ✗ Not found: ${failed}`);

  return { enriched, failed, total: filteredFilms.length };
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
