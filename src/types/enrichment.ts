/**
 * Enrichment status tracking types.
 *
 * Tracks per-enrichment-type attempts on films to enable intelligent retry
 * with backoff (skip films with 3+ failed attempts in 7 days).
 */

export interface EnrichmentAttempt {
  lastAttempt: string; // ISO datetime
  attempts: number;
  success: boolean;
  failureReason?: string;
}

export interface EnrichmentStatus {
  tmdbMatch?: EnrichmentAttempt;
  tmdbBackfill?: EnrichmentAttempt;
  letterboxd?: EnrichmentAttempt;
  poster?: EnrichmentAttempt;
  metadata?: EnrichmentAttempt;
}
