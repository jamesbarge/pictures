/**
 * Static threshold loader for the data quality pipeline.
 *
 * Previously tuned by the AutoQuality harness (retired 2026-05-03 —
 * Stream 7 found zero net DQS movement across 30 experiments). The DB-first
 * loading path and the in-process cache invalidation pattern have both been
 * removed; the bundled JSON is now the only source of truth.
 *
 * If you need to adjust a threshold, edit `thresholds.json` directly and
 * commit it. There is no longer any code path that mutates this state.
 */

import thresholds from "./thresholds.json";

export interface Thresholds {
  tmdb: {
    minTitleSimilarity: number;
    titleSimilarityWeight: number;
    competitorThresholdRatio: number;
    minMatchConfidence: number;
    yearMatchPenaltyRecovery: number;
  };
  duplicateDetection: {
    trigramSimilarityThreshold: number;
  };
  dodgyDetection: {
    maxTitleLength: number;
    minYear: number;
    maxYear: number;
    maxRuntime: number;
  };
  nonFilmDetection: {
    maxPatternsPerCategory: number;
  };
  safetyFloors: {
    minAutoMergeSimilarity: number;
    minTmdbConfidence: number;
    maxNewNonFilmPatterns: number;
  };
}

const STATIC_THRESHOLDS: Thresholds = (() => {
  const copy = { ...thresholds } as Record<string, unknown>;
  delete copy.$comment;
  return copy as unknown as Thresholds;
})();

/** Return the static thresholds. Synchronous, no I/O. */
export function loadThresholds(): Thresholds {
  return STATIC_THRESHOLDS;
}

/** Same as loadThresholds — kept as an alias for the few callers that used the async variant. */
export async function loadThresholdsAsync(): Promise<Thresholds> {
  return STATIC_THRESHOLDS;
}
