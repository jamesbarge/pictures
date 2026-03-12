/**
 * Daily Enrichment Sweep
 *
 * Scheduled at 4:30am UTC daily (avoids 3am Monday orchestrator, 6am QA pipeline).
 * Processes under-enriched films with upcoming screenings in priority order:
 * 1. TMDB matching (films with no tmdbId)
 * 2. TMDB backfill (has tmdbId but missing poster/cast/synopsis)
 * 3. Letterboxd (has letterboxdUrl but no rating)
 * 4. Poster sourcing (still missing after TMDB)
 *
 * Skips Mondays (full orchestrator handles it).
 * 30-minute time budget with early exit.
 */

import { schedules } from "@trigger.dev/sdk/v3";
import { db } from "@/db";
import { films, screenings } from "@/db/schema";
import { eq, isNull, and, gte, isNotNull, sql } from "drizzle-orm";
import { generateTitleVariations, extractYearFromTitle } from "@/lib/enrichment/title-variations";
import { matchFilmToTMDB } from "@/lib/tmdb/match";
import { sendTelegramAlert } from "../utils/telegram";
import type { EnrichmentStatus, EnrichmentAttempt } from "@/types/enrichment";

const TMDB_SPACING_MS = 250;
const TIME_BUDGET_MS = 30 * 60 * 1000; // 30 minutes

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function makeAttempt(success: boolean, reason?: string): EnrichmentAttempt {
  return {
    lastAttempt: new Date().toISOString(),
    attempts: 1,
    success,
    ...(reason ? { failureReason: reason } : {}),
  };
}

function shouldSkip(status: EnrichmentStatus | null, field: keyof EnrichmentStatus, now: Date): boolean {
  const attempt = status?.[field];
  if (!attempt) return false;

  const lastAttempt = new Date(attempt.lastAttempt);
  const daysSince = (now.getTime() - lastAttempt.getTime()) / (1000 * 60 * 60 * 24);

  // Skip if 3+ failed attempts in last 7 days
  if (attempt.attempts >= 3 && daysSince < 7) return true;
  // Skip if attempted less than 24h ago
  if (daysSince < 1) return true;

  return false;
}

function isTimeBudgetExceeded(startTime: number): boolean {
  return Date.now() - startTime >= TIME_BUDGET_MS;
}

