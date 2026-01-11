/**
 * Enrich films with Letterboxd ratings
 * Fetches ratings from Letterboxd pages using the film title
 */

import { db } from "./index";
import { films, screenings } from "./schema";
import { eq, isNull, isNotNull, gte, and } from "drizzle-orm";
import * as cheerio from "cheerio";

// Convert title to Letterboxd URL slug
function titleToSlug(title: string, year?: number | null): string {
  // Letterboxd uses lowercase, hyphenated slugs
  // Remove special characters, replace spaces with hyphens
  let slug = title
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
  const url = `https://letterboxd.com/film/${slug}/`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "text/html",
      },
    });

    if (!response.ok) {
      // Try with year suffix for disambiguation
      if (year) {
        const urlWithYear = `https://letterboxd.com/film/${slug}-${year}/`;
        const retryResponse = await fetch(urlWithYear, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            Accept: "text/html",
          },
        });

        if (!retryResponse.ok) {
          return null;
        }

        const html = await retryResponse.text();
        return parseRating(html, urlWithYear);
      }
      return null;
    }

    const html = await response.text();
    return parseRating(html, url);
  } catch (error) {
    return null;
  }
}

function parseRating(
  html: string,
  url: string
): { rating: number; url: string } | null {
  const $ = cheerio.load(html);

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
      .where(isNull(films.letterboxdRating));

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

  for (const film of filmsToEnrich) {
    try {
      process.stdout.write(`Processing: ${film.title} (${film.year || "?"})... `);

      const result = await fetchLetterboxdRating(film.title, film.year);

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

  return { enriched, failed, total: filmsToEnrich.length };
}

// Run if called directly
enrichLetterboxdRatings()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
