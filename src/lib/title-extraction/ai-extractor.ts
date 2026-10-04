/**
 * Async Film Title Extractor (deterministic adapter)
 *
 * The "AI" in this module's name is a historical artifact. It used to call
 * Gemini for ambiguous listings; the LLM dependency was removed in favour
 * of the synchronous pattern-based extractor in `pattern-extractor.ts`,
 * which already powered the enrichment agent's hot path.
 *
 * This file now exists purely as an async adapter so that callers expecting
 * the previous API (`extractFilmTitle`, `AIExtractionResult`) keep compiling
 * unchanged. New callers should prefer `extractFilmTitleSync` directly.
 */

import { VERSION_SUFFIX_PATTERNS, EVENT_PREFIX_PATTERNS, FRANCHISE_PATTERN } from "./patterns";
import { extractFilmTitleSync } from "./pattern-extractor";

/**
 * Result of pattern-based title extraction (kept under the historical name).
 */
export interface AIExtractionResult {
  filmTitle: string;
  /** Base title for matching/deduplication (without version suffixes) */
  canonicalTitle: string;
  /** Version/cut if present (e.g., "Final Cut", "Director's Cut") */
  version?: string;
  eventType?: string;
  confidence: "high" | "medium" | "low";
}

/**
 * Extract the version suffix (e.g. "Final Cut") from a title.
 */
function extractVersionSuffix(title: string): { baseTitle: string; version: string } | null {
  for (const pattern of VERSION_SUFFIX_PATTERNS) {
    const match = title.match(pattern);
    if (match) {
      const baseTitle = title.slice(0, match.index).trim();
      const version = match[0].replace(/^[\s:\-]+/, "").trim();
      return { baseTitle, version };
    }
  }
  return null;
}

/**
 * Whether a title can skip extraction entirely (i.e. it's already clean).
 */
function isLikelyCleanTitle(title: string): boolean {
  const normalized = title.toLowerCase().trim();

  for (const pattern of EVENT_PREFIX_PATTERNS) {
    if (pattern.test(normalized)) return false;
  }

  // Titles with parenthesized years like "Crash (1997)" should go through extraction
  if (/\(\d{4}\)\s*$/.test(title)) return false;

  // ALL CAPS titles often have appended cruft or need normalization
  if (title === title.toUpperCase() && title.length > 3) return false;

  // Very long titles likely have appended event info or descriptions
  if (title.length > 60) return false;

  // Suspicious colon: short prefix that isn't a known franchise
  if (normalized.includes(":")) {
    const beforeColon = normalized.split(":")[0];
    const words = beforeColon.trim().split(/\s+/);
    if (words.length <= 2 && !FRANCHISE_PATTERN.test(beforeColon)) {
      return false;
    }
  }

  return true;
}

/**
 * Basic title cleanup (BBFC ratings, format suffixes, Q&A markers).
 */
function cleanBasicCruft(title: string): string {
  return title
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*\((?:U|PG|12A?|15|18)\*?\)\s*$/i, "")
    .replace(/\s*\[.*?\]\s*$/g, "")
    .replace(/\s*-\s*(?:35mm|70mm|4k|imax)\s*$/i, "")
    .replace(/\s*\+\s*(?:q\s*&\s*a|discussion|intro)\s*$/i, "")
    .trim();
}

/**
 * Map the synchronous pattern extractor's numeric confidence to the
 * three-level enum the previous AI extractor exposed.
 */
function bucketConfidence(numeric: number): "high" | "medium" | "low" {
  if (numeric >= 0.85) return "high";
  if (numeric >= 0.5) return "medium";
  return "low";
}

/**
 * Extract the underlying film title from a (potentially noisy) screening
 * listing. Async signature retained for caller compatibility; the work
 * itself is synchronous.
 */
export async function extractFilmTitle(rawTitle: string): Promise<AIExtractionResult> {
  // Hot path: titles that look already clean skip the regex pipeline.
  if (isLikelyCleanTitle(rawTitle)) {
    const displayTitle = cleanBasicCruft(rawTitle);
    const versionInfo = extractVersionSuffix(displayTitle);
    if (versionInfo) {
      return {
        filmTitle: displayTitle,
        canonicalTitle: versionInfo.baseTitle,
        version: versionInfo.version,
        confidence: "high",
      };
    }
    return {
      filmTitle: displayTitle,
      canonicalTitle: displayTitle,
      confidence: "high",
    };
  }

  // Otherwise run the synchronous pattern-based extractor.
  const sync = extractFilmTitleSync(rawTitle);
  const displayTitle = cleanBasicCruft(sync.extractedTitle || rawTitle);
  const versionInfo = extractVersionSuffix(displayTitle);

  // Map sync extractor's metadata into the legacy event-type label.
  let eventType: string | undefined;
  if (sync.isLiveBroadcast) eventType = "live broadcast";
  else if (sync.isNonFilm) eventType = "non-film event";
  else if (sync.extractionMethod !== "none") eventType = sync.extractionMethod;

  if (versionInfo) {
    return {
      filmTitle: displayTitle,
      canonicalTitle: versionInfo.baseTitle,
      version: versionInfo.version,
      eventType,
      confidence: bucketConfidence(sync.confidence),
    };
  }

  return {
    filmTitle: displayTitle,
    canonicalTitle: displayTitle,
    eventType,
    confidence: bucketConfidence(sync.confidence),
  };
}