export const dailyEnrichmentSweep = schedules.task({
  id: "enrichment-daily-sweep",
  cron: "30 4 * * *", // 4:30am UTC daily
  retry: { maxAttempts: 1 },
  run: async () => {
    const startTime = Date.now();
    const now = new Date();

    // Skip Mondays — scrape-all orchestrator runs at 3am UTC
    if (now.getUTCDay() === 1) {
      console.log("[daily-sweep] Skipping — Monday, scrape-all orchestrator handles enrichment");
      return { skipped: true, reason: "monday_skip" };
    }

    console.log("[daily-sweep] Starting daily enrichment sweep");

    const stats = {
      tmdbMatched: 0,
      tmdbBackfilled: 0,
      letterboxd: 0,
      posters: 0,
      tmdbSkipped: 0,
      tmdbFailed: 0,
    };

    // ───── Phase 1: TMDB Matching ─────
    // Films with upcoming screenings that lack a TMDB match
    const unenrichedFilms = await db
      .selectDistinct({
        filmId: films.id,
        filmTitle: films.title,
        enrichmentStatus: films.enrichmentStatus,
      })
      .from(films)
      .innerJoin(screenings, eq(screenings.filmId, films.id))
      .where(
        and(
          gte(screenings.datetime, now),
          isNull(films.tmdbId),
        )
      );

    console.log(`[daily-sweep] Phase 1: ${unenrichedFilms.length} films without TMDB match`);

    for (const film of unenrichedFilms) {
      if (isTimeBudgetExceeded(startTime)) {
        console.log("[daily-sweep] Time budget exceeded, stopping Phase 1");
        break;
      }

      const status = film.enrichmentStatus as EnrichmentStatus | null;
      if (shouldSkip(status, "tmdbMatch", now)) {
        stats.tmdbSkipped++;
        continue;
      }

      const variations = generateTitleVariations(film.filmTitle);
      const yearHint = extractYearFromTitle(film.filmTitle);
      let matchFound = false;

      for (const variation of variations) {
        try {
          const match = await matchFilmToTMDB(variation, {
            year: yearHint ?? undefined,
            skipAmbiguityCheck: true,
          });

          if (match && match.confidence >= 0.7) {
            const updatedStatus: EnrichmentStatus = {
              ...(status ?? {}),
              tmdbMatch: makeAttempt(true),
            };

            await db.update(films).set({
              tmdbId: match.tmdbId,
              enrichmentStatus: updatedStatus,
              updatedAt: new Date(),
            }).where(eq(films.id, film.filmId));

            stats.tmdbMatched++;
            matchFound = true;
            console.log(`[daily-sweep] Matched "${film.filmTitle}" → TMDB ${match.tmdbId}`);
            break;
          }
        } catch (err) {
          console.warn(`[daily-sweep] TMDB error for "${variation}":`, err);
        }

        await sleep(TMDB_SPACING_MS);
      }

      if (!matchFound) {
        const prevAttempts = status?.tmdbMatch?.attempts ?? 0;
        const updatedStatus: EnrichmentStatus = {
          ...(status ?? {}),
          tmdbMatch: {
            lastAttempt: new Date().toISOString(),
            attempts: prevAttempts + 1,
            success: false,
            failureReason: `No match across ${variations.length} variations`,
          },
        };

        await db.update(films).set({
          enrichmentStatus: updatedStatus,
          updatedAt: new Date(),
        }).where(eq(films.id, film.filmId));

        stats.tmdbFailed++;
      }
    }

    // ───── Phase 2: TMDB Backfill ─────
    // Films with tmdbId but missing key metadata (poster, synopsis, cast)
    if (!isTimeBudgetExceeded(startTime)) {
      const needsBackfill = await db
        .selectDistinct({
          filmId: films.id,
          filmTitle: films.title,
          tmdbId: films.tmdbId,
          enrichmentStatus: films.enrichmentStatus,
        })
        .from(films)
        .innerJoin(screenings, eq(screenings.filmId, films.id))
        .where(
          and(
            gte(screenings.datetime, now),
            isNotNull(films.tmdbId),
            // Missing poster OR synopsis OR empty directors
            sql`(${films.posterUrl} IS NULL OR ${films.synopsis} IS NULL OR ${films.directors} = '{}')`,
          )
        );

      console.log(`[daily-sweep] Phase 2: ${needsBackfill.length} films needing TMDB backfill`);

      for (const film of needsBackfill) {
        if (isTimeBudgetExceeded(startTime)) {
          console.log("[daily-sweep] Time budget exceeded, stopping Phase 2");
          break;
        }

        const status = film.enrichmentStatus as EnrichmentStatus | null;
        if (shouldSkip(status, "tmdbBackfill", now)) continue;

        try {
          // Dynamic import to keep task registry lightweight
          const { getTMDBClient } = await import("@/lib/tmdb/client");
          const client = getTMDBClient();
          const details = await client.getFullFilmData(film.tmdbId!);

          const updates: Record<string, unknown> = { updatedAt: new Date() };

          if (!film.filmTitle && details.details.title) {
            updates.title = details.details.title;
          }
          if (details.details.poster_path) {
            updates.posterUrl = `https://image.tmdb.org/t/p/w500${details.details.poster_path}`;
            stats.posters++;
          }
          if (details.details.overview) {
            updates.synopsis = details.details.overview;
          }
          if (details.directors.length > 0) {
            updates.directors = details.directors;
          }
          if (details.cast.length > 0) {
            updates.cast = details.cast;
          }
          if (details.details.genres.length > 0) {
            updates.genres = details.details.genres.map((g) => g.name.toLowerCase());
          }
          if (details.certification) {
            updates.certification = details.certification;
          }
          if (details.details.backdrop_path) {
            updates.backdropUrl = `https://image.tmdb.org/t/p/w1280${details.details.backdrop_path}`;
          }

          const updatedStatus: EnrichmentStatus = {
            ...(status ?? {}),
            tmdbBackfill: makeAttempt(true),
          };
          updates.enrichmentStatus = updatedStatus;

          await db.update(films).set(updates).where(eq(films.id, film.filmId));
          stats.tmdbBackfilled++;
          console.log(`[daily-sweep] Backfilled "${film.filmTitle}" from TMDB ${film.tmdbId}`);
        } catch (err) {
          console.warn(`[daily-sweep] Backfill error for "${film.filmTitle}":`, err);

          const prevAttempts = status?.tmdbBackfill?.attempts ?? 0;
          const updatedStatus: EnrichmentStatus = {
            ...(status ?? {}),
            tmdbBackfill: {
              lastAttempt: new Date().toISOString(),
              attempts: prevAttempts + 1,
              success: false,
              failureReason: String(err),
            },
          };
          await db.update(films).set({
            enrichmentStatus: updatedStatus,
            updatedAt: new Date(),
          }).where(eq(films.id, film.filmId));
        }

        await sleep(TMDB_SPACING_MS);
      }
    }

    // ───── Phase 3: Letterboxd Ratings ─────
    if (!isTimeBudgetExceeded(startTime)) {
      try {
        const { enrichLetterboxdRatings } = await import("@/db/enrich-letterboxd");
        const letterboxdResult = await enrichLetterboxdRatings(50, true);
        stats.letterboxd = letterboxdResult.enriched ?? 0;
        console.log(`[daily-sweep] Phase 3: Letterboxd enriched ${stats.letterboxd} films`);
      } catch (err) {
        console.warn("[daily-sweep] Letterboxd enrichment error:", err);
      }
    }

    // ───── Phase 4: Poster Sourcing ─────
    // Films with tmdbId but still no poster (TMDB had none)
    if (!isTimeBudgetExceeded(startTime)) {
      const needsPoster = await db
        .selectDistinct({
          filmId: films.id,
          filmTitle: films.title,
          year: films.year,
          imdbId: films.imdbId,
          tmdbId: films.tmdbId,
          enrichmentStatus: films.enrichmentStatus,
        })
        .from(films)
        .innerJoin(screenings, eq(screenings.filmId, films.id))
        .where(
          and(
            gte(screenings.datetime, now),
            isNull(films.posterUrl),
          )
        );

      console.log(`[daily-sweep] Phase 4: ${needsPoster.length} films still missing posters`);

      for (const film of needsPoster) {
        if (isTimeBudgetExceeded(startTime)) {
          console.log("[daily-sweep] Time budget exceeded, stopping Phase 4");
          break;
        }

        const status = film.enrichmentStatus as EnrichmentStatus | null;
        if (shouldSkip(status, "poster", now)) continue;

        try {
          const { getPosterService } = await import("@/lib/posters");
          const posterService = getPosterService();
          const result = await posterService.findPoster({
            title: film.filmTitle,
            year: film.year ?? undefined,
            imdbId: film.imdbId ?? undefined,
            tmdbId: film.tmdbId ?? undefined,
          });

          if (result.source !== "placeholder") {
            await db.update(films).set({
              posterUrl: result.url,
              enrichmentStatus: {
                ...(status ?? {}),
                poster: makeAttempt(true),
              },
              updatedAt: new Date(),
            }).where(eq(films.id, film.filmId));

            stats.posters++;
            console.log(`[daily-sweep] Poster found for "${film.filmTitle}" from ${result.source}`);
          } else {
            const prevAttempts = status?.poster?.attempts ?? 0;
            await db.update(films).set({
              enrichmentStatus: {
                ...(status ?? {}),
                poster: {
                  lastAttempt: new Date().toISOString(),
                  attempts: prevAttempts + 1,
                  success: false,
                  failureReason: "Only placeholder available",
                },
              },
              updatedAt: new Date(),
            }).where(eq(films.id, film.filmId));
          }
        } catch (err) {
          console.warn(`[daily-sweep] Poster search error for "${film.filmTitle}":`, err);
        }

        await sleep(TMDB_SPACING_MS);
      }
    }

    // ───── Summary ─────
    const duration = Math.round((Date.now() - startTime) / 1000 / 60);

    // Count remaining gaps
    const [{ count: stillMissingTmdb }] = await db
      .select({ count: sql<number>`count(distinct ${films.id})` })
      .from(films)
      .innerJoin(screenings, eq(screenings.filmId, films.id))
      .where(and(gte(screenings.datetime, now), isNull(films.tmdbId)));

    const [{ count: stillMissingPoster }] = await db
      .select({ count: sql<number>`count(distinct ${films.id})` })
      .from(films)
      .innerJoin(screenings, eq(screenings.filmId, films.id))
      .where(and(gte(screenings.datetime, now), isNull(films.posterUrl)));

    const summary = [
      `TMDB matched: ${stats.tmdbMatched} new, ${stats.tmdbBackfilled} backfilled`,
      `Letterboxd: ${stats.letterboxd} rated`,
      `Posters: ${stats.posters} found`,
      `TMDB skipped (backoff): ${stats.tmdbSkipped}, failed: ${stats.tmdbFailed}`,
      `Still missing: ${stillMissingTmdb} TMDB, ${stillMissingPoster} poster`,
      `Duration: ${duration}min`,
    ].join("\n");

    console.log(`[daily-sweep] Complete:\n${summary}`);

    await sendTelegramAlert({
      title: "Enrichment Sweep Complete",
      message: summary,
      level: "info",
    });

    return {
      ...stats,
      stillMissingTmdb: Number(stillMissingTmdb),
      stillMissingPoster: Number(stillMissingPoster),
      durationMinutes: duration,
    };
  },
});
