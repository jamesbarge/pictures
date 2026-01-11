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

import { extractText as unpdfExtractText, getDocumentProxy } from "unpdf";
import type { RawScreening } from "../types";
import type { FetchedPDF } from "./fetcher";

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
  return text;
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
  const titleLine = lines[startIndex];

  // Skip obviously non-title lines
  if (isScreeningLine(titleLine) || isMetadataLine(titleLine)) {
    return null;
  }

  // Title should be reasonably short and not contain screening patterns
  if (titleLine.length > 100) return null;

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
    } else if (isDescriptionLine(line, film)) {
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
function isDescriptionLine(line: string, film: ParsedFilm): boolean {
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

    const datetime = new Date(year, monthNum, parseInt(date, 10), parseInt(hours, 10), parseInt(minutes, 10));

    // Map venue to cinema ID
    const venueUpper = venue.toUpperCase();
    const cinemaId = VENUE_MAP[venueUpper] || "bfi-southbank";

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
 * Convert parsed films to RawScreening format for database import
 */
function convertToRawScreenings(films: ParsedFilm[], pdfLabel: string): RawScreening[] {
  const screenings: RawScreening[] = [];
  const now = new Date();

  for (const film of films) {
    for (const screening of film.screenings) {
      // Skip past screenings
      if (screening.datetime < now) continue;

      // Build booking URL (link to BFI search for this film)
      const encodedTitle = encodeURIComponent(film.title);
      const bookingUrl = `https://whatson.bfi.org.uk/Online/default.asp?doWork::WScontent::search=1&BOparam::WScontent::search::article_search_text=${encodedTitle}`;

      // Detect event type from title
      let eventType: string | undefined;
      if (/\+\s*Q\s*&?\s*A/i.test(film.title)) eventType = "q_and_a";
      else if (/\+\s*intro/i.test(film.title)) eventType = "intro";
      else if (/\+\s*discussion/i.test(film.title)) eventType = "discussion";
      else if (/preview/i.test(film.title)) eventType = "preview";
      else if (/premiere/i.test(film.title)) eventType = "premiere";

      // Clean title
      const cleanTitle = film.title
        .replace(/\s*\+\s*(Q\s*&?\s*A|intro|discussion|panel).*$/i, "")
        .replace(/^(Preview|UK Premiere|Premiere)[:\s]+/i, "")
        .trim();

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
