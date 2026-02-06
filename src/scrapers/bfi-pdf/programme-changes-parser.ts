/**
 * BFI Programme Changes Parser
 *
 * Scrapes the BFI Programme Changes page for additional/modified screenings
 * not included in the monthly PDF guide.
 *
 * URL: https://whatson.bfi.org.uk/Online/default.asp?BOparam::WScontent::loadArticle::permalink=programme-changes
 *
 * Page Structure:
 * - Film titles in bold
 * - Screening info: "Thu 8 Jan 14:50 NFT4 p19"
 * - Multiple screenings: "Fri 9 Jan 11:50 NFT4 and 17:30 NFT4 (DS); Sat 10 Jan 20:30 NFT4"
 * - Notes about changes/additions
 *
 * Proxy Support:
 * Set SCRAPER_API_KEY env var to use ScraperAPI for Cloudflare bypass.
 */

import * as cheerio from "cheerio";
import type { RawScreening } from "../types";
import type { CheerioAPI, CheerioSelection } from "../utils/cheerio-types";

/**
 * Attempt a fetch with retry on failure (for proxy calls that have transient errors).
 * Retries once after a 2-second delay.
 */
async function fetchWithRetry(url: string, options?: RequestInit, label = "proxy"): Promise<Response> {
  try {
    const response = await fetch(url, options);
    if (response.ok || response.status < 500) return response;
    // Server error — worth retrying
    console.log(`[BFI-Changes] ${label} returned ${response.status}, retrying in 2s...`);
  } catch (error) {
    console.log(`[BFI-Changes] ${label} failed: ${error instanceof Error ? error.message : error}, retrying in 2s...`);
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return fetch(url, options);
}

/**
 * Fetches a URL, optionally through a proxy service.
 */
async function proxyFetch(url: string): Promise<Response> {
  const scraperApiKey = process.env.SCRAPER_API_KEY;

  if (scraperApiKey) {
    // Use ScraperAPI to bypass Cloudflare
    // Note: render=true was causing timeouts (~12s per request). Without it, requests take ~1s
    // and still bypass Cloudflare protection successfully.
    const trimmedKey = scraperApiKey.trim();
    const proxyUrl = new URL("https://api.scraperapi.com/");
    proxyUrl.searchParams.set("api_key", trimmedKey);
    proxyUrl.searchParams.set("url", url);

    console.log(`[BFI-Changes] Using ScraperAPI proxy for: ${url.slice(0, 60)}...`);
    return fetchWithRetry(proxyUrl.toString(), undefined, "ScraperAPI changes proxy");
  }

  return fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-GB,en;q=0.9",
    },
  });
}

const PROGRAMME_CHANGES_URL = "https://whatson.bfi.org.uk/Online/default.asp?BOparam::WScontent::loadArticle::permalink=programme-changes";

// Venue mapping
const VENUE_MAP: Record<string, string> = {
  "NFT1": "bfi-southbank",
  "NFT2": "bfi-southbank",
  "NFT3": "bfi-southbank",
  "NFT4": "bfi-southbank",
  "STUDIO": "bfi-southbank",
  "BFI IMAX": "bfi-imax",
  "IMAX": "bfi-imax",
};

// Month name to number mapping
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  january: 0, february: 1, march: 2, april: 3,
  june: 5, july: 6, august: 7, september: 8,
  october: 9, november: 10, december: 11,
};

export interface ProgrammeChange {
  filmTitle: string;
  changeType: "addition" | "modification" | "cancellation" | "venue_change" | "certificate" | "other";
  note: string;
  screenings: ParsedChangeScreening[];
  /** Full metadata for new additions */
  metadata?: {
    year?: number;
    director?: string;
    cast?: string[];
    runtime?: number;
    format?: string;
    countries?: string[];
    description?: string;
  };
}

export interface ParsedChangeScreening {
  datetime: Date;
  venue: string;
  cinemaId: string;
  accessibilityFlags: string[];
  /** Page reference in the printed guide */
  pageRef?: string;
}

export interface ProgrammeChangesResult {
  changes: ProgrammeChange[];
  screenings: RawScreening[];
  lastUpdated: string | null;
  parseErrors: string[];
}

/**
 * Fetches and parses the Programme Changes page.
 */
