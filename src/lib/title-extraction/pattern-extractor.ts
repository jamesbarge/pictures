/**
 * Sync Pattern-Based Title Extractor
 *
 * Extracts film titles from event-wrapped screening titles using regex patterns.
 * Fully synchronous — no API calls. Used by the enrichment agent for fast
 * title extraction during TMDB matching loops.
 *
 * Handles patterns like:
 *   - "Saturday Morning Picture Club: Song of the Sea" → "Song of the Sea"
 *   - "When Harry Met Sally + Intro" → "When Harry Met Sally"
 *   - "Inland Empire (4K Restoration)" → "Inland Empire"
 */

import {
  EVENT_PREFIXES,
  TITLE_SUFFIXES,
  NON_FILM_PATTERNS,
  PRESENTS_PATTERN,
  SINGALONG_PATTERN,
  DOUBLE_FEATURE_PATTERN,
  FESTIVAL_PREFIXES,
  LIVE_BROADCAST_KEYWORDS,
  escapeRegex,
} from "./patterns";

/** Confidence when no extraction is needed — title used as-is */
const FULL_CONFIDENCE = 1.0;
/** Confidence for "X presents: Y" pattern extraction */
const PRESENTS_CONFIDENCE = 0.95;
/** Confidence for sing-a-long pattern extraction */
const SINGALONG_CONFIDENCE = 0.9;
/** Maximum confidence when an event prefix is stripped */
const PREFIX_MAX_CONFIDENCE = 0.9;
/** Maximum confidence when a title suffix is stripped */
const SUFFIX_MAX_CONFIDENCE = 0.85;
/** Maximum confidence when extracting first film from a double feature */
const DOUBLE_FEATURE_MAX_CONFIDENCE = 0.7;
/** Confidence for festival compilation titles (low — likely not a single film) */
const FESTIVAL_COMPILATION_CONFIDENCE = 0.3;


/** Result of sync pattern-based title extraction (no AI calls) */
export interface PatternExtractionResult {
  originalTitle: string;
  extractedTitle: string;
  isCompilation: boolean;
  isLiveBroadcast: boolean;
  isNonFilm: boolean;
  confidence: number;
  extractionMethod: string;
}

/**
 * Extract the underlying film title from an event-wrapped title (sync).
 *
 * Returns metadata about the extraction including whether it's a compilation,
 * live broadcast, or non-film event.
 */
export function extractFilmTitleSync(title: string): PatternExtractionResult {
  const original = title;
  let extracted = title.trim();
  let isCompilation = false;
  let isLiveBroadcast = false;
  let method = "none";
  let confidence = FULL_CONFIDENCE;

  // Check for non-film events early
  for (const pattern of NON_FILM_PATTERNS) {
    if (pattern.test(extracted)) {
      return {
        originalTitle: original,
        extractedTitle: extracted,
        isCompilation: false,
        isLiveBroadcast: false,
        isNonFilm: true,
        confidence: 0, // non-film: no confidence
        extractionMethod: "non_film_detected",
      };
    }
  }

  // Decode HTML entities
  extracted = extracted
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  // Check for "presents" pattern first
  const presentsMatch = extracted.match(PRESENTS_PATTERN);
  if (presentsMatch) {
    extracted = presentsMatch[1];
    method = "presents_pattern";
    confidence = PRESENTS_CONFIDENCE;
  }

  // Check for sing-a-long pattern
  const singalongMatch = extracted.match(SINGALONG_PATTERN);
  if (singalongMatch) {
    extracted = singalongMatch[1];
    method = "singalong_pattern";
    confidence = SINGALONG_CONFIDENCE;
  }

  // Check for event prefixes (colon-separated)
  for (const prefix of EVENT_PREFIXES) {
    const prefixPattern = new RegExp(`^${escapeRegex(prefix)}:\\s*`, "i");
    if (prefixPattern.test(extracted)) {
      // Check if this is a festival compilation
      if (FESTIVAL_PREFIXES.includes(prefix.toUpperCase())) {
        isCompilation = true;
        confidence = FESTIVAL_COMPILATION_CONFIDENCE;
      }

      // Check if this is a live broadcast
      if (LIVE_BROADCAST_KEYWORDS.some((kw) => prefix.toLowerCase().includes(kw))) {
        isLiveBroadcast = true;
      }

      extracted = extracted.replace(prefixPattern, "");
      method = method === "none" ? "prefix_removal" : method + "+prefix_removal";
      if (!isCompilation) confidence = Math.min(confidence, PREFIX_MAX_CONFIDENCE);
      break;
    }
  }

  // Apply suffix removals
  for (const suffixPattern of TITLE_SUFFIXES) {
    if (suffixPattern.test(extracted)) {
      extracted = extracted.replace(suffixPattern, "").trim();
      method = method === "none" ? "suffix_removal" : method + "+suffix_removal";
      confidence = Math.min(confidence, SUFFIX_MAX_CONFIDENCE);
    }
  }

  // Handle double features — extract first film
  if (extracted.includes(" + ") && !method.includes("suffix")) {
    const doubleMatch = extracted.match(DOUBLE_FEATURE_PATTERN);
    if (doubleMatch) {
      extracted = doubleMatch[1].trim();
      method = method === "none" ? "double_feature" : method + "+double_feature";
      confidence = Math.min(confidence, DOUBLE_FEATURE_MAX_CONFIDENCE);
    }
  }

  // Clean up remaining artifacts
  extracted = extracted
    .replace(/\s+/g, " ")
    .replace(/^["'"'\u201C\u201D]+|["'"'\u201C\u201D]+$/g, "")
    .trim();

  // If we extracted something meaningful
  if (extracted !== original && extracted.length > 0) {
    return {
      originalTitle: original,
      extractedTitle: extracted,
      isCompilation,
      isLiveBroadcast,
      isNonFilm: false,
      confidence,
      extractionMethod: method,
    };
  }

  // No extraction needed — return as-is
  return {
    originalTitle: original,
    extractedTitle: original,
    isCompilation: false,
    isLiveBroadcast: false,
    isNonFilm: false,
    confidence: FULL_CONFIDENCE,
    extractionMethod: "none",
  };
}
