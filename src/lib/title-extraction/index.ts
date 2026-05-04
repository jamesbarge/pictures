/**
 * Unified Title Extraction Module
 *
 * Single entry point for all film title extraction needs:
 * - Sync pattern extraction (for enrichment agent / fast loops)
 * - Async pattern extraction (legacy `extractFilmTitleAI` API)
 * - Caching and batch processing wrappers
 *
 * Title extraction is now fully deterministic — no LLM calls. The async
 * variants exist for backward-compatibility with callers that already
 * await the result.
 */

export { extractFilmTitleSync, type PatternExtractionResult } from "./pattern-extractor";
export { extractFilmTitleAI, hasWordOverlap, type AIExtractionResult } from "./ai-extractor";
export { generateSearchVariations } from "./search-variants";

import { extractFilmTitleAI, isLikelyCleanTitle, type AIExtractionResult } from "./ai-extractor";

/**
 * Async pattern-based title extraction. Wraps the sync extractor for callers
 * that prefer the async signature. No network calls under the hood.
 */
export async function extractFilmTitle(rawTitle: string): Promise<AIExtractionResult> {
  return extractFilmTitleAI(rawTitle);
}

/** Cache for extracted titles. */
const titleCache = new Map<string, AIExtractionResult>();

/** Extract with caching — used by the scraper pipeline. */
export async function extractFilmTitleCached(rawTitle: string): Promise<AIExtractionResult> {
  const cached = titleCache.get(rawTitle);
  if (cached) return cached;

  const result = await extractFilmTitle(rawTitle);
  titleCache.set(rawTitle, result);
  return result;
}

/**
 * Batch extract titles with deduplication. The previous implementation
 * sequenced "ambiguous" titles through an LLM with rate limiting; that's
 * gone now, so this is just a deduped fan-out.
 */
export async function batchExtractTitles(
  rawTitles: string[]
): Promise<Map<string, AIExtractionResult>> {
  const results = new Map<string, AIExtractionResult>();
  const uniqueTitles = [...new Set(rawTitles)];

  for (const title of uniqueTitles) {
    if (isLikelyCleanTitle(title)) {
      results.set(title, await extractFilmTitle(title));
    } else {
      results.set(title, await extractFilmTitle(title));
    }
  }

  return results;
}

/** Clear the title cache. */
export function clearTitleCache(): void {
  titleCache.clear();
}
