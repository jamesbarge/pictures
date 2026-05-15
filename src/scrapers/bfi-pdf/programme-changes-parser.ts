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
import { fetchWithRetry } from "../utils/fetch-with-retry";
import { CHROME_USER_AGENT_FULL } from "../constants";
import { buildBFISearchUrl } from "./url-builder";
import { ukLocalToUTC } from "../utils/date-parser";

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
    return fetchWithRetry(proxyUrl.toString(), undefined, "[BFI-Changes] ScraperAPI changes proxy");
  }

  return fetch(url, {
    headers: {
      "User-Agent": CHROME_USER_AGENT_FULL,
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
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
 * Get text following a bold element — bounded by the NEXT bold element so
 * each film entry only sees its own screening times.
 *
 * The previous implementation called `$el.parent().text()` which returned the
 * full parent text including every sibling `<b>` and its screening lines.
 * Result: every film in a multi-film paragraph was matched against the SAME
 * pool of times, producing rows like "Rose of Nevada / Surviving Earth /
 * The Christophers all at 2026-05-15 11:50" — one real screening propagated
 * to six unrelated films. See `programme-changes-parser.test.ts` for the
 * fixture that reproduces the bug.
 *
 * The fixed walk:
 *   1. Collect text from the current `<b>`'s sibling nodes until the next
 *      `<b>`/`<strong>` at the same DOM level is reached.
 *   2. If the paragraph ends without exhausting siblings, continue into
 *      subsequent block-level siblings (paragraphs, divs) up to a small
 *      cap, stopping at any element that contains a bold tag.
 */
function getFollowingText($: CheerioAPI, $el: CheerioSelection): string {
  const parts: string[] = [];

  // 1. Walk through sibling nodes AFTER this <b> within its parent. Stop the
  //    moment we hit another <b>/<strong> — that's the next film entry.
  let hitNextBold = false;
  let $sib = $el.next();
  while ($sib.length) {
    const tag = ($sib.get(0) as { tagName?: string }).tagName?.toLowerCase();
    if (tag === "b" || tag === "strong") {
      hitNextBold = true;
      break;
    }
    parts.push($sib.text());
    $sib = $sib.next();
  }

  // Cheerio's `nextAll()`/`.next()` skips raw text nodes. If our scan returned
  // nothing, the parent likely has the screening times as direct text content.
  // Fall back to slicing the parent's text between THIS <b>'s text and the
  // next sibling <b>'s text.
  if (parts.length === 0) {
    const parentText = $el.parent().text();
    const ownText = $el.text();
    const startIdx = parentText.indexOf(ownText);
    if (startIdx >= 0) {
      let slice = parentText.slice(startIdx + ownText.length);
      // Truncate at the next bold sibling's text, if any.
      $el
        .parent()
        .find("b, strong")
        .each((_: number, b: unknown) => {
          if (b === $el.get(0)) return;
          const bText = $(b as Parameters<typeof $>[0]).text();
          const pos = slice.indexOf(bText);
          if (pos > 0) {
            slice = slice.slice(0, pos);
            return false;
          }
          return undefined;
        });
      parts.push(slice);
    }
  }

  // 2. If we didn't hit a bold sibling in this parent, continue into the
  //    next block-level siblings (paragraphs/divs). Stop at the first one
  //    whose first bold element marks the next film.
  if (!hitNextBold) {
    let $nextBlock = $el.parent().next();
    let walked = 0;
    while ($nextBlock.length && walked < 6) {
      const $firstBold = $nextBlock.find("b, strong").first();
      if ($firstBold.length) {
        const blockText = $nextBlock.text();
        const boldText = $firstBold.text().trim();
        if (boldText === blockText.trim()) {
          // Whole block is the next film title — stop entirely.
          break;
        }
        // Bold appears mid-block. Take only text before it, then stop.
        const idx = blockText.indexOf(boldText);
        if (idx > 0) parts.push(blockText.slice(0, idx));
        break;
      }
      parts.push($nextBlock.text());
      $nextBlock = $nextBlock.next();
      walked++;
    }
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
    const [fullMatch, , date, month, hours, minutes, venue, pageRef] = match;

    const monthNum = MONTHS[month.toLowerCase()];
    if (monthNum === undefined) continue;

    // Determine year - if month is in the past, assume next year
    const now = new Date();
    let year = currentYear;
    if (monthNum < now.getMonth() && now.getMonth() - monthNum > 2) {
      year = currentYear + 1;
    }

    // Build UTC explicitly with BST offset — never rely on the runtime TZ.
    const datetime = ukLocalToUTC(year, monthNum, parseInt(date, 10), parseInt(hours, 10), parseInt(minutes, 10));

    // Skip past screenings
    if (datetime < now) continue;

    // Extract accessibility flags
    const accessibilityFlags: string[] = [];
    if (/\bAD\b/.test(fullMatch)) accessibilityFlags.push("AD");
    if (/\bDS\b|\(DS\)/.test(fullMatch)) accessibilityFlags.push("DS");
    if (/\bCC\b/.test(fullMatch)) accessibilityFlags.push("CC");
    if (/\bBSL\b/.test(fullMatch)) accessibilityFlags.push("BSL");

    // Map venue — reject unknown venues instead of defaulting
    const venueUpper = venue.toUpperCase().replace("BFI ", "");
    const cinemaId = VENUE_MAP[venueUpper];
    if (!cinemaId) {
      console.warn(`[BFI-Changes] Unknown venue "${venue}", skipping screening`);
      continue;
    }

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
    // Only strip prefix when followed by colon (e.g. "Preview: Film Title")
    // NOT "UK Premiere of 4K Restoration: The Razor's Edge"
    .replace(/^(Preview|UK Premiere|Premiere):\s*/i, "")
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

      // Build booking URL (routes IMAX screens to IMAX site, others to Southbank)
      const bookingUrl = buildBFISearchUrl(change.filmTitle, screening.cinemaId);

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
