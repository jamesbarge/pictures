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
  return Array.isArray(text) ? text.join(" ") : text;
}

/**
 * Insert newlines at structural boundaries in the BFI PDF text.
 *
 * unpdf returns the text as one continuous string with no line breaks —
 * verified on the June 2026 accessible guide. The existing line-based parser
 * logic needs separable lines, so we inject newlines at known structural
 * boundaries:
 *   1. Before every screening line "DAY DD MON HH:MM VENUE"
 *   2. Before every metadata line "Country YYYY. Director ..."
 *
 * Bug fixed 2026-05-14: the metadata regex over-fired at every cap-word
 * position inside a long phrase. For "Third Kind USA-UK 1977. Director" the
 * regex matched at "Third", "Kind", "USA" AND "UK" because each is a valid
 * starting position for a "cap-phrase YYYY. Director" pattern. Result:
 * `\nThird\nKind\nUSA-\nUK 1977.` instead of `\nUSA-UK 1977.`.
 *
 * Fix: require the match position to be preceded by EITHER (a) start of
 * input, (b) a period+space (end of description), or (c) a venue code
 * (NFT\d|IMAX|STUDIO|BFI IMAX). These are the only natural transitions
 * into a metadata block. This eliminates the duplicate-match storm while
 * preserving every real metadata insertion point.
 */
