/**
 * BFI PDF Parser
 *
 * Parses the accessible (text-based) BFI Southbank guide PDF to extract screening data.
 *
 * PDF Structure (from playbook):
 * ```
 * FILM TITLE
 * Original Title (if different)
 * Country YYYY. Director Name. With Actor One, Actor Two. 120min. Digital 4K. 15.
 * Film description and context...
 * SAT 24 JAN 18:00 NFT1 AD
 * SUN 25 JAN 14:30 NFT3 CC
 * ```
 *
 * Date/Time Format: "SAT 24 JAN 18:00 NFT1" (DAY DD MON HH:MM VENUE)
 * Accessibility flags: AD (Audio Description), DS (Descriptive Subtitles), CC (Closed Captions), BSL (BSL interpreted)
 */

// MUST be the first import in this file. ES module imports are hoisted, so the
// polyfill needs to be in its own module imported before unpdf — otherwise
// unpdf's module body evaluates with Promise.try still undefined. See the
// polyfill file for full context.
import "./_promise-try-polyfill";
import { extractText as unpdfExtractText, getDocumentProxy } from "unpdf";
import type { RawScreening } from "../types";
import type { FetchedPDF } from "./fetcher";
import { buildBFISearchUrl } from "./url-builder";
import { ukLocalToUTC } from "../utils/date-parser";

// Venue mapping from PDF screen names to our cinema IDs
const VENUE_MAP: Record<string, string> = {
  "NFT1": "bfi-southbank",
  "NFT2": "bfi-southbank",
  "NFT3": "bfi-southbank",
  "NFT4": "bfi-southbank",
  "STUDIO": "bfi-southbank",
  "BFI IMAX": "bfi-imax",
  "IMAX": "bfi-imax",
  "BFI REUBEN LIBRARY": "bfi-southbank",
};

// Month name to number mapping
const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
  JANUARY: 0, FEBRUARY: 1, MARCH: 2, APRIL: 3,
  JUNE: 5, JULY: 6, AUGUST: 7, SEPTEMBER: 8,
  OCTOBER: 9, NOVEMBER: 10, DECEMBER: 11,
};

export interface ParsedFilm {
  title: string;
  originalTitle?: string;
  year?: number;
  director?: string;
  cast?: string[];
  runtime?: number;
  format?: string;
  certificate?: string;
  countries?: string[];
  description?: string;
  screenings: ParsedScreening[];
  /** Season/strand this film belongs to */
  season?: string;
}

export interface ParsedScreening {
  day: string;
  date: number;
  month: string;
  time: string;
  venue: string;
  cinemaId: string;
  datetime: Date;
  accessibilityFlags: string[];
}

export interface ParseResult {
  films: ParsedFilm[];
  screenings: RawScreening[];
  parseErrors: string[];
  pdfLabel: string;
}

/**
 * Extracts text from PDF buffer using unpdf (serverless-compatible)
 */
async function extractText(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await unpdfExtractText(pdf, { mergePages: true });
  // unpdf returns the text as one continuous string with no line breaks —
  // verified 2026-05-14 on the BFI June 2026 accessible guide. The existing
  // line-based parser logic needs separable lines, so we inject newlines at
  // known structural boundaries:
  //   1. Before every screening line "DAY DD MON HH:MM VENUE"
  //   2. Before every metadata line "Country YYYY. Director ..."
  // This recovers the line structure the PDF "should" have had if pdf.js
  // preserved layout. After segmentation, each film entry is roughly:
  //   <title (mixed case)>
  //   Country YYYY. Director X. With Y. Nmin. Format. Cert.
  //   <description>
  //   DAY DD MON HH:MM VENUE  (one per screening)
  return segmentBFIText(Array.isArray(text) ? text.join(" ") : text);
}

/**
 * Insert newlines at structural boundaries in the BFI PDF text. See extractText
 * above for why this is needed.
 */
