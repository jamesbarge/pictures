/**
 * AI-Powered Film Title Extractor
 *
 * Uses Gemini to intelligently extract actual film titles from event names.
 * Async — makes API calls for ambiguous titles. Falls back to basic cleaning
 * when the title is likely already clean (via heuristic check).
 */

import { generateText, stripCodeFences } from "../gemini";
import {
  EVENT_PREFIX_PATTERNS,
  VERSION_SUFFIX_PATTERNS,
  FRANCHISE_PATTERN,
} from "./patterns";

export interface AIExtractionResult {
  filmTitle: string;
  /** Base title for matching/deduplication (without version suffixes like "Final Cut") */
  canonicalTitle: string;
  /** Version/cut if present (e.g., "Final Cut", "Director's Cut") */
  version?: string;
  eventType?: string;
  confidence: "high" | "medium" | "low";
}

/**
 * Extract version suffix from a title.
 * Returns the base title and version string if found, null otherwise.
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
 * Check if a title has a version suffix that needs canonical extraction.
 */
function hasVersionSuffix(title: string): boolean {
  return VERSION_SUFFIX_PATTERNS.some((pattern) => pattern.test(title));
}

/**
 * Check if a title is likely already clean (no event prefixes).
 * Returns true if the title can skip the AI call.
 */
export function isLikelyCleanTitle(title: string): boolean {
  const normalized = title.toLowerCase().trim();

  for (const pattern of EVENT_PREFIX_PATTERNS) {
    if (pattern.test(normalized)) {
      return false;
    }
  }

  // Titles with parenthesized years like "Crash (1997)" should go through extraction
  if (/\(\d{4}\)\s*$/.test(title)) {
    return false;
  }

  // ALL CAPS titles often have appended cruft or need normalization
  if (title === title.toUpperCase() && title.length > 3) {
    return false;
  }

  // Very long titles likely have appended event info or descriptions
  if (title.length > 60) {
    return false;
  }

  // Check for version suffixes — these are clean titles we handle locally
  if (hasVersionSuffix(title)) {
    return true;
  }

  // Check for suspicious colon patterns (but allow film subtitles)
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
 * Basic title cleanup (BBFC ratings, format suffixes, etc.).
 */
function cleanBasicCruft(title: string): string {
  return title
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*\((U|PG|12A?|15|18)\*?\)\s*$/i, "")
    .replace(/\s*\[.*?\]\s*$/g, "")
    .replace(/\s*-\s*(35mm|70mm|4k|imax)\s*$/i, "")
    .replace(/\s*\+\s*(q\s*&\s*a|discussion|intro)\s*$/i, "")
    .trim();
}

/**
 * Extract the actual film title from a screening event name using AI.
 *
 * Tries a local heuristic first (for clearly clean titles), then falls back
 * to Gemini for ambiguous cases.
 *
 * Examples:
 * - "Saturday Morning Picture Club: The Muppets Christmas Carol" → "The Muppets Christmas Carol"
 * - "35mm: Casablanca" → "Casablanca"
 * - "Apocalypse Now : Final Cut" → filmTitle: "Apocalypse Now : Final Cut", canonicalTitle: "Apocalypse Now"
 */
export async function extractFilmTitleAI(rawTitle: string): Promise<AIExtractionResult> {
  // Quick pass: if it looks like a clean title already, skip the API call
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

  try {
    const text = await generateText(`Extract film title information from this cinema screening listing.

Listing: "${rawTitle}"

Return ONLY a JSON object (no markdown) with:
- title: The display title (as shown, with version if present)
- canonical: The base film title without version suffixes like "Director's Cut", "Final Cut", "Extended Edition", "Redux", "Restored", "Remastered" (for matching/deduplication)
- version: The version/cut if present (e.g., "Final Cut", "Director's Cut")
- event: Event type if any (e.g., "35mm screening", "Q&A", "kids screening")
- confidence: "high" | "medium" | "low"

IMPORTANT: "canonical" should strip version suffixes but keep legitimate subtitles.
- "Apocalypse Now : Final Cut" → canonical: "Apocalypse Now", version: "Final Cut"
- "Blade Runner : The Final Cut" → canonical: "Blade Runner", version: "The Final Cut"
- "Star Wars: A New Hope" → canonical: "Star Wars: A New Hope" (subtitle, not version)
- "Amadeus: Director's Cut" → canonical: "Amadeus", version: "Director's Cut"

Examples:
- "Saturday Morning Picture Club: The Muppets Christmas Carol" → {"title": "The Muppets Christmas Carol", "canonical": "The Muppets Christmas Carol", "event": "kids screening", "confidence": "high"}
- "Apocalypse Now : Final Cut" → {"title": "Apocalypse Now : Final Cut", "canonical": "Apocalypse Now", "version": "Final Cut", "confidence": "high"}
- "35mm: Casablanca (PG)" → {"title": "Casablanca", "canonical": "Casablanca", "event": "35mm screening", "confidence": "high"}`);

    const parsed = JSON.parse(stripCodeFences(text));
    const displayTitle = cleanBasicCruft(parsed.title || rawTitle);

    return {
      filmTitle: displayTitle,
      canonicalTitle: parsed.canonical || displayTitle,
      version: parsed.version,
      eventType: parsed.event,
      confidence: parsed.confidence || "medium",
    };
  } catch (error) {
    console.warn(`[TitleExtractor] AI extraction failed for "${rawTitle}":`, error);
    const displayTitle = cleanBasicCruft(rawTitle);
    const versionInfo = extractVersionSuffix(displayTitle);

    if (versionInfo) {
      return {
        filmTitle: displayTitle,
        canonicalTitle: versionInfo.baseTitle,
        version: versionInfo.version,
        confidence: "low",
      };
    }

    return {
      filmTitle: displayTitle,
      canonicalTitle: displayTitle,
      confidence: "low",
    };
  }
}
