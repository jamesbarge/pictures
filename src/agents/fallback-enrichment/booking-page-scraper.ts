/**
 * Booking Page Scraper
 *
 * Extracts metadata (OG images, meta descriptions, structured data)
 * from cinema booking pages as a supplementary data source.
 */

import * as cheerio from "cheerio";

/**
 * Validate URL is safe to fetch (blocks private IPs, localhost, internal hosts)
 */
function isUrlSafeToFetch(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Only allow http/https
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block localhost variants
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname === "::1"
    ) {
      return false;
    }

    // Block internal hostnames (no dots = likely internal)
    if (!hostname.includes(".")) {
      return false;
    }

    // Block private IP ranges
    const ipMatch = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipMatch) {
      const [, a, b] = ipMatch.map(Number);
      // 10.0.0.0/8
      if (a === 10) return false;
      // 172.16.0.0/12
      if (a === 172 && b >= 16 && b <= 31) return false;
      // 192.168.0.0/16
      if (a === 192 && b === 168) return false;
      // 127.0.0.0/8 (loopback)
      if (a === 127) return false;
      // 169.254.0.0/16 (link-local)
      if (a === 169 && b === 254) return false;
    }

    return true;
  } catch {
    return false;
  }
}

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
  // Validate URL before fetching (SSRF protection)
  if (!isUrlSafeToFetch(bookingUrl)) {
    console.warn(`Blocked unsafe URL: ${bookingUrl}`);
    return null;
  }

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
