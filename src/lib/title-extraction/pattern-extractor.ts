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
  REVIEWED_WRAPPER_PREFIXES,
  stripTerminalDecorations,
  SINGALONG_PATTERN,
  DOUBLE_FEATURE_PATTERN,
  FESTIVAL_PREFIXES,
  LIVE_BROADCAST_KEYWORDS,
  escapeRegex,
} from "./patterns";
import { decodeHtmlEntities } from "../title-patterns";

const WRAPPING_QUOTES: ReadonlyArray<readonly [string, string]> = [
  ['"', '"'],
  ["'", "'"],
  ["\u201C", "\u201D"],
  ["\u2018", "\u2019"],
];

/**
 * A closing quote that comes before a later opening quote, as in
 * `Film A' + 'Film B` or `2001' + 'Solaris`. Order matters: `'n'` is an
 * opening quote, then a letter, then a closing quote, so `Rock 'n' Roll`
 * is one title. `It's`, `Singin'`, `'Burbs` and `'71` have only one side.
 */
function hasSeparateQuotations(inner: string, quote: string): boolean {
  let closerAt = -1;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] !== quote) continue;
    const prev = inner[i - 1];
    const next = inner[i + 1];
    const prevWord = prev !== undefined && /[\p{L}\p{N}]/u.test(prev);
    const nextWord = next !== undefined && /[\p{L}\p{N}]/u.test(next);
    // `It's` and `O'Brien`: the mark sits inside a word.
    if (prevWord && nextWord) continue;
    const opens = nextWord && (prev === undefined || /\s/.test(prev));
    // A closer can follow a letter, a digit (`2001'`) or punctuation (`Film!'`).
    const closes = prev !== undefined && !/\s/.test(prev) && (next === undefined || !nextWord);
    if (closes) closerAt = i;
    if (opens && closerAt !== -1 && i > closerAt) return true;
  }
  return false;
}

/**
 * Remove one matching pair of quotes from the two ends of a title.
 * The inside may contain an apostrophe (`'Singin' in the Rain'`,
 * `'The 'Burbs'`). A title that merely ends in a quote is left alone, and
 * so is a string whose inside quotes are separate quotations.
 */
function stripWrappingQuotePair(title: string): string {
  const trimmed = title.trim();
  for (const [open, close] of WRAPPING_QUOTES) {
    if (
      trimmed.length <= open.length + close.length ||
      !trimmed.startsWith(open) ||
      !trimmed.endsWith(close)
    ) {
      continue;
    }
    const inner = trimmed.slice(open.length, trimmed.length - close.length);
    if (open === close && hasSeparateQuotations(inner, open)) return trimmed;
    return inner.trim();
  }
  return trimmed;
}

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
  extracted = decodeHtmlEntities(extracted);

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

  // Reviewed wrappers (shared with the scraper cleaner) run before the literal
  // colon-separated list, which then only handles the remaining prefixes.
  const wrapper = REVIEWED_WRAPPER_PREFIXES.find((pattern) => pattern.test(extracted));
  if (wrapper) {
    extracted = extracted.replace(wrapper, "");
    method = method === "none" ? "prefix_removal" : method + "+prefix_removal";
    confidence = Math.min(confidence, PREFIX_MAX_CONFIDENCE);
  }

  // Check for event prefixes (colon-separated)
  for (const prefix of wrapper ? [] : EVENT_PREFIXES) {
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

  // Complete decorations first, looped so stacking order does not matter
  const undecorated = stripTerminalDecorations(extracted);
  if (undecorated !== extracted) {
    extracted = undecorated;
    method = method === "none" ? "suffix_removal" : method + "+suffix_removal";
    confidence = Math.min(confidence, SUFFIX_MAX_CONFIDENCE);
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

  // Collapse whitespace, then drop one pair of quotes that wraps the whole
  // title, including a name with its own apostrophe ("'Singin' in the Rain'").
  // A trailing quote that only closes an inner quotation stays: the title
  // does not start with a quote, so "My Bloody Valentine 'Loveless'" keeps
  // both of its marks.
  extracted = extracted.replace(/\s+/g, " ").trim();
  for (let pass = 0; pass < 2; pass++) {
    const unwrapped = stripWrappingQuotePair(extracted);
    if (unwrapped === extracted) break;
    extracted = unwrapped;
  }

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
