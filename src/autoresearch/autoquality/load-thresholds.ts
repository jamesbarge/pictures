/**
 * Shared threshold loader for the data quality pipeline.
 *
 * Provides both sync (cached/bundled) and async (DB-first) loading.
 * The audit scripts and AutoQuality harness both use this to get thresholds.
 *
 * Load priority:
 *   1. In-process cache (if already loaded)
 *   2. Database `autoresearch_config` row (async only)
 *   3. Filesystem `thresholds.json` (local dev)
 *   4. Bundled JSON import (Trigger.dev cloud fallback)
 */

import { readFileSync } from "fs";
import { join } from "path";

// Static import ensures esbuild bundles the JSON for Trigger.dev cloud,
// where __dirname + readFileSync won't find the file on the ephemeral filesystem.
import defaultThresholds from "./thresholds.json";

const THRESHOLDS_PATH = join(__dirname, "thresholds.json");

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

let cachedThresholds: Thresholds | null = null;

/**
 * Load thresholds synchronously (cached/bundled).
 * Used by code paths that can't be async (e.g. countDodgyFilms in audit-wrapper).
 * Prefers cached value if `loadThresholdsAsync` was called earlier.
 */
export function loadThresholds(): Thresholds {
  if (cachedThresholds) return cachedThresholds;
  return reloadThresholds();
}

/**
 * Load thresholds with DB awareness.
 * Checks the database first (picks up AutoQuality's learned improvements),
 * then falls back to sync loading if DB is unavailable.
 */
export async function loadThresholdsAsync(): Promise<Thresholds> {
  try {
    // Dynamic import to avoid circular deps and keep sync paths fast
    const { loadThresholdsFromDb } = await import("./db-thresholds");
    const thresholds = await loadThresholdsFromDb();
    cachedThresholds = thresholds;
    return thresholds;
  } catch {
    // DB not available — fall back to sync loading
    return loadThresholds();
  }
}

/**
 * Force re-read thresholds from disk. Used after manual edits in local dev.
 */
export function reloadThresholds(): Thresholds {
  try {
    const raw = readFileSync(THRESHOLDS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    delete parsed.$comment;
    cachedThresholds = parsed as Thresholds;
  } catch {
    // Trigger.dev cloud: __dirname doesn't have the JSON file — use bundled import
    const copy = { ...defaultThresholds } as Record<string, unknown>;
    delete copy.$comment;
    cachedThresholds = copy as unknown as Thresholds;
  }
  return cachedThresholds;
}

/**
 * Update the in-process cache (e.g. after DB write).
 */
export function setCachedThresholds(thresholds: Thresholds): void {
  cachedThresholds = thresholds;
}
