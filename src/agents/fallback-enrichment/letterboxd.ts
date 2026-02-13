/**
 * Letterboxd Rating Discovery
 *
 * Fetches Letterboxd ratings for films when the standard title-to-slug
 * conversion fails (common for foreign films, obscure titles).
 *
 * Reuses the same parsing logic as src/db/enrich-letterboxd.ts but
 * is called inline by the fallback enrichment agent.
 */

import * as cheerio from "cheerio";

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
 * Fetch Letterboxd rating for a film
 *
 * Tries year-suffixed URL first (more specific), then plain URL.
 * Verifies page year matches expected year to avoid wrong matches.
 */
export async function fetchLetterboxdRating(
  title: string,
  year?: number | null
): Promise<{ rating: number; url: string } | null> {
  const slug = titleToSlug(title);
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    Accept: "text/html",
  };

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
        const result = parseRating(html, urlWithYear, year);
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
    return parseRating(html, url, year);
  } catch {
    return null;
  }
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
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    Accept: "text/html",
  };

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

/**
 * Parse Letterboxd rating from page HTML with year verification
 */
function parseRating(
  html: string,
  url: string,
  expectedYear?: number | null
): { rating: number; url: string } | null {
  const $ = cheerio.load(html);

  // Verify year from OG title: "Film Title (2024)"
  const ogTitle = $('meta[property="og:title"]').attr("content") || "";
  const yearMatch = ogTitle.match(/\((\d{4})\)$/);
  const pageYear = yearMatch ? parseInt(yearMatch[1], 10) : null;

  // Reject if year mismatch (1-year tolerance)
  if (expectedYear && pageYear && Math.abs(pageYear - expectedYear) > 1) {
    return null;
  }

  // Rating from meta tag: "4.53 out of 5"
  const ratingMeta = $('meta[name="twitter:data2"]').attr("content");
  if (!ratingMeta) return null;

  const match = ratingMeta.match(/^([\d.]+)\s+out\s+of\s+5$/);
  if (!match) return null;

  const rating = parseFloat(match[1]);
  if (isNaN(rating) || rating < 0 || rating > 5) return null;

  return { rating, url };
}