function segmentBFIText(text: string): string {
  // Insert \n BEFORE each screening pattern. The lookahead ensures we don't
  // consume the match itself, so it ends up on its own line.
  let segmented = text.replace(
    /(?=\b(?:MON|TUE|WED|THU|FRI|SAT|SUN)\s+\d{1,2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{1,2}:\d{2}\s+(?:NFT\d|IMAX|STUDIO|BFI\s+IMAX))/gi,
    "\n",
  );
  // Insert \n BEFORE each metadata line. Detect by "Country YYYY. Director" —
  // country can be:
  //   - single word: "UK", "Cuba", "France"
  //   - multi-word: "Czech Republic", "United States of America" (up to 4 words)
  //   - hyphenated co-production: "UK-France", "USA-UK-Canada-Germany"
  //   - mixed: "United States-Canada"
  // Allow {0,3} additional words after the initial cap word (4 total).
  segmented = segmented.replace(
    /(?=\b[A-Z][A-Za-z\-À-ſ]*(?:\s+(?:of\s+|the\s+|and\s+)?[A-Z][A-Za-z\-À-ſ]*){0,3}(?:[-\/][A-Z][A-Za-z\-À-ſ]*(?:\s+(?:of\s+|the\s+|and\s+)?[A-Z][A-Za-z\-À-ſ]*){0,3})*\s+(?:19|20)\d{2}\.\s+(?:Director|Dir\.))/g,
    "\n",
  );
  return segmented;
}

/**
 * Main parsing function - converts PDF to structured screening data
 */
export async function parsePDF(fetchedPdf: FetchedPDF): Promise<ParseResult> {
  console.log(`[BFI-PDF] Parsing ${fetchedPdf.info.label}...`);

  const text = await extractText(fetchedPdf.buffer);
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  const films: ParsedFilm[] = [];
  const parseErrors: string[] = [];
  let currentSeason: string | undefined;

  // Derive year from PDF label for screening dates
  const pdfYear = fetchedPdf.info.months?.start.getFullYear() || new Date().getFullYear();

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Detect season/strand headers (all caps, short)
    if (isSeasonHeader(line)) {
      currentSeason = line;
      i++;
      continue;
    }

    // Look for screening pattern to identify film entries
    // A film entry typically has title followed by metadata and screenings
    const filmResult = tryParseFilm(lines, i, pdfYear, currentSeason);

    if (filmResult) {
      films.push(filmResult.film);
      i = filmResult.nextIndex;
    } else {
      i++;
    }
  }

  // Convert parsed films to RawScreenings
  const screenings = convertToRawScreenings(films, fetchedPdf.info.label);

  console.log(`[BFI-PDF] Parsed ${films.length} films with ${screenings.length} screenings`);

  return {
    films,
    screenings,
    parseErrors,
    pdfLabel: fetchedPdf.info.label,
  };
}

/**
 * Check if a line is a season/strand header
 */
function isSeasonHeader(line: string): boolean {
  // Season headers are typically all caps and short
  if (line.length < 5 || line.length > 50) return false;
  if (line !== line.toUpperCase()) return false;

  // Common season patterns
  const seasonPatterns = [
    /^[A-Z\s]+SEASON$/,
    /^BIG SCREEN CLASSICS$/,
    /^MEMBER EXCLUSIVES$/,
    /^PROJECTING THE ARCHIVE$/,
    /^EXPERIMENTA$/,
    /^AFRICAN ODYSSEYS$/,
    /^WOMAN WITH A MOVIE CAMERA$/,
    /^IN THE FRAME:/,
    /^RE-RELEASES$/,
    /^NEW RELEASES$/,
    /^PREVIEWS$/,
    /^RELAXED SCREENINGS$/,
  ];

  return seasonPatterns.some(p => p.test(line));
}

/**
 * Try to parse a film entry starting at the given line index
 */
