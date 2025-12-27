/**
 * Shared Metadata Parser
 *
 * Parses director, year, country, and runtime from cinema website text.
 * Supports multiple common formats:
 *
 * - "Director, Country, Year, Runtime" (Garden Cinema)
 * - "dir Director Name, Country Year, Runtime mins" (ICA)
 * - "(Year, Country, Director)" (The Nickel)
 * - "Director | Year | Runtime" (Various)
 * - Freeform text with embedded year/director
 */

export interface FilmMetadata {
  director?: string;
  year?: number;
  runtime?: number;
  country?: string;
}

// Common countries found on UK cinema websites
const COUNTRIES = [
  "USA",
  "UK",
  "France",
  "Germany",
  "Italy",
  "Spain",
  "Japan",
  "Canada",
  "Australia",
  "Norway",
  "Sweden",
  "Denmark",
  "Netherlands",
  "Belgium",
  "Ireland",
  "Mexico",
  "Brazil",
  "Argentina",
  "China",
  "South Korea",
  "India",
  "Poland",
  "Russia",
  "Austria",
  "Switzerland",
  "Hungary",
  "Czech Republic",
  "Czechia",
  "Romania",
  "Portugal",
  "Greece",
  "Finland",
  "New Zealand",
  "Iran",
  "Turkey",
  "Morocco",
  "Lebanon",
  "Bulgaria",
  "Taiwan",
  "Hong Kong",
  "Thailand",
  "Indonesia",
  "Philippines",
  "Vietnam",
  "South Africa",
  "Nigeria",
  "Egypt",
  "Israel",
  "Chile",
  "Colombia",
  "Peru",
  "Venezuela",
  "Cuba",
  "Ukraine",
  "Georgia",
  "Armenia",
  "Kazakhstan",
  "United States",
  "United Kingdom",
  "Great Britain",
];

/**
 * Check if a string is a known country
 */
function isCountry(str: string): boolean {
  const normalized = str.trim().toLowerCase();
  return COUNTRIES.some((c) => c.toLowerCase() === normalized);
}

/**
 * Check if a string looks like a year (1900-2099)
 */
function isYear(str: string): boolean {
  return /^(19|20)\d{2}$/.test(str.trim());
}

/**
 * Extract year from text (4-digit number starting with 19 or 20)
 */
export function extractYear(text: string): number | undefined {
  const match = text.match(/\b(19\d{2}|20\d{2})\b/);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Extract runtime from text (number followed by "mins", "min", "m", or just minutes)
 */
export function extractRuntime(text: string): number | undefined {
  // Match patterns like "135m", "120 mins", "90 min", "100 minutes"
  const match = text.match(/(\d{2,3})\s*(?:mins?\.?|minutes?|m\.?)\b/i);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Extract director from text using common patterns
 */
export function extractDirector(text: string): string | undefined {
  // Pattern 1: "dir Director Name" or "dir. Director Name"
  const dirMatch = text.match(/\bdir\.?\s+([^,\n]+?)(?:,|$|\n|\d{4})/i);
  if (dirMatch) {
    return cleanDirectorName(dirMatch[1]);
  }

  // Pattern 2: "directed by Director Name"
  const directedByMatch = text.match(
    /\bdirected\s+by\s+([^,\n]+?)(?:,|$|\n|\d{4})/i
  );
  if (directedByMatch) {
    return cleanDirectorName(directedByMatch[1]);
  }

  // Pattern 3: "(Year, Country, Director)" - The Nickel format
  const nickelMatch = text.match(/\(\d{4},\s*[^,]+,\s*([^)]+)\)/);
  if (nickelMatch) {
    return cleanDirectorName(nickelMatch[1]);
  }

  return undefined;
}

/**
 * Extract country from text
 */
export function extractCountry(text: string): string | undefined {
  for (const country of COUNTRIES) {
    const regex = new RegExp(`\\b${country}\\b`, "i");
    if (regex.test(text)) {
      return country;
    }
  }
  return undefined;
}

/**
 * Clean director name (remove trailing punctuation, normalize whitespace)
 */
function cleanDirectorName(name: string): string {
  return name
    .trim()
    .replace(/[.,;:]+$/, "") // Remove trailing punctuation
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}

/**
 * Parse metadata from a stats line (common format: "Director, Country, Year, Runtime")
 *
 * @param text - The metadata text to parse
 * @returns Extracted metadata fields
 *
 * @example
 * parseStatsLine("Greta Gerwig, USA, 2019, 135m.")
 * // => { director: "Greta Gerwig", country: "USA", year: 2019, runtime: 135 }
 *
 * @example
 * parseStatsLine("dir. Frank Capra, USA, 1946, 117 mins.")
 * // => { director: "Frank Capra", country: "USA", year: 1946, runtime: 117 }
 */
export function parseStatsLine(text: string): FilmMetadata {
  if (!text || !text.trim()) {
    return {};
  }

  const result: FilmMetadata = {};

  // Extract easy ones first
  result.year = extractYear(text);
  result.runtime = extractRuntime(text);
  result.country = extractCountry(text);

  // Try to extract director with pattern matching
  const directorFromPattern = extractDirector(text);
  if (directorFromPattern) {
    result.director = directorFromPattern;
  } else {
    // Fallback: first part before comma (if not a country or year)
    const parts = text.split(",").map((s) => s.trim());
    const firstPart = parts[0];

    if (firstPart && !isYear(firstPart) && !isCountry(firstPart)) {
      // Check it's not just runtime or other metadata
      if (
        !firstPart.match(/^\d+\s*(?:mins?|m)\.?$/i) &&
        firstPart.length > 2
      ) {
        result.director = cleanDirectorName(firstPart);
      }
    }
  }

  return result;
}

/**
 * Parse metadata from parenthetical format: "(Year, Country, Director)"
 * Used by The Nickel and similar cinemas
 */
export function parseParenthetical(text: string): FilmMetadata {
  const match = text.match(/\((\d{4}),\s*([^,]+),\s*([^)]+)\)/);
  if (match) {
    return {
      year: parseInt(match[1], 10),
      country: match[2].trim(),
      director: cleanDirectorName(match[3]),
    };
  }
  return {};
}

/**
 * Combined parser that tries multiple formats
 */
export function parseFilmMetadata(text: string): FilmMetadata {
  if (!text) return {};

  // Try parenthetical format first (specific pattern)
  const parenthetical = parseParenthetical(text);
  if (parenthetical.year && parenthetical.director) {
    return parenthetical;
  }

  // Fall back to stats line parsing
  return parseStatsLine(text);
}