function segmentBFIText(text: string): string {
  let segmented = text.replace(
    /(?=\b(?:MON|TUE|WED|THU|FRI|SAT|SUN)\s+\d{1,2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{1,2}:\d{2}\s+(?:NFT\d|IMAX|STUDIO|BFI\s+IMAX))/gi,
    "\n",
  );

  // Metadata segmentation: insert \n BEFORE each "Country YYYY. Director ..."
  // pattern.
  //
  // Two critical correctness fixes (2026-05-14):
  //
  // 1. Lookbehind `(?<![A-Za-z\-])` — prevents matching at cap-word positions
  //    immediately preceded by a letter or hyphen. Without it, "USA-UK" would
  //    insert TWO newlines (one before USA, one before UK).
  //
  // 2. The cap-phrase before the year ONLY extends via hyphen (real
  //    co-productions: "USA-UK", "USA-UK-Canada-Germany"). It does NOT extend
  //    via additional space-separated cap words. Earlier regex allowed {0,3}
  //    space-separated extensions, which over-fired inside titles: for
  //    "E.T. the Extra Terrestrial USA 1982" it matched at "Extra" (with
  //    " Terrestrial USA" as 2 trailing words + " 1982" as year), shattering
  //    the title. Restricting to hyphen-only extensions costs us correct
  //    country capture for multi-word non-hyphenated names like "Czech
  //    Republic" (we'd capture "Republic" instead) but the metadata block
  //    boundary is still detected correctly. Trade-off: country field
  //    accuracy < title preservation, and we don't actually use the country
  //    field downstream.
  segmented = segmented.replace(
    /(?<![A-Za-z\-])(?=[A-Z][A-Za-z\-À-ſ]*(?:[-\/][A-Z][A-Za-z\-À-ſ]*)*\s+(?:19|20)\d{2}\.\s+(?:Director|Dir\.))/g,
    "\n",
  );
  return segmented;
}

/**
 * Main parsing function - converts PDF to structured screening data
 */
export async function parsePDF(fetchedPdf: FetchedPDF): Promise<ParseResult> {
  console.log(`[BFI-PDF] Parsing ${fetchedPdf.info.label}...`);

  const rawText = await extractText(fetchedPdf.buffer);
  const text = segmentBFIText(rawText);
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  const films: ParsedFilm[] = [];
  const parseErrors: string[] = [];
  let currentSeason: string | undefined;

  // Derive year from PDF label for screening dates
  const pdfYear = fetchedPdf.info.months?.start.getFullYear() || new Date().getFullYear();

  // IMAX-style entries have STANDALONE screening lines preceding the film's
  // title (e.g. "SUN 14 JUN 11:00 BFI IMAX" alone on a line, then "Ready
  // Player One" on subsequent lines). Track these as "pending" so the next
  // film parsed can claim them.
  const pendingScreenings: ParsedScreening[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Detect season/strand headers (all caps, short)
    if (isSeasonHeader(line)) {
      currentSeason = line;
      i++;
      continue;
    }

    // Standalone screening line (no title text after venue) — stash for the
    // next film. Detected here so it doesn't slip into the next tryParseFilm
    // as a starting line and get rejected.
    const standaloneScreening = line.match(
      /^(\b(?:MON|TUE|WED|THU|FRI|SAT|SUN)\s+\d{1,2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{1,2}:\d{2}\s+(?:NFT\d|IMAX|STUDIO|BFI\s+IMAX))\s*$/i,
    );
    if (standaloneScreening) {
      pendingScreenings.push(...parseScreeningLine(standaloneScreening[1], pdfYear));
      i++;
      continue;
    }

    // Look for screening pattern to identify film entries
    const filmResult = tryParseFilm(lines, i, pdfYear, currentSeason, pendingScreenings);

    if (filmResult) {
      films.push(filmResult.film);
      // pendingScreenings was consumed (or not) inside tryParseFilm — clear
      // here unconditionally so they don't bleed across film boundaries.
      pendingScreenings.length = 0;
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
  currentSeason?: string,
  pendingScreenings?: ParsedScreening[],
): { film: ParsedFilm; nextIndex: number } | null {
  let titleLine = lines[startIndex];

  // IMAX-style entries put the screening line BEFORE the title, then either
  // continue the title on the same line or wrap it to subsequent lines:
  //   "SUN 31 MAY 13:00 BFI IMAX E.T. the Extra Terrestrial"
  //   "USA 1982. Director Steven Spielberg. ..."
  //
  // The Southbank parser bails when isScreeningLine() is true. Handle this
  // case by extracting the screening AND the trailing text, treating the
  // text-after-venue as the candidate title for the film whose metadata
  // immediately follows.
  const screeningWithSuffix = titleLine.match(
    /^(\b(?:MON|TUE|WED|THU|FRI|SAT|SUN)\s+\d{1,2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{1,2}:\d{2}\s+(?:NFT\d|IMAX|STUDIO|BFI\s+IMAX))(\s+(.+))?$/i,
  );
  const precedingScreenings: ParsedScreening[] = [];
  if (screeningWithSuffix) {
    const titleAfterVenue = screeningWithSuffix[3]?.trim();
    if (!titleAfterVenue || titleAfterVenue.length < 2) {
      // Pure screening line with nothing trailing. The standalone-screening
      // case is handled by attaching to the NEXT film's preceding screenings
      // (below). This branch just signals "no film starts here".
      return null;
    }
    // Has trailing title text. Capture the screening so we can attach it.
    const parsed = parseScreeningLine(screeningWithSuffix[1], pdfYear);
    precedingScreenings.push(...parsed);
    titleLine = titleAfterVenue;
  } else if (isMetadataLine(titleLine)) {
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
      // If the screening line has trailing text that looks like ANOTHER
      // film's title (IMAX-style continuation), stop here — that screening
      // belongs to the next film. Otherwise we incorrectly absorb it.
      // Heuristic: trailing text starts with a capital and looks like a
      // title (short-ish, mostly cap-leading words, no internal "Director"
      // or year+period markers which would indicate description text).
      const trailing = line.match(
        /^\b(?:MON|TUE|WED|THU|FRI|SAT|SUN)\s+\d{1,2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{1,2}:\d{2}\s+(?:NFT\d|IMAX|STUDIO|BFI\s+IMAX)\s+(\S.*)$/i,
      );
      if (trailing) {
        const tail = trailing[1].trim();
        const looksLikeNextFilmTitle =
          /^[A-Z]/.test(tail) &&
          tail.length <= 100 &&
          !/\bDirector\b/i.test(tail) &&
          !/\b(19|20)\d{2}\b/.test(tail) &&
          !/(Members can|standard ticket|Closed Captions|Audio Descri|Subtitles|book and )/i.test(tail);
        if (looksLikeNextFilmTitle) {
          break; // hand this screening off to the next iteration of the main loop
        }
      }
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

  // Attach any IMAX-style preceding screenings — both ones captured from the
  // title line's trailing text AND ones stashed as pending from prior
  // standalone screening lines.
  if (precedingScreenings.length > 0) {
    film.screenings.unshift(...precedingScreenings);
  }
  if (pendingScreenings && pendingScreenings.length > 0) {
    film.screenings.unshift(...pendingScreenings);
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