function tryParseFilm(
  lines: string[],
  startIndex: number,
  pdfYear: number,
  currentSeason?: string
): { film: ParsedFilm; nextIndex: number } | null {
  // Title is the LAST text on the title line — the segmentation regex breaks
  // BEFORE country/year metadata, which means the previous film's description
  // tail is concatenated with the next film's title on the same line. Take the
  // last 3-12 words as the candidate title.
  const titleLine = lines[startIndex];

  // Skip obviously non-title lines
  if (isScreeningLine(titleLine) || isMetadataLine(titleLine)) {
    return null;
  }

  // Title should be reasonably short and not contain screening patterns
  if (titleLine.length > 100) return null;

  // Filter parse artifacts: titles that are a country-code stub with a trailing
  // hyphen (the artifact signature — segmentation pulled too little text and
  // left a dangling co-production hyphen). Require a terminal `-` so we don't
  // accidentally reject legitimate short caps titles like THX, JFK, M, Z, RAN.
  // Examples this catches: "UK-", "USA-", "UK-France-", "USA-UK-".
  if (/^[A-Z]{2,5}(?:-[A-Z][a-z]+)*-$/.test(titleLine)) return null;
  if (titleLine.length < 2) return null;
  // Lowercase-leading: real titles can legitimately start lowercase via
  // articles or particles in many languages. Allowlist common ones; if the
  // title doesn't start with a known particle AND starts lowercase, reject.
  // BFI programmes a lot of European cinema so the list spans EN/ES/IT/FR/DE/NL.
  const lowercaseParticles = /^(de|la|le|el|il|al|las|los|lo|un|una|o|a|du|des|der|die|das|den|van|von|zu|y)\s/i;
  if (/^[a-z]/.test(titleLine) && !lowercaseParticles.test(titleLine)) return null;

  const film: ParsedFilm = {
    title: titleLine,
    screenings: [],
    season: currentSeason,
  };

  let i = startIndex + 1;

  // Look for metadata line (Country YYYY. Director...)
  while (i < lines.length && i < startIndex + 5) {
    const line = lines[i];

    if (isMetadataLine(line)) {
      const metadata = parseMetadataLine(line);
      Object.assign(film, metadata);
      i++;
      break;
    }

    // Could be original title
    if (!isScreeningLine(line) && line.length < 80) {
      film.originalTitle = line;
    }

    i++;
  }

  // Look for screening lines
  while (i < lines.length) {
    const line = lines[i];

    // Check if this is a screening line
    if (isScreeningLine(line)) {
      const screenings = parseScreeningLine(line, pdfYear);
      film.screenings.push(...screenings);
      i++;
    } else if (isDescriptionLine(line)) {
      // Description lines - skip but continue
      if (!film.description) {
        film.description = line;
      } else {
        film.description += " " + line;
      }
      i++;
    } else {
      // Hit a new film or section
      break;
    }
  }

  // Only return if we found screenings
  if (film.screenings.length === 0) {
    return null;
  }

  return { film, nextIndex: i };
}

/**
 * Check if line contains screening date/time pattern
 */
function isScreeningLine(line: string): boolean {
  // Pattern: "SAT 24 JAN 18:00 NFT1" or "SUN 25 JAN 14:30 NFT3 CC"
  // Also handles multiple screenings: "SAT 24 JAN 18:00 NFT1; SUN 25 JAN 14:30 NFT3"
  const screeningPattern = /\b(MON|TUE|WED|THU|FRI|SAT|SUN)\s+\d{1,2}\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{1,2}:\d{2}\s+(NFT\d|IMAX|STUDIO)/i;
  return screeningPattern.test(line);
}

/**
 * Check if line is a metadata line (Country, Year, Director, etc.)
 */
function isMetadataLine(line: string): boolean {
  // Pattern: "UK 2024. Director Name. With Actor. 120min. Digital. 15."
  // Must contain year and typically has country, director, runtime
  return /\b(19|20)\d{2}\b/.test(line) &&
    (/\b\d{2,3}min\b/i.test(line) || /\bDirector\b/i.test(line) || /\bDir\.\b/i.test(line));
}

