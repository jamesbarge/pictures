/**
 * Shared threshold loader for the data quality pipeline.
 *
 * Loads tunable thresholds from thresholds.json so that both the audit
 * scripts and the AutoQuality harness use the same values. When AutoQuality
 * modifies thresholds.json, the next audit run picks up the changes.
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
 * Load thresholds from thresholds.json.
 * Caches on first load for the process lifetime.
 * Call `reloadThresholds()` to force a re-read (e.g. after AutoQuality modifies the file).
 */
export function loadThresholds(): Thresholds {
  if (cachedThresholds) return cachedThresholds;
  return reloadThresholds();
}

/**
 * Force re-read thresholds from disk. Used by AutoQuality after modifying the file.
 */
export function reloadThresholds(): Thresholds {
  try {
    const raw = readFileSync(THRESHOLDS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    delete parsed.$comment;
    cachedThresholds = parsed as Thresholds;
  } catch {
    // Trigger.dev cloud: __dirname doesn't have the JSON file — use bundled import
    const { $comment: _, ...rest } = defaultThresholds;
    cachedThresholds = rest as unknown as Thresholds;
  }
  return cachedThresholds;
}
