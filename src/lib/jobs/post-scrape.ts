/**
 * Post-Scrape Enrichment — pure-Node job module.
 *
 * Extracted out of src/trigger/enrichment/post-scrape.ts so the same logic
 * runs locally (Bree scheduler, CLI, admin API) without any the cloud orchestrator
 * dependency. The trigger wrapper is now a thin shim that calls
 * runPostScrapeEnrichment().
 *
 * Triggered after a scraper run adds new screenings. Queries all under-enriched
 * films at the scraped cinema (missing TMDB, poster, Letterboxd, etc.) and runs
 * enrichment. Idempotent — catches both just-scraped and previously-missed films.
 */

import { db } from "@/db";
import { films, screenings } from "@/db/schema";
import { eq, isNull, and, gte } from "drizzle-orm";
import { generateTitleVariations, extractYearFromTitle } from "@/lib/enrichment/title-variations";
import { matchFilmToTMDB } from "@/lib/tmdb/match";
import { loadThresholdsAsync } from "@/lib/data-quality/load-thresholds";
import type { EnrichmentStatus, EnrichmentAttempt } from "@/types/enrichment";

const TMDB_SPACING_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function makeAttempt(success: boolean, prevAttempts: number, reason?: string): EnrichmentAttempt {
  return {
    lastAttempt: new Date().toISOString(),
    attempts: prevAttempts + 1,
    success,
    ...(reason ? { failureReason: reason } : {}),
  };
}

/** Persist a TMDB enrichment attempt (success or failure) to the film record. */
async function saveEnrichmentResult(
  filmId: string,
  currentStatus: EnrichmentStatus | null,
  success: boolean,
  options?: { tmdbId?: number | null; reason?: string },
): Promise<void> {
  const prevAttempts = currentStatus?.tmdbMatch?.attempts ?? 0;
  const updatedStatus: EnrichmentStatus = {
    ...(currentStatus ?? {}),
    tmdbMatch: makeAttempt(success, prevAttempts, options?.reason),
  };
  await db.update(films).set({
    ...(options?.tmdbId != null ? { tmdbId: options.tmdbId } : {}),
    enrichmentStatus: updatedStatus,
    updatedAt: new Date(),
  }).where(eq(films.id, filmId));
}

/** Check whether enrichment should be skipped based on backoff rules. */
function shouldSkipEnrichment(status: EnrichmentStatus | null, now: Date): boolean {
  if (!status?.tmdbMatch) return false;
  const lastAttempt = new Date(status.tmdbMatch.lastAttempt);
  const daysSince = (now.getTime() - lastAttempt.getTime()) / (1000 * 60 * 60 * 24);
  if (status.tmdbMatch.attempts >= 3 && daysSince < 7) return true;
  return daysSince < 1;
}

export interface PostScrapeEnrichmentPayload {
  cinemaId: string;
  cinemaName: string;
}

export interface PostScrapeEnrichmentResult {
  cinemaId: string;
  matched: number;
  skipped: number;
  failed: number;
}

/**
 * Pure-Node post-scrape enrichment. Callable from any context.
 */
export async function runPostScrapeEnrichment(
  payload: PostScrapeEnrichmentPayload,
): Promise<PostScrapeEnrichmentResult> {
  const { cinemaId, cinemaName } = payload;
  console.log(`[post-scrape-enrich] Starting for ${cinemaName} (${cinemaId})`);

  // Warm threshold cache from DB so TMDB matching uses AutoQuality-tuned values
  await loadThresholdsAsync();

  const now = new Date();

  // Find films at this cinema with upcoming screenings that lack TMDB match
  const unenrichedFilms = await db
    .select({
      filmId: films.id,
      filmTitle: films.title,
      tmdbId: films.tmdbId,
      posterUrl: films.posterUrl,
      enrichmentStatus: films.enrichmentStatus,
    })
    .from(films)
    .innerJoin(screenings, eq(screenings.filmId, films.id))
    .where(
      and(
        eq(screenings.cinemaId, cinemaId),
        gte(screenings.datetime, now),
        isNull(films.tmdbId),
      )
    )
    .groupBy(films.id, films.title, films.tmdbId, films.posterUrl, films.enrichmentStatus);

  if (unenrichedFilms.length === 0) {
    console.log(`[post-scrape-enrich] No unenriched films at ${cinemaName}`);
    return { cinemaId, matched: 0, skipped: 0, failed: 0 };
  }

  console.log(`[post-scrape-enrich] Found ${unenrichedFilms.length} unenriched films at ${cinemaName}`);

  let matched = 0;
  let skipped = 0;
  let failed = 0;

  for (const film of unenrichedFilms) {
    const status = film.enrichmentStatus;
    if (shouldSkipEnrichment(status, now)) {
      skipped++;
      continue;
    }

    // Generate title variations and try each
    const variations = generateTitleVariations(film.filmTitle);
    const yearHint = extractYearFromTitle(film.filmTitle);
    let matchFound = false;

    for (const variation of variations) {
      try {
        const match = await matchFilmToTMDB(variation, {
            year: yearHint ?? undefined,
            skipAmbiguityCheck: true,
          });
        if (match && (match.confidence ?? 0) >= 0.7) {
          await saveEnrichmentResult(film.filmId, status, true, { tmdbId: match.tmdbId });

          matched++;
          matchFound = true;
          console.log(`[post-scrape-enrich] Matched "${film.filmTitle}" → TMDB ${match.tmdbId} (via "${variation}")`);
          break;
        }
      } catch (err) {
        console.warn(`[post-scrape-enrich] TMDB search error for "${variation}":`, err);
      }

      await sleep(TMDB_SPACING_MS);
    }

    if (!matchFound) {
      await saveEnrichmentResult(film.filmId, status, false, {
        reason: `No match found across ${variations.length} variations`,
      });

      failed++;
    }
  }

  console.log(`[post-scrape-enrich] ${cinemaName}: matched=${matched}, skipped=${skipped}, failed=${failed}`);
  return { cinemaId, matched, skipped, failed };
}
