/**
 * Letterboxd Poster Discovery
 *
 * Fetches Letterboxd OG posters for films via title-to-slug conversion.
 * Used by poster scripts (src/scripts/poster-audit-and-fix.ts).
 *
 * NOTE: Rating/URL discovery was removed (plan 007): the fallback agent only
 * processes films with tmdb_id IS NULL, and films without a TMDB anchor must
 * never be assigned a guessed Letterboxd URL — a missing link is correct;
 * a wrong link is a bug.
 */

import * as cheerio from "cheerio";

import { CHROME_USER_AGENT } from "@/scrapers/constants";

/**
 * Convert a film title to Letterboxd URL slug
 */
function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/['']/g, "") // Remove apostrophes
    .replace(/[&]/g, "and") // Replace & with and
    .replace(/[^a-z0-9\s-]/g, "") // Remove special chars
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Collapse multiple hyphens
    .replace(/^-|-$/g, ""); // Trim hyphens
}

/**
 * Fetch Letterboxd poster (OG image) for a film
 *
 * Uses the same slug/year strategy as fetchLetterboxdRating.
 * Validates the URL is a real poster (contains ltrbxd.com CDN) and not a placeholder.
 */
export async function fetchLetterboxdPoster(
  title: string,
  year?: number | null
): Promise<{ posterUrl: string; url: string } | null> {
  const slug = titleToSlug(title);
  const headers = { "User-Agent": CHROME_USER_AGENT, Accept: "text/html" };

  try {
    // Try year-suffixed URL first for disambiguation
    if (year) {
      const urlWithYear = `https://letterboxd.com/film/${slug}-${year}/`;
      const yearResponse = await fetch(urlWithYear, {
        headers,
        signal: AbortSignal.timeout(8000),
      });

      if (yearResponse.ok) {
        const html = await yearResponse.text();
        const result = parsePoster(html, urlWithYear, year);
        if (result) return result;
      }
    }

    // Try plain URL
    const url = `https://letterboxd.com/film/${slug}/`;
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return null;

    const html = await response.text();
    return parsePoster(html, url, year);
  } catch {
    return null;
  }
}

/**
 * Parse Letterboxd poster URL from page HTML with year verification
 */
function parsePoster(
  html: string,
  url: string,
  expectedYear?: number | null
): { posterUrl: string; url: string } | null {
  const $ = cheerio.load(html);

  // Verify year from OG title: "Film Title (2024)"
  const ogTitle = $('meta[property="og:title"]').attr("content") || "";
  const yearMatch = ogTitle.match(/\((\d{4})\)$/);
  const pageYear = yearMatch ? parseInt(yearMatch[1], 10) : null;

  // Reject if year mismatch (1-year tolerance)
  if (expectedYear && pageYear && Math.abs(pageYear - expectedYear) > 1) {
    return null;
  }

  // Extract OG image
  const ogImage = $('meta[property="og:image"]').attr("content");
  if (!ogImage) return null;

  // Validate it's a real Letterboxd poster (hosted on their CDN)
  // Real posters: https://a.ltrbxd.com/resized/...
  // Reject empty/placeholder images
  if (!ogImage.includes("ltrbxd.com")) return null;

  // Reject known placeholder patterns
  if (ogImage.includes("empty-poster") || ogImage.includes("placeholder")) {
    return null;
  }

  return { posterUrl: ogImage, url };
}