/**
 * Check if line is part of film description
 */
function isDescriptionLine(line: string): boolean {
  // Description lines are typically longer prose
  if (line.length < 20) return false;
  if (isScreeningLine(line)) return false;
  if (isMetadataLine(line)) return false;
  if (isSeasonHeader(line)) return false;
  return true;
}

/**
 * Parse metadata line to extract film details
 */
function parseMetadataLine(line: string): Partial<ParsedFilm> {
  const result: Partial<ParsedFilm> = {};

  // Extract year
  const yearMatch = line.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    result.year = parseInt(yearMatch[0], 10);
  }

  // Extract runtime
  const runtimeMatch = line.match(/\b(\d{2,3})min\b/i);
  if (runtimeMatch) {
    result.runtime = parseInt(runtimeMatch[1], 10);
  }

  // Extract certificate
  const certMatch = line.match(/\b(U|PG|12A?|15|18|TBC)\b\.?\s*$/);
  if (certMatch) {
    result.certificate = certMatch[1];
  }

  // Extract format
  const formatPatterns = ["Digital 4K", "Digital", "DCP 4K", "DCP", "35mm", "70mm", "70mm IMAX", "IMAX Laser"];
  for (const format of formatPatterns) {
    if (line.includes(format)) {
      result.format = format;
      break;
    }
  }

  // Extract director (pattern: "Director Name." or "Dir. Name.")
  const directorMatch = line.match(/(?:Director|Dir\.)\s+([^.]+)\./i);
  if (directorMatch) {
    result.director = directorMatch[1].trim();
  }

  // Extract cast (pattern: "With Actor One, Actor Two.")
  const castMatch = line.match(/With\s+([^.]+)\./);
  if (castMatch) {
    result.cast = castMatch[1].split(",").map(s => s.trim());
  }

  // Extract countries (at the start, before year)
  const countryMatch = line.match(/^([A-Za-z\-\/\s]+)\s+\d{4}/);
  if (countryMatch) {
    result.countries = countryMatch[1].split(/[-\/]/).map(s => s.trim()).filter(s => s.length > 0);
  }

  return result;
}

/**
 * Parse screening line to extract date/time/venue
 */
function parseScreeningLine(line: string, pdfYear: number): ParsedScreening[] {
  const screenings: ParsedScreening[] = [];

  // Split by semicolon for multiple screenings
  const parts = line.split(/[;,]/);

  for (const part of parts) {
    // Pattern: "SAT 24 JAN 18:00 NFT1 AD CC"
    const match = part.match(/\b(MON|TUE|WED|THU|FRI|SAT|SUN)\s+(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{1,2}):(\d{2})\s+(NFT\d|IMAX|STUDIO|BFI IMAX)/i);

    if (!match) continue;

    const [, day, date, month, hours, minutes, venue] = match;

    // Extract accessibility flags
    const accessibilityFlags: string[] = [];
    if (/\bAD\b/.test(part)) accessibilityFlags.push("AD");
    if (/\bDS\b/.test(part)) accessibilityFlags.push("DS");
    if (/\bCC\b/.test(part)) accessibilityFlags.push("CC");
    if (/\bBSL\b/.test(part)) accessibilityFlags.push("BSL");

    // Calculate full datetime
    const monthNum = MONTHS[month.toUpperCase()];
    let year = pdfYear;

    // Handle year boundary (e.g., December PDF covering January)
    const now = new Date();
    if (monthNum < now.getMonth() - 1) {
      year = pdfYear + 1;
    }

    // Build UTC explicitly with BST offset — never rely on the runtime TZ.
    const datetime = ukLocalToUTC(year, monthNum, parseInt(date, 10), parseInt(hours, 10), parseInt(minutes, 10));

    // Map venue to cinema ID — reject unknown venues instead of defaulting
    const venueUpper = venue.toUpperCase();
    const cinemaId = VENUE_MAP[venueUpper];
    if (!cinemaId) {
      console.warn(`[BFI-PDF] Unknown venue "${venue}", skipping screening`);
      continue;
    }

    screenings.push({
      day: day.toUpperCase(),
      date: parseInt(date, 10),
      month: month.toUpperCase(),
      time: `${hours}:${minutes}`,
      venue: venueUpper,
      cinemaId,
      datetime,
      accessibilityFlags,
    });
  }

  return screenings;
}

