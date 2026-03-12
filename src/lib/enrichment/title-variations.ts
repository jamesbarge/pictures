/**
 * Title Variation Strategy for TMDB Enrichment
 *
 * Generates multiple search terms from a raw film title to maximize
 * TMDB matching probability. Event-wrapped titles like
 * "Funeral Parade Presents: Eraserhead + Q&A" would fail a single
 * TMDB search but succeed when we try "Eraserhead" as a variation.
 */

import { cleanFilmTitle } from "@/scrapers/utils/film-title-cleaner";

/**
 * Generate title variations for TMDB search, ordered by likelihood.
 * Returns deduplicated variations — try each in order with 250ms spacing.
 */
export function generateTitleVariations(rawTitle: string): string[] {
  const variations: string[] = [];
  const seen = new Set<string>();

  const add = (title: string) => {
    const normalized = title.trim();
    if (normalized.length < 2) return;
    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      variations.push(normalized);
    }
  };

  // 1. Original title (may work for clean titles)
  add(rawTitle);

  // 2. cleanFilmTitle() result (strips event prefixes/suffixes)
  add(cleanFilmTitle(rawTitle));

  // 3. Strip everything after " + " (manual strip for edge cases)
  const plusIdx = rawTitle.indexOf(" + ");
  if (plusIdx > 0) {
    add(rawTitle.substring(0, plusIdx).trim());
  }

  // 4. After-colon extraction: "Series: Film Title" → "Film Title"
  const colonMatch = rawTitle.match(/^[^:]+:\s*(.+)$/);
  if (colonMatch) {
    add(colonMatch[1].trim());
    // Also clean the after-colon part
    add(cleanFilmTitle(colonMatch[1].trim()));
  }

  // 5. Before-colon: "Film: Subtitle" → "Film"
  if (colonMatch) {
    const beforeColon = rawTitle.split(":")[0].trim();
    if (beforeColon.length > 2) {
      add(beforeColon);
    }
  }

  // 6. Strip year parenthetical: "Film (1972)" → "Film"
  const yearStripped = rawTitle.replace(/\s*\(\d{4}\)\s*$/, "").trim();
  if (yearStripped !== rawTitle) {
    add(yearStripped);
    add(cleanFilmTitle(yearStripped));
  }

  // 7. With/without "The " prefix
  const cleanedTitle = cleanFilmTitle(rawTitle);
  if (cleanedTitle.startsWith("The ")) {
    add(cleanedTitle.slice(4));
  } else {
    add(`The ${cleanedTitle}`);
  }

  return variations;
}

/**
 * Extract a year hint from a raw title if present.
 * Returns null if no year found.
 */
export function extractYearFromTitle(rawTitle: string): number | null {
  const match = rawTitle.match(/\((\d{4})\)/);
  if (match) {
    const year = parseInt(match[1]);
    if (year >= 1888 && year <= new Date().getFullYear() + 2) {
      return year;
    }
  }
  return null;
}
