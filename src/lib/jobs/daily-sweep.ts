/**
 * Daily Enrichment Sweep — pure-Node job module.
 *
 * Extracted out of src/trigger/enrichment/daily-sweep.ts so the same logic
 * runs locally (Bree scheduler, CLI, admin API) without any the cloud orchestrator
 * dependency. The trigger wrapper is now a thin shim that calls runDailySweep().
 *
 * Processes under-enriched films with upcoming screenings:
 * 1. TMDB matching (films with no tmdbId)
 * 2. TMDB backfill (has tmdbId but missing poster/cast/synopsis)
 * 3. Letterboxd ratings
 * 4. Poster sourcing (still missing after TMDB)
 * 5. Data-quality cleanup (non-film detect, dodgy entries, learnings corrections)
 *
 * 30-minute time budget with early exit. Skips Mondays in scheduler mode.
 */

import { db } from "@/db";
import { films, screenings } from "@/db/schema";
import { eq, isNull, and, gte, isNotNull, sql } from "drizzle-orm";
import { generateTitleVariations, extractYearFromTitle } from "@/lib/enrichment/title-variations";
import { matchFilmToTMDB } from "@/lib/tmdb/match";
import { loadThresholdsAsync } from "@/lib/data-quality/load-thresholds";
import {
  runNonFilmDetection,
  detectDodgyEntries,
  applyKnownTmdbCorrections,
} from "@/lib/data-quality";
import { sendTelegramAlert } from "@/lib/telegram";
import type { EnrichmentStatus, EnrichmentAttempt } from "@/types/enrichment";

const TMDB_SPACING_MS = 250;
const TIME_BUDGET_MS = 30 * 60 * 1000; // 30 minutes

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

function shouldSkip(status: EnrichmentStatus | null, field: keyof EnrichmentStatus, now: Date): boolean {
  const attempt = status?.[field];
  if (!attempt) return false;
  if (attempt.success) return true;
  const lastAttempt = new Date(attempt.lastAttempt);
  const daysSince = (now.getTime() - lastAttempt.getTime()) / (1000 * 60 * 60 * 24);
  if (attempt.attempts >= 3 && daysSince < 7) return true;
  if (daysSince < 1) return true;
  return false;
}

function isTimeBudgetExceeded(startTime: number): boolean {
  return Date.now() - startTime >= TIME_BUDGET_MS;
}

async function updateEnrichmentStatus(
  filmId: string,
  currentStatus: EnrichmentStatus | null,
  field: keyof EnrichmentStatus,
  success: boolean,
  reason?: string,
  extraFields?: Record<string, unknown>,
): Promise<void> {
  const prevAttempts = currentStatus?.[field]?.attempts ?? 0;
  await db.update(films).set({
    ...extraFields,
    enrichmentStatus: {
      ...(currentStatus ?? {}),
      [field]: makeAttempt(success, prevAttempts, reason),
    },
    updatedAt: new Date(),
  }).where(eq(films.id, filmId));
}

export interface DailySweepOptions {
  /** Skip the Monday early-return guard (useful for manual / catch-up runs). */
  skipMondayGuard?: boolean;
}

export interface DailySweepResult {
  skipped?: boolean;
  reason?: string;
  letterboxdUrlsSet?: number;
  tmdbMatched?: number;
  tmdbBackfilled?: number;
  letterboxd?: number;
  posters?: number;
  tmdbSkipped?: number;
  tmdbFailed?: number;
  stillMissingTmdb?: number;
  stillMissingPoster?: number;
  nonFilmReclassified?: number;
  nonFilmDeleted?: number;
  tmdbCorrectionsApplied?: number;
  dodgyEntriesFlagged?: number;
  durationMinutes?: number;
}

/**
 * Pure-Node daily enrichment sweep. Callable from any context.
 *
 * Uses 30-min time budget with early exit between phases. Each phase is
 * independently try/catch-wrapped so a failure in one doesn't kill the run.
 */
