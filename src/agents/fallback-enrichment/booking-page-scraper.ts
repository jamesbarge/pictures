/**
 * Booking Page Scraper
 *
 * Extracts metadata (OG images, meta descriptions, structured data)
 * from cinema booking pages as a supplementary data source.
 */

import * as cheerio from "cheerio";

export interface BookingPageData {
  ogImage: string | null;
  ogDescription: string | null;
  ogTitle: string | null;
  metaDescription: string | null;
  structuredData: Record<string, unknown> | null;
}

/**
 * Scrape metadata from a cinema booking page
 * Uses OG tags and meta tags as fallback data source
 */
export async function scrapeBookingPage(
  bookingUrl: string
): Promise<BookingPageData | null> {
  try {
    const response = await fetch(bookingUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract OG tags
    const ogImage =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="og:image"]').attr("content") ||
      null;

    const ogDescription =
      $('meta[property="og:description"]').attr("content") ||
      $('meta[name="og:description"]').attr("content") ||
      null;

    const ogTitle =
      $('meta[property="og:title"]').attr("content") ||
      $('meta[name="og:title"]').attr("content") ||
      null;

    const metaDescription =
      $('meta[name="description"]').attr("content") || null;

    // Extract JSON-LD structured data
    let structuredData: Record<string, unknown> | null = null;
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const text = $(el).text();
        const parsed = JSON.parse(text);
        // Look for Movie or Event schema
        if (
          parsed["@type"] === "Movie" ||
          parsed["@type"] === "Event" ||
          parsed["@type"] === "ScreeningEvent"
        ) {
          structuredData = parsed;
        }
      } catch {
        // Ignore malformed JSON-LD
      }
    });

    return {
      ogImage,
      ogDescription,
      ogTitle,
      metaDescription,
      structuredData,
    };
  } catch {
    return null;
  }
}

/**
 * Extract useful film data from booking page metadata
 */
export function extractFilmDataFromBookingPage(
  data: BookingPageData
): {
  posterUrl?: string;
  synopsis?: string;
  title?: string;
} {
  const result: { posterUrl?: string; synopsis?: string; title?: string } = {};

  // Use OG image as poster fallback
  if (data.ogImage && isValidImageUrl(data.ogImage)) {
    result.posterUrl = data.ogImage;
  }

  // Use OG description or meta description as synopsis fallback
  const description = data.ogDescription || data.metaDescription;
  if (description && description.length > 30) {
    result.synopsis = description;
  }

  // Use OG title (sometimes cleaner than scraped title)
  if (data.ogTitle) {
    result.title = data.ogTitle;
  }

  // Extract from structured data if available
  if (data.structuredData) {
    const sd = data.structuredData;
    if (sd.image && typeof sd.image === "string" && !result.posterUrl) {
      result.posterUrl = sd.image;
    }
    if (sd.description && typeof sd.description === "string" && !result.synopsis) {
      result.synopsis = sd.description as string;
    }
  }

  return result;
}

function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
