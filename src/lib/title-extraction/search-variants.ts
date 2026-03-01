/**
 * Search Variation Generator
 *
 * Generates alternative search titles for TMDB matching.
 * Uses the sync pattern extractor to first clean the title,
 * then produces variations (The-prefix, year removal, etc.).
 */

import { extractFilmTitleSync } from "./pattern-extractor";

/**
 * Generate alternative search titles for TMDB.
 * Returns multiple variations to try, with the extracted title first.
 */
export function generateSearchVariations(title: string): string[] {
  const result = extractFilmTitleSync(title);
  const variations: string[] = [];

  // Always include extracted title first
  variations.push(result.extractedTitle);

  // If extraction happened, also try original
  if (result.extractedTitle !== result.originalTitle) {
    if (result.confidence > 0.5) {
      variations.push(result.originalTitle);
    }
  }

  const base = result.extractedTitle;

  // Remove year suffix in parentheses: "Film (1954)" → "Film"
  const withoutYear = base.replace(/\s*\(\d{4}\)$/, "");
  if (withoutYear !== base) {
    variations.push(withoutYear);
  }

  // Handle "The" prefix variations
  if (base.startsWith("The ")) {
    variations.push(base.substring(4));
  } else {
    variations.push("The " + base);
  }

  // Handle "A " prefix variations
  if (base.startsWith("A ")) {
    variations.push(base.substring(2));
  }

  // Remove trailing "..." or ellipsis
  const withoutEllipsis = base.replace(/\.{2,}$/, "").replace(/…$/, "");
  if (withoutEllipsis !== base) {
    variations.push(withoutEllipsis);
  }

  return [...new Set(variations)].filter((v) => v.length > 0);
}