export async function runDailySweep(options: DailySweepOptions = {}): Promise<DailySweepResult> {
  const startTime = Date.now();
  const now = new Date();

  if (!options.skipMondayGuard && now.getUTCDay() === 1) {
    console.log("[daily-sweep] Skipping — Monday, scrape-all orchestrator handles enrichment");
    return { skipped: true, reason: "monday_skip" };
  }

  console.log("[daily-sweep] Starting daily enrichment sweep");

  await loadThresholdsAsync();

  const stats = {
    letterboxdUrlsSet: 0,
    tmdbMatched: 0,
    tmdbBackfilled: 0,
    letterboxd: 0,
    posters: 0,
    tmdbSkipped: 0,
    tmdbFailed: 0,
  };

  // ───── Phase 0: Auto-set Letterboxd URLs ─────
  const needsLetterboxdUrl = await db
    .selectDistinct({ filmId: films.id, tmdbId: films.tmdbId })
    .from(films)
    .innerJoin(screenings, eq(screenings.filmId, films.id))
    .where(
      and(
        gte(screenings.datetime, now),
        isNotNull(films.tmdbId),
        isNull(films.letterboxdUrl),
      )
    );

  if (needsLetterboxdUrl.length > 0) {
    for (const film of needsLetterboxdUrl) {
      await db.update(films).set({
        letterboxdUrl: `https://letterboxd.com/tmdb/${film.tmdbId}`,
        updatedAt: new Date(),
      }).where(eq(films.id, film.filmId));
    }
    stats.letterboxdUrlsSet = needsLetterboxdUrl.length;
    console.log(`[daily-sweep] Phase 0: Set Letterboxd URLs for ${needsLetterboxdUrl.length} films`);
  }

  // ───── Phase 1: TMDB Matching ─────
  const unenrichedFilms = await db
    .selectDistinct({
      filmId: films.id,
      filmTitle: films.title,
      enrichmentStatus: films.enrichmentStatus,
    })
    .from(films)
    .innerJoin(screenings, eq(screenings.filmId, films.id))
    .where(and(gte(screenings.datetime, now), isNull(films.tmdbId)));

  console.log(`[daily-sweep] Phase 1: ${unenrichedFilms.length} films without TMDB match`);

  for (const film of unenrichedFilms) {
    if (isTimeBudgetExceeded(startTime)) {
      console.log("[daily-sweep] Time budget exceeded, stopping Phase 1");
      break;
    }
    const status = film.enrichmentStatus;
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
          await updateEnrichmentStatus(film.filmId, status, "tmdbMatch", true, undefined, {
            tmdbId: match.tmdbId,
          });
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
      await updateEnrichmentStatus(
        film.filmId, status, "tmdbMatch", false,
        `No match across ${variations.length} variations`,
      );
      stats.tmdbFailed++;
    }
  }

  // ───── Phase 2: TMDB Backfill ─────
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
          sql`(${films.posterUrl} IS NULL OR ${films.synopsis} IS NULL OR ${films.directors} = '{}')`,
        )
      );

    console.log(`[daily-sweep] Phase 2: ${needsBackfill.length} films needing TMDB backfill`);

    for (const film of needsBackfill) {
      if (isTimeBudgetExceeded(startTime)) {
        console.log("[daily-sweep] Time budget exceeded, stopping Phase 2");
        break;
      }
      const status = film.enrichmentStatus;
      if (shouldSkip(status, "tmdbBackfill", now)) continue;

      try {
        const { getTMDBClient } = await import("@/lib/tmdb/client");
        const client = getTMDBClient();
        const details = await client.getFullFilmData(film.tmdbId!);
        const updates: Record<string, unknown> = { updatedAt: new Date() };

        if (!film.filmTitle && details.details.title) updates.title = details.details.title;
        if (details.details.poster_path) {
          updates.posterUrl = `https://image.tmdb.org/t/p/w500${details.details.poster_path}`;
          stats.posters++;
        }
        if (details.details.overview) updates.synopsis = details.details.overview;
        if (details.directors.length > 0) updates.directors = details.directors;
        if (details.cast.length > 0) updates.cast = details.cast;
        if (details.details.genres.length > 0) {
          updates.genres = details.details.genres.map((g) => g.name.toLowerCase());
        }
        if (details.certification) updates.certification = details.certification;
        if (details.details.backdrop_path) {
          updates.backdropUrl = `https://image.tmdb.org/t/p/w1280${details.details.backdrop_path}`;
        }

        await updateEnrichmentStatus(film.filmId, status, "tmdbBackfill", true, undefined, updates);
        stats.tmdbBackfilled++;
        console.log(`[daily-sweep] Backfilled "${film.filmTitle}" from TMDB ${film.tmdbId}`);
      } catch (err) {
        console.warn(`[daily-sweep] Backfill error for "${film.filmTitle}":`, err);
        await updateEnrichmentStatus(film.filmId, status, "tmdbBackfill", false, String(err));
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
      .where(and(gte(screenings.datetime, now), isNull(films.posterUrl)));

    console.log(`[daily-sweep] Phase 4: ${needsPoster.length} films still missing posters`);

    for (const film of needsPoster) {
      if (isTimeBudgetExceeded(startTime)) {
        console.log("[daily-sweep] Time budget exceeded, stopping Phase 4");
        break;
      }
      const status = film.enrichmentStatus;
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
          await updateEnrichmentStatus(film.filmId, status, "poster", true, undefined, {
            posterUrl: result.url,
          });
          stats.posters++;
          console.log(`[daily-sweep] Poster found for "${film.filmTitle}" from ${result.source}`);
        } else {
          await updateEnrichmentStatus(film.filmId, status, "poster", false, "Only placeholder available");
        }
      } catch (err) {
        console.warn(`[daily-sweep] Poster search error for "${film.filmTitle}":`, err);
      }

      await sleep(TMDB_SPACING_MS);
    }
  }

  // ───── Phase 5: Data Quality Cleanup ─────
  const dq = {
    nonFilm: { scanned: 0, reclassified: 0, deleted: 0 },
    learnings: { scanned: 0, corrected: 0 },
    dodgyCount: 0,
  };

  if (!isTimeBudgetExceeded(startTime)) {
    try {
      dq.nonFilm = await runNonFilmDetection();
      console.log(
        `[daily-sweep] Phase 5a: scanned ${dq.nonFilm.scanned}, reclassified ${dq.nonFilm.reclassified}, deleted ${dq.nonFilm.deleted}`,
      );
    } catch (err) {
      console.warn("[daily-sweep] Non-film detection error:", err);
    }
  }

  if (!isTimeBudgetExceeded(startTime)) {
    try {
      const result = await applyKnownTmdbCorrections();
      dq.learnings = { scanned: result.scanned, corrected: result.corrected };
      console.log(
        `[daily-sweep] Phase 5b: applied ${result.corrected} TMDB corrections from learnings`,
      );
    } catch (err) {
      console.warn("[daily-sweep] Learnings TMDB correction error:", err);
    }
  }

  if (!isTimeBudgetExceeded(startTime)) {
    try {
      const dodgy = await detectDodgyEntries();
      dq.dodgyCount = dodgy.length;
      if (dodgy.length > 0) {
        console.log(`[daily-sweep] Phase 5c: ${dodgy.length} dodgy entries flagged`);
        for (const d of dodgy.slice(0, 10)) {
          console.log(`  • "${d.title}": ${d.reasons.join("; ")}`);
        }
      }
    } catch (err) {
      console.warn("[daily-sweep] Dodgy detection error:", err);
    }
  }

  // ───── Summary ─────
  const duration = Math.round((Date.now() - startTime) / 1000 / 60);

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
    `Non-film: ${dq.nonFilm.reclassified} reclassified, ${dq.nonFilm.deleted} deleted`,
    `TMDB corrections (learnings): ${dq.learnings.corrected}`,
    `Dodgy entries flagged: ${dq.dodgyCount}`,
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
    nonFilmReclassified: dq.nonFilm.reclassified,
    nonFilmDeleted: dq.nonFilm.deleted,
    tmdbCorrectionsApplied: dq.learnings.corrected,
    dodgyEntriesFlagged: dq.dodgyCount,
    durationMinutes: duration,
  };
}