export async function fetchProgrammeChanges(): Promise<ProgrammeChangesResult> {
  console.log("[BFI-Changes] Fetching programme changes page...");

  const response = await proxyFetch(PROGRAMME_CHANGES_URL);

  if (!response.ok) {
    throw new Error(`Failed to fetch programme changes: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();

  // Check for actual Cloudflare challenge (not just script references)
  const isActualChallenge =
    (html.includes("Checking your browser") && html.includes("before accessing")) ||
    (html.includes("Just a moment") && html.includes("Enable JavaScript")) ||
    (!html.includes("<title>") && html.includes("challenge-platform"));

  if (isActualChallenge) {
    throw new Error("Programme changes page is behind Cloudflare challenge");
  }

  return parseChangesPage(html);
}

/**
 * Parse the Programme Changes HTML page
 */
export function parseChangesPage(html: string): ProgrammeChangesResult {
  const $ = cheerio.load(html);
  const changes: ProgrammeChange[] = [];
  const parseErrors: string[] = [];

  // Find the "Updated:" date
  const pageText = $("body").text();
  const updatedMatch = pageText.match(/Updated:\s*(\d{1,2}\s+\w+)/i);
  const lastUpdated = updatedMatch ? updatedMatch[1] : null;

  // Get the main content area
  const mainContent = $("main").length ? $("main") : $("body");

  // Split by bold tags or strong text to find film entries
  const boldElements = mainContent.find("b, strong");

  boldElements.each((_, el) => {
    const $el = $(el);
    const title = $el.text().trim();

    // Skip section headers and non-film items
    if (!title || title.length < 2) return;
    if (/^(January|February|March|April|May|June|July|August|September|October|November|December)/i.test(title)) return;
    if (/Programme$/i.test(title)) return;
    if (/PDF downloads/i.test(title)) return;
    if (/BFI Membership/i.test(title)) return;
    if (/^Updated:/i.test(title)) return;
    if (/Sign up/i.test(title)) return;

    // Get the following text for screening info and notes
    const parentText = $el.parent().text();
    const nextText = getFollowingText($, $el);

    // Determine change type
    let changeType: ProgrammeChange["changeType"] = "other";
    const combinedText = parentText + " " + nextText;

    if (/delighted to add|additional screening/i.test(combinedText)) {
      changeType = "addition";
    } else if (/cancelled/i.test(combinedText)) {
      changeType = "cancellation";
    } else if (/will now take place|venue change/i.test(combinedText)) {
      changeType = "venue_change";
    } else if (/certificate|given a \w+ certificate/i.test(combinedText)) {
      changeType = "certificate";
    } else if (/please note/i.test(combinedText)) {
      changeType = "modification";
    }

    // Parse screenings from the text
    const screenings = parseScreeningsFromText(nextText);

    // Extract metadata for new additions
    const metadata = changeType === "addition" ? parseMetadataFromText(nextText) : undefined;

    // Extract the note
    const note = extractNote(nextText);

    if (title && (screenings.length > 0 || changeType === "cancellation" || changeType === "certificate")) {
      changes.push({
        filmTitle: cleanTitle(title),
        changeType,
        note,
        screenings,
        metadata,
      });
    }
  });

  // Convert to RawScreenings
  const screenings = convertChangesToRawScreenings(changes);

  console.log(`[BFI-Changes] Parsed ${changes.length} changes with ${screenings.length} screenings`);

  return {
    changes,
    screenings,
    lastUpdated,
    parseErrors,
  };
}

/**
 * Get text following a bold element
 */
function getFollowingText($: CheerioAPI, $el: CheerioSelection): string {
  const parts: string[] = [];

  // Get text from same parent
  const parentText = $el.parent().text();
  parts.push(parentText);

  // Get next siblings' text
  let $next = $el.parent().next();
  let count = 0;
  while ($next.length && count < 10) {
    const text = $next.text().trim();
    if (text) {
      // Stop if we hit another film title (bold text at start)
      if ($next.find("b, strong").length && $next.find("b, strong").first().text().trim() === $next.text().trim()) {
        break;
      }
      parts.push(text);
    }
    $next = $next.next();
    count++;
  }

  return parts.join(" ");
}

/**
 * Parse screening date/times from text
 */
function parseScreeningsFromText(text: string): ParsedChangeScreening[] {
  const screenings: ParsedChangeScreening[] = [];
  const currentYear = new Date().getFullYear();

  // Pattern for screenings: "Thu 8 Jan 14:50 NFT4" or "Fri 9 Jan 11:50 NFT4 and 17:30 NFT4 (DS)"
  const regex1 = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}):(\d{2})\s+(NFT\d|IMAX|BFI IMAX|Studio)(\s+p\d+)?(\s*\([A-Z]+\))?/gi;

  let match;
  while ((match = regex1.exec(text)) !== null) {
    const [fullMatch, day, date, month, hours, minutes, venue, pageRef, flags] = match;

    const monthNum = MONTHS[month.toLowerCase()];
    if (monthNum === undefined) continue;

    // Determine year - if month is in the past, assume next year
    const now = new Date();
    let year = currentYear;
    if (monthNum < now.getMonth() && now.getMonth() - monthNum > 2) {
      year = currentYear + 1;
    }

    const datetime = new Date(year, monthNum, parseInt(date, 10), parseInt(hours, 10), parseInt(minutes, 10));

    // Skip past screenings
    if (datetime < now) continue;

    // Extract accessibility flags
    const accessibilityFlags: string[] = [];
    if (/\bAD\b/.test(fullMatch)) accessibilityFlags.push("AD");
    if (/\bDS\b|\(DS\)/.test(fullMatch)) accessibilityFlags.push("DS");
    if (/\bCC\b/.test(fullMatch)) accessibilityFlags.push("CC");
    if (/\bBSL\b/.test(fullMatch)) accessibilityFlags.push("BSL");

    // Map venue
    const venueUpper = venue.toUpperCase().replace("BFI ", "");
    const cinemaId = VENUE_MAP[venueUpper] || "bfi-southbank";

    screenings.push({
      datetime,
      venue: venueUpper,
      cinemaId,
      accessibilityFlags,
      pageRef: pageRef?.replace(/\s+p/, "p").trim(),
    });
  }

  return screenings;
}

/**
 * Parse film metadata from text (for new additions)
 */
function parseMetadataFromText(text: string): ProgrammeChange["metadata"] {
  const metadata: ProgrammeChange["metadata"] = {};

  // Year: 4-digit number
  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    metadata.year = parseInt(yearMatch[0], 10);
  }

  // Runtime: "120min" or "2h 5min"
  const runtimeMatch = text.match(/\b(\d{2,3})min\b/i);
  if (runtimeMatch) {
    metadata.runtime = parseInt(runtimeMatch[1], 10);
  }

  // Director
  const directorMatch = text.match(/Director\s+([^.]+)\./i);
  if (directorMatch) {
    metadata.director = directorMatch[1].trim();
  }

  // Cast
  const castMatch = text.match(/With\s+([^.]+)\./);
  if (castMatch) {
    metadata.cast = castMatch[1].split(",").map(s => s.trim());
  }

  // Format
  const formatPatterns = ["Digital 4K", "Digital", "DCP 4K", "DCP", "35mm", "70mm", "IMAX Laser"];
  for (const format of formatPatterns) {
    if (text.includes(format)) {
      metadata.format = format;
      break;
    }
  }

  // Countries (at start of metadata line)
  const countryMatch = text.match(/([A-Za-z\-\/]+(?:-[A-Za-z]+)*)\s+\d{4}/);
  if (countryMatch && countryMatch[1].length < 50) {
    metadata.countries = countryMatch[1].split("-").map(s => s.trim());
  }

  return metadata;
}

/**
 * Extract the change note from text
 */
function extractNote(text: string): string {
  // Look for common note patterns
  const notePatterns = [
    /Please note[^.]+\./i,
    /This has been given[^.]+\./i,
    /This screening is now[^.]+\./i,
    /will now take place[^.]+\./i,
    /We apologise[^.]+\./i,
    /We are delighted[^.]+\./i,
  ];

  for (const pattern of notePatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }

  // Fallback: first sentence that's not screening info
  const sentences = text.split(/[.!]/).filter(s => s.trim().length > 10);
  for (const sentence of sentences) {
    if (!/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}/i.test(sentence) &&
        !/Screenings?:/i.test(sentence) &&
        !/^\d{4}\./.test(sentence.trim())) {
      return sentence.trim() + ".";
    }
  }

  return "";
}

/**
 * Clean film title
 */
function cleanTitle(title: string): string {
  return title
    .replace(/\s*\+\s*(Q\s*&?\s*A|intro|discussion|panel).*$/i, "")
    .replace(/^(Preview|UK Premiere|Premiere)[:\s]+/i, "")
    .replace(/\s*\([^)]+\)\s*$/, "")
    .trim();
}

/**
 * Convert programme changes to RawScreenings
 */
function convertChangesToRawScreenings(changes: ProgrammeChange[]): RawScreening[] {
  const screenings: RawScreening[] = [];
  const now = new Date();

  for (const change of changes) {
    // Skip cancellations and non-screening changes
    if (change.changeType === "cancellation") continue;
    if (change.screenings.length === 0) continue;

    for (const screening of change.screenings) {
      // Skip past screenings
      if (screening.datetime < now) continue;

      // Build booking URL
      const encodedTitle = encodeURIComponent(change.filmTitle);
      const bookingUrl = `https://whatson.bfi.org.uk/Online/default.asp?doWork::WScontent::search=1&BOparam::WScontent::search::article_search_text=${encodedTitle}`;

      // Detect event type
      let eventType: string | undefined;
      if (/\+\s*Q\s*&?\s*A/i.test(change.filmTitle)) eventType = "q_and_a";
      else if (/\+\s*intro/i.test(change.filmTitle)) eventType = "intro";
      else if (/in conversation/i.test(change.filmTitle)) eventType = "q_and_a";

      const rawScreening: RawScreening = {
        filmTitle: change.filmTitle,
        datetime: screening.datetime,
        screen: screening.venue,
        format: change.metadata?.format,
        bookingUrl,
        eventType,
        sourceId: `bfi-changes-${change.filmTitle.toLowerCase().replace(/\s+/g, "-")}-${screening.datetime.toISOString()}`,
        year: change.metadata?.year,
        director: change.metadata?.director,
      };

      screenings.push(rawScreening);
    }
  }

  return screenings;
}
