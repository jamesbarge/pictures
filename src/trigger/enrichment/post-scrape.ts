/**
 * Post-Scrape Enrichment Trigger
 *
 * Triggered after a scraper run adds new screenings. Queries all under-enriched
 * films at the scraped cinema (missing TMDB, poster, Letterboxd, etc.) and runs
 * enrichment. Idempotent — catches both just-scraped and previously-missed films.
 */

import { task } from "@trigger.dev/sdk/v3";
import { db } from "@/db";
import { films, screenings } from "@/db/schema";
import { eq, isNull, and, gte } from "drizzle-orm";
import { generateTitleVariations, extractYearFromTitle } from "@/lib/enrichment/title-variations";
import { matchFilmToTMDB } from "@/lib/tmdb/match";
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

export const postScrapeEnrichment = task({
  id: "enrichment-post-scrape",
  retry: { maxAttempts: 2 },
  run: async (payload: { cinemaId: string; cinemaName: string }) => {
    const { cinemaId, cinemaName } = payload;
    console.log(`[post-scrape-enrich] Starting for ${cinemaName} (${cinemaId})`);

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
      // Check backoff: skip if 3+ failed attempts in last 7 days
      const status = film.enrichmentStatus as EnrichmentStatus | null;
      if (status?.tmdbMatch) {
        const lastAttempt = new Date(status.tmdbMatch.lastAttempt);
        const daysSince = (now.getTime() - lastAttempt.getTime()) / (1000 * 60 * 60 * 24);
        if (status.tmdbMatch.attempts >= 3 && daysSince < 7) {
          skipped++;
          continue;
        }
        // Skip if attempted less than 24h ago
        if (daysSince < 1) {
          skipped++;
          continue;
        }
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
            // Update film with TMDB data
            const prevAttempts = status?.tmdbMatch?.attempts ?? 0;
            const updatedStatus: EnrichmentStatus = {
              ...(status ?? {}),
              tmdbMatch: makeAttempt(true, prevAttempts),
            };

            await db.update(films).set({
              tmdbId: match.tmdbId,
              enrichmentStatus: updatedStatus,
              updatedAt: new Date(),
            }).where(eq(films.id, film.filmId));

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
        // Record failed attempt with backoff tracking
        const prevAttempts = status?.tmdbMatch?.attempts ?? 0;
        const updatedStatus: EnrichmentStatus = {
          ...(status ?? {}),
          tmdbMatch: {
            lastAttempt: new Date().toISOString(),
            attempts: prevAttempts + 1,
            success: false,
            failureReason: `No match found across ${variations.length} variations`,
          },
        };

        await db.update(films).set({
          enrichmentStatus: updatedStatus,
          updatedAt: new Date(),
        }).where(eq(films.id, film.filmId));

        failed++;
      }
    }

    console.log(`[post-scrape-enrich] ${cinemaName}: matched=${matched}, skipped=${skipped}, failed=${failed}`);
    return { cinemaId, matched, skipped, failed };
  },
});
