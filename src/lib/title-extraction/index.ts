/**
 * Unified Title Extraction Module
 *
 * Single entry point for all film title extraction needs:
 * - Sync pattern extraction (for enrichment agent / fast loops)
 * - Async AI extraction (for pipeline / scripts)
 * - Hybrid extraction (patterns first, AI fallback)
 * - Caching and batch processing wrappers
 */

export { extractFilmTitleSync, type PatternExtractionResult } from "./pattern-extractor";
export { extractFilmTitleAI, type AIExtractionResult } from "./ai-extractor";
export { generateSearchVariations } from "./search-variants";

import { extractFilmTitleAI, isLikelyCleanTitle, type AIExtractionResult } from "./ai-extractor";

/**
 * Hybrid title extraction: tries AI extraction (which uses a local heuristic
 * for clean titles, then falls back to Gemini for ambiguous ones).
 *
 * This is the default async extractor for scripts and new callers.
 */
export async function extractFilmTitle(rawTitle: string): Promise<AIExtractionResult> {
  return extractFilmTitleAI(rawTitle);
}

/**
 * Cache for extracted titles (avoids repeated API calls within a session).
 */
const titleCache = new Map<string, AIExtractionResult>();

/**
 * Extract with caching — used by the scraper pipeline.
 */
export async function extractFilmTitleCached(rawTitle: string): Promise<AIExtractionResult> {
  const cached = titleCache.get(rawTitle);
  if (cached) {
    return cached;
  }

  const result = await extractFilmTitle(rawTitle);
  titleCache.set(rawTitle, result);
  return result;
}

/**
 * Batch extract titles with deduplication and rate limiting.
 *
 * Two-pass approach: first classify titles as clean (no API needed) or
 * needing extraction, then process each group appropriately. This ensures
 * every Gemini API call gets a 500ms delay, even when Gemini returns
 * "high" confidence for a successful extraction.
 */
export async function batchExtractTitles(
  rawTitles: string[]
): Promise<Map<string, AIExtractionResult>> {
  const results = new Map<string, AIExtractionResult>();
  const uniqueTitles = [...new Set(rawTitles)];

  // Pass 1: process clean titles locally (no API call, no delay)
  const needsExtraction: string[] = [];

  for (const title of uniqueTitles) {
    if (isLikelyCleanTitle(title)) {
      const result = await extractFilmTitle(title);
      results.set(title, result);
    } else {
      needsExtraction.push(title);
    }
  }

  // Pass 2: process ambiguous titles via API with rate limiting (~2 req/s)
  for (let i = 0; i < needsExtraction.length; i++) {
    const title = needsExtraction[i];
    const result = await extractFilmTitle(title);
    results.set(title, result);

    if (i < needsExtraction.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return results;
}

/**
 * Clear the title cache.
 */
export function clearTitleCache(): void {
  titleCache.clear();
}