/**
 * Detect garbled or suspicious titles from scraping errors.
 */
function isSuspiciousTitle(title: string): boolean {
  // Starts with lowercase word (likely a fragment — "of 4K Restoration...")
  if (/^[a-z]/.test(title) && !title.startsWith("de ") && !title.startsWith("la ") && !title.startsWith("el ")) {
    return true;
  }
  // Contains obvious PDF parsing artifacts like "p12" page references
  if (/\bp\d{1,2}$/.test(title)) return true;
  // Extremely short titles
  if (title.length < 3) return true;
  return false;
}

/**
 * Convert parsed films to RawScreening format for database import
 */
function convertToRawScreenings(films: ParsedFilm[], pdfLabel: string): RawScreening[] {
  const screenings: RawScreening[] = [];
  const now = new Date();

  for (const film of films) {
    for (const screening of film.screenings) {
      // Skip past screenings
      if (screening.datetime < now) continue;

      // Build booking URL (routes IMAX screens to IMAX site, others to Southbank)
      const bookingUrl = buildBFISearchUrl(film.title, screening.venue);

      // Detect event type from title
      let eventType: string | undefined;
      if (/\+\s*Q\s*&?\s*A/i.test(film.title)) eventType = "q_and_a";
      else if (/\+\s*intro/i.test(film.title)) eventType = "intro";
      else if (/\+\s*discussion/i.test(film.title)) eventType = "discussion";
      else if (/preview/i.test(film.title)) eventType = "preview";
      else if (/premiere/i.test(film.title)) eventType = "premiere";

      // Clean title — only strip prefix when followed by colon
      // e.g. "Preview: Film" → "Film", but NOT "UK Premiere of 4K Restoration: X"
      const cleanTitle = film.title
        .replace(/\s*\+\s*(Q\s*&?\s*A|intro|discussion|panel).*$/i, "")
        .replace(/^(Preview|UK Premiere|Premiere):\s*/i, "")
        .trim();

      // Reject titles that look garbled
      if (isSuspiciousTitle(cleanTitle)) {
        console.warn(`[BFI-PDF] Rejecting suspicious title: "${cleanTitle}" (from "${film.title}")`);
        continue;
      }

      const rawScreening: RawScreening = {
        filmTitle: cleanTitle,
        datetime: screening.datetime,
        screen: screening.venue,
        format: film.format,
        bookingUrl,
        eventType,
        sourceId: `bfi-pdf-${pdfLabel}-${cleanTitle.toLowerCase().replace(/\s+/g, "-")}-${screening.datetime.toISOString()}`,
        year: film.year,
        director: film.director,
      };

      screenings.push(rawScreening);
    }
  }

  return screenings;
}

/**
 * Parse PDF from a file path (for testing)
 */
export async function parsePDFFromPath(filePath: string): Promise<ParseResult> {
  const fs = await import("fs");
  const buffer = fs.readFileSync(filePath);

  const mockFetchedPdf: FetchedPDF = {
    info: {
      label: "Test PDF",
      fullPdfUrl: "",
      accessiblePdfUrl: filePath,
      mediaId: "test",
      months: null,
    },
    buffer,
    contentHash: "test",
    fetchedAt: new Date(),
  };

  return parsePDF(mockFetchedPdf);
}
