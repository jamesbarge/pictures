/**
 * Comprehensive Poster Audit & Fix Script
 *
 * Systematically finds and fills missing poster images across all films.
 *
 * 5 Phases:
 *   1. Audit — categorize films by poster/tmdbId status
 *   2. TMDB Direct Fetch — films with tmdbId but no poster
 *   3. TMDB Match — films without tmdbId, try matching + poster
 *   4. Web Image Search — Letterboxd, booking pages, Wikipedia fallback
 *   5. Report — summary + manual attention list
 *
 * Usage:
 *   npm run poster:audit
 *   npm run poster:audit -- --dry-run --limit=20
 *   npm run poster:audit -- --phase=2 --verbose
 *   npm run poster:audit -- --upcoming-only --json
 */

import { db } from "@/db";
import { films, screenings } from "@/db/schema";
import { eq, gte, and, count } from "drizzle-orm";
import { getTMDBClient, matchFilmToTMDB } from "@/lib/tmdb";
import { getPosterService } from "@/lib/posters";
import { isImageAccessible } from "@/lib/image-processor";
import { processTitle, findFilmByTmdbId, mergeDuplicateFilm } from "@/db/backfill-posters";
import { fetchLetterboxdPoster } from "@/agents/fallback-enrichment/letterboxd";
import {
  scrapeBookingPage,
  extractFilmDataFromBookingPage,
} from "@/agents/fallback-enrichment/booking-page-scraper";
import type { FilmSelect } from "@/db/schema/films";

// ============================================================================
// CLI Arguments
// ============================================================================

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const VERBOSE = args.includes("--verbose");
const UPCOMING_ONLY = args.includes("--upcoming-only");
const JSON_OUTPUT = args.includes("--json");
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1]) : undefined;
const phaseArg = args.find((a) => a.startsWith("--phase="));
const PHASE_ONLY = phaseArg ? parseInt(phaseArg.split("=")[1]) : undefined;

// ============================================================================
// Types
// ============================================================================

interface AuditResult {
  groupA: FilmWithScreeningCount[]; // has tmdbId, missing poster
  groupB: FilmWithScreeningCount[]; // no tmdbId, missing poster
  alreadyHasPoster: number;
  total: number;
}

interface FilmWithScreeningCount extends FilmSelect {
  upcomingScreenings: number;
}

interface PhaseResult {
  fixed: number;
  skipped: number;
  merged: number;
  failed: number;
  remaining: FilmWithScreeningCount[]; // films still missing posters
}

// ============================================================================
// Helpers
// ============================================================================

function log(msg: string): void {
  if (!JSON_OUTPUT) console.log(msg);
}

function verbose(msg: string): void {
  if (VERBOSE && !JSON_OUTPUT) console.log(msg);
}

async function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function updateFilmPoster(
  filmId: string,
  posterUrl: string
): Promise<void> {
  if (DRY_RUN) return;
  await db
    .update(films)
    .set({ posterUrl, updatedAt: new Date() })
    .where(eq(films.id, filmId));
}

/**
 * Fetch Wikipedia page summary image for a film
 */
async function fetchWikipediaPoster(
  title: string,
  year?: number | null
): Promise<string | null> {
  const searchTitle = year ? `${title} (${year} film)` : `${title} (film)`;
  const encoded = encodeURIComponent(searchTitle);

  try {
    const response = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
      {
        headers: { "User-Agent": "PicturesLondon/1.0 (poster-audit)" },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!response.ok) {
      // Try without disambiguation suffix
      if (year) {
        const fallback = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title + " film")}`,
          {
            headers: { "User-Agent": "PicturesLondon/1.0 (poster-audit)" },
            signal: AbortSignal.timeout(8000),
          }
        );
        if (!fallback.ok) return null;
        const data = await fallback.json();
        return data.originalimage?.source || data.thumbnail?.source || null;
      }
      return null;
    }

    const data = await response.json();
    return data.originalimage?.source || data.thumbnail?.source || null;
  } catch {
    return null;
  }
}

// ============================================================================
// Phase 1: Audit
// ============================================================================

async function phase1Audit(): Promise<AuditResult> {
  log("\n📊 Phase 1: Audit");
  log("─".repeat(60));

  const now = new Date();

  // Get all films with upcoming screening counts
  const allFilms = await db
    .select({
      film: films,
      upcomingScreenings: count(screenings.id),
    })
    .from(films)
    .leftJoin(
      screenings,
      and(
        eq(screenings.filmId, films.id),
        gte(screenings.datetime, now)
      )
    )
    .groupBy(films.id);

  const filmsWithCounts: FilmWithScreeningCount[] = allFilms.map((row) => ({
    ...row.film,
    upcomingScreenings: Number(row.upcomingScreenings),
  }));

  // Categorize
  const groupA: FilmWithScreeningCount[] = [];
  const groupB: FilmWithScreeningCount[] = [];
  let alreadyHasPoster = 0;

  for (const film of filmsWithCounts) {
    const hasPoster = film.posterUrl && film.posterUrl !== "";
    if (hasPoster) {
      alreadyHasPoster++;
      continue;
    }

    if (film.tmdbId) {
      groupA.push(film);
    } else {
      groupB.push(film);
    }
  }

  // Sort by upcoming screenings (most first) for priority
  groupA.sort((a, b) => b.upcomingScreenings - a.upcomingScreenings);
  groupB.sort((a, b) => b.upcomingScreenings - a.upcomingScreenings);

  // Apply filters
  let filteredA = UPCOMING_ONLY
    ? groupA.filter((f) => f.upcomingScreenings > 0)
    : groupA;
  let filteredB = UPCOMING_ONLY
    ? groupB.filter((f) => f.upcomingScreenings > 0)
    : groupB;

  if (LIMIT) {
    filteredA = filteredA.slice(0, LIMIT);
    filteredB = filteredB.slice(0, LIMIT);
  }

  log(`Total films:              ${filmsWithCounts.length}`);
  log(`Already have poster:      ${alreadyHasPoster}`);
  log(`Group A (has tmdbId):     ${filteredA.length}${groupA.length !== filteredA.length ? ` (of ${groupA.length})` : ""}`);
  log(`Group B (no tmdbId):      ${filteredB.length}${groupB.length !== filteredB.length ? ` (of ${groupB.length})` : ""}`);

  const withUpcoming = [...filteredA, ...filteredB].filter(
    (f) => f.upcomingScreenings > 0
  );
  log(
    `With upcoming screenings: ${withUpcoming.length}`
  );

  return {
    groupA: filteredA,
    groupB: filteredB,
    alreadyHasPoster,
    total: filmsWithCounts.length,
  };
}

// ============================================================================
// Phase 2: TMDB Direct Fetch (Group A — has tmdbId, missing poster)
// ============================================================================

async function phase2TmdbDirect(
  filmsToProcess: FilmWithScreeningCount[]
): Promise<PhaseResult> {
  log("\n🎬 Phase 2: TMDB Direct Fetch");
  log("─".repeat(60));
  log(`Processing ${filmsToProcess.length} films with tmdbId but no poster`);

  const result: PhaseResult = {
    fixed: 0,
    skipped: 0,
    merged: 0,
    failed: 0,
    remaining: [],
  };

  if (filmsToProcess.length === 0) return result;

  const tmdbClient = getTMDBClient();

  for (let i = 0; i < filmsToProcess.length; i++) {
    const film = filmsToProcess[i];
    verbose(
      `  [${i + 1}/${filmsToProcess.length}] "${film.title}" (tmdbId: ${film.tmdbId})`
    );

    try {
      const details = await tmdbClient.getFilmDetails(film.tmdbId!);

      if (details.poster_path) {
        const posterUrl = `https://image.tmdb.org/t/p/w500${details.poster_path}`;

        if (await isImageAccessible(posterUrl)) {
          await updateFilmPoster(film.id, posterUrl);
          result.fixed++;
          verbose(`    ✓ Poster found via TMDB`);
        } else {
          verbose(`    ✗ TMDB poster URL not accessible`);
          result.remaining.push(film);
        }
      } else {
        verbose(`    ✗ No poster_path on TMDB`);
        result.remaining.push(film);
      }
    } catch (error) {
      verbose(`    ✗ Error: ${error}`);
      result.failed++;
      result.remaining.push(film);
    }

    await delay(250);
  }

  log(`  Fixed: ${result.fixed} | Failed: ${result.failed} | Remaining: ${result.remaining.length}`);
  return result;
}

// ============================================================================
// Phase 3: TMDB Match (Group B — no tmdbId, try matching)
// ============================================================================

async function phase3TmdbMatch(
  filmsToProcess: FilmWithScreeningCount[]
): Promise<PhaseResult> {
  log("\n🔍 Phase 3: TMDB Match");
  log("─".repeat(60));
  log(`Processing ${filmsToProcess.length} films without tmdbId`);

  const result: PhaseResult = {
    fixed: 0,
    skipped: 0,
    merged: 0,
    failed: 0,
    remaining: [],
  };

  if (filmsToProcess.length === 0) return result;

  const tmdbClient = getTMDBClient();

  for (let i = 0; i < filmsToProcess.length; i++) {
    const film = filmsToProcess[i];
    const processed = processTitle(film.title);

    verbose(
      `  [${i + 1}/${filmsToProcess.length}] "${film.title}"${processed.cleanedTitle !== film.title ? ` → "${processed.cleanedTitle}"` : ""}`
    );

    // Skip non-film events, live broadcasts, compilations
    if (processed.isNonFilm || processed.isLiveBroadcast || processed.isCompilation) {
      const reason = processed.isNonFilm
        ? "non-film"
        : processed.isLiveBroadcast
          ? "live broadcast"
          : "compilation";
      verbose(`    ⏭ Skipped: ${reason}`);
      result.skipped++;
      continue;
    }

    const yearHint = processed.extractedYear ?? film.year ?? undefined;
    const directorHint = film.directors?.[0];

    try {
      const match = await matchFilmToTMDB(processed.cleanedTitle, {
        year: yearHint,
        director: directorHint,
        skipAmbiguityCheck: true,
      });

      if (!match) {
        verbose(`    ✗ No TMDB match`);
        result.remaining.push(film);
        await delay(300);
        continue;
      }

      verbose(
        `    ✓ TMDB match: "${match.title}" (${match.year}) [${(match.confidence * 100).toFixed(0)}%]`
      );

      // Check for duplicate tmdbId
      const existingFilm = await findFilmByTmdbId(match.tmdbId);
      if (existingFilm) {
        // Merge into canonical film
        await mergeDuplicateFilm(
          film.id,
          existingFilm.id,
          film.title,
          existingFilm.title,
          DRY_RUN
        );
        result.merged++;
        if (existingFilm.posterUrl) result.fixed++;
        verbose(
          `    ↗ Merged into "${existingFilm.title}" (${existingFilm.posterUrl ? "has poster" : "no poster"})`
        );
        await delay(300);
        continue;
      }

      // Fetch full data + poster
      const details = await tmdbClient.getFullFilmData(match.tmdbId);
      let posterUrl: string | null = null;

      if (details.details.poster_path) {
        posterUrl = `https://image.tmdb.org/t/p/w500${details.details.poster_path}`;
      }

      if (!DRY_RUN) {
        await db
          .update(films)
          .set({
            tmdbId: match.tmdbId,
            imdbId: details.details.imdb_id || film.imdbId,
            title: details.details.title,
            originalTitle: details.details.original_title,
            year: match.year,
            runtime: details.details.runtime || film.runtime,
            directors:
              details.directors.length > 0
                ? details.directors
                : film.directors,
            genres: details.details.genres.map((g) => g.name.toLowerCase()),
            synopsis: details.details.overview || film.synopsis,
            posterUrl: posterUrl || film.posterUrl,
            backdropUrl: details.details.backdrop_path
              ? `https://image.tmdb.org/t/p/w1280${details.details.backdrop_path}`
              : film.backdropUrl,
            tmdbRating: details.details.vote_average,
            matchStrategy: "poster-audit-match",
            matchConfidence: match.confidence,
            matchedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(films.id, film.id));
      }

      if (posterUrl) {
        result.fixed++;
        verbose(`    ✓ Poster found via TMDB match`);
      } else {
        result.remaining.push({ ...film, tmdbId: match.tmdbId });
        verbose(`    ✗ TMDB match found but no poster`);
      }
    } catch (error) {
      verbose(`    ✗ Error: ${error}`);
      result.failed++;
      result.remaining.push(film);
    }

    await delay(300);
  }

  log(
    `  Fixed: ${result.fixed} | Merged: ${result.merged} | Skipped: ${result.skipped} | Failed: ${result.failed} | Remaining: ${result.remaining.length}`
  );
  return result;
}

// ============================================================================
// Phase 4: Web Image Search (Escalating fallback chain)
// ============================================================================

async function phase4WebSearch(
  filmsToProcess: FilmWithScreeningCount[]
): Promise<PhaseResult> {
  log("\n🌐 Phase 4: Web Image Search");
  log("─".repeat(60));
  log(`Processing ${filmsToProcess.length} films through web fallback chain`);

  const result: PhaseResult = {
    fixed: 0,
    skipped: 0,
    merged: 0,
    failed: 0,
    remaining: [],
  };

  if (filmsToProcess.length === 0) return result;

  const posterService = getPosterService();

  for (let i = 0; i < filmsToProcess.length; i++) {
    const film = filmsToProcess[i];
    const processed = processTitle(film.title);
    const cleanTitle = processed.cleanedTitle;
    const yearHint = processed.extractedYear ?? film.year ?? undefined;
    let posterUrl: string | null = null;
    let source: string | null = null;

    verbose(
      `  [${i + 1}/${filmsToProcess.length}] "${film.title}"`
    );

    // 4a: PosterService (OMDB + Fanart.tv)
    try {
      const posterResult = await posterService.findPoster({
        title: cleanTitle,
        year: yearHint,
        tmdbId: film.tmdbId ?? undefined,
        imdbId: film.imdbId ?? undefined,
        contentType: film.contentType ?? "film",
        scraperPosterUrl: film.sourceImageUrl ?? undefined,
      });

      if (posterResult.source !== "placeholder") {
        posterUrl = posterResult.url;
        source = posterResult.source;
        verbose(`    ✓ Found via PosterService (${posterResult.source})`);
      }
    } catch (error) {
      verbose(`    ✗ PosterService error: ${error}`);
    }

    // 4b: Letterboxd poster
    if (!posterUrl) {
      try {
        await delay(1000); // Letterboxd needs more spacing
        const lbResult = await fetchLetterboxdPoster(cleanTitle, yearHint);
        if (lbResult) {
          if (await isImageAccessible(lbResult.posterUrl)) {
            posterUrl = lbResult.posterUrl;
            source = "letterboxd";
            verbose(`    ✓ Found via Letterboxd`);
          }
        }
      } catch (error) {
        verbose(`    ✗ Letterboxd error: ${error}`);
      }
    }

    // 4c: Booking page OG image (only for films with upcoming screenings)
    if (!posterUrl && film.upcomingScreenings > 0) {
      try {
        // Get the most recent screening's booking URL
        const [screening] = await db
          .select({ bookingUrl: screenings.bookingUrl })
          .from(screenings)
          .where(
            and(
              eq(screenings.filmId, film.id),
              gte(screenings.datetime, new Date())
            )
          )
          .limit(1);

        if (screening?.bookingUrl) {
          await delay(500);
          const pageData = await scrapeBookingPage(screening.bookingUrl);
          if (pageData) {
            const extracted = extractFilmDataFromBookingPage(pageData);
            if (
              extracted.posterUrl &&
              (await isImageAccessible(extracted.posterUrl))
            ) {
              posterUrl = extracted.posterUrl;
              source = "booking_page";
              verbose(`    ✓ Found via booking page`);
            }
          }
        }
      } catch (error) {
        verbose(`    ✗ Booking page error: ${error}`);
      }
    }

    // 4d: Wikipedia REST API
    if (!posterUrl) {
      try {
        await delay(500);
        const wikiImage = await fetchWikipediaPoster(cleanTitle, yearHint);
        if (wikiImage && (await isImageAccessible(wikiImage))) {
          posterUrl = wikiImage;
          source = "wikipedia";
          verbose(`    ✓ Found via Wikipedia`);
        }
      } catch (error) {
        verbose(`    ✗ Wikipedia error: ${error}`);
      }
    }

    // Save result
    if (posterUrl) {
      await updateFilmPoster(film.id, posterUrl);
      result.fixed++;
      verbose(`    → Saved poster from ${source}`);
    } else {
      result.remaining.push(film);
      verbose(`    ✗ No poster found from any source`);
    }

    await delay(500);
  }

  log(
    `  Fixed: ${result.fixed} | Failed: ${result.failed} | Remaining: ${result.remaining.length}`
  );
  return result;
}

// ============================================================================
// Phase 5: Report
// ============================================================================

interface FullReport {
  audit: AuditResult;
  phase2: PhaseResult;
  phase3: PhaseResult;
  phase4: PhaseResult;
  manualAttention: Array<{
    id: string;
    title: string;
    upcomingScreenings: number;
    hasTmdbId: boolean;
  }>;
}

function phase5Report(
  audit: AuditResult,
  phase2: PhaseResult,
  phase3: PhaseResult,
  phase4: PhaseResult
): void {
  log("\n📋 Phase 5: Report");
  log("═".repeat(60));
  log("POSTER AUDIT SUMMARY");
  log("═".repeat(60));

  log(`\nDatabase Overview:`);
  log(`  Total films:            ${audit.total}`);
  log(`  Already had poster:     ${audit.alreadyHasPoster}`);
  log(`  Missing poster:         ${audit.groupA.length + audit.groupB.length}`);

  log(`\nPhase 2 — TMDB Direct Fetch:`);
  log(`  Fixed:     ${phase2.fixed}`);
  log(`  Failed:    ${phase2.failed}`);

  log(`\nPhase 3 — TMDB Match:`);
  log(`  Fixed:     ${phase3.fixed}`);
  log(`  Merged:    ${phase3.merged}`);
  log(`  Skipped:   ${phase3.skipped}`);
  log(`  Failed:    ${phase3.failed}`);

  log(`\nPhase 4 — Web Image Search:`);
  log(`  Fixed:     ${phase4.fixed}`);
  log(`  Failed:    ${phase4.failed}`);

  const totalFixed = phase2.fixed + phase3.fixed + phase4.fixed;
  const totalMerged = phase3.merged;
  log(`\nTotals:`);
  log(`  Posters found:   ${totalFixed}`);
  log(`  Duplicates merged: ${totalMerged}`);

  // Films still needing attention
  const allRemaining = phase4.remaining;
  if (allRemaining.length > 0) {
    log(`\n⚠️  ${allRemaining.length} films still need posters:`);
    const sorted = allRemaining.sort(
      (a, b) => b.upcomingScreenings - a.upcomingScreenings
    );

    for (const film of sorted.slice(0, 20)) {
      const upcoming =
        film.upcomingScreenings > 0
          ? ` [${film.upcomingScreenings} upcoming]`
          : "";
      log(`  - "${film.title}"${upcoming}`);
    }
    if (sorted.length > 20) {
      log(`  ... and ${sorted.length - 20} more`);
    }
  }

  if (DRY_RUN) {
    log(
      "\n⚠️  This was a DRY RUN. Run without --dry-run to apply changes."
    );
  }

  // JSON output for programmatic use
  if (JSON_OUTPUT) {
    const report: FullReport = {
      audit,
      phase2,
      phase3,
      phase4,
      manualAttention: allRemaining.map((f) => ({
        id: f.id,
        title: f.title,
        upcomingScreenings: f.upcomingScreenings,
        hasTmdbId: !!f.tmdbId,
      })),
    };
    console.log(JSON.stringify(report, null, 2));
  }
}

// ============================================================================
// Main Orchestrator
// ============================================================================

async function main(): Promise<void> {
  log("🖼️  Poster Audit & Fix");
  log("═".repeat(60));
  if (DRY_RUN) log("⚠️  DRY RUN MODE — no changes will be written\n");
  if (PHASE_ONLY) log(`Running phase ${PHASE_ONLY} only\n`);

  // Phase 1: Audit (always runs)
  const audit = await phase1Audit();

  // Initialize empty results for skipped phases
  let phase2Result: PhaseResult = {
    fixed: 0,
    skipped: 0,
    merged: 0,
    failed: 0,
    remaining: audit.groupA,
  };
  let phase3Result: PhaseResult = {
    fixed: 0,
    skipped: 0,
    merged: 0,
    failed: 0,
    remaining: audit.groupB,
  };
  let phase4Result: PhaseResult = {
    fixed: 0,
    skipped: 0,
    merged: 0,
    failed: 0,
    remaining: [],
  };

  // Phase 2: TMDB Direct Fetch
  if (!PHASE_ONLY || PHASE_ONLY === 2) {
    phase2Result = await phase2TmdbDirect(audit.groupA);
  }

  // Phase 3: TMDB Match
  if (!PHASE_ONLY || PHASE_ONLY === 3) {
    phase3Result = await phase3TmdbMatch(audit.groupB);
  }

  // Phase 4: Web Image Search (collects remaining from phases 2 + 3)
  if (!PHASE_ONLY || PHASE_ONLY === 4) {
    const phase4Queue = [...phase2Result.remaining, ...phase3Result.remaining];
    phase4Result = await phase4WebSearch(phase4Queue);
  }

  // Phase 5: Report (always runs)
  phase5Report(audit, phase2Result, phase3Result, phase4Result);
}

// Run
main()
  .then(() => {
    log("\n✅ Poster audit complete!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Poster audit failed:", err);
    process.exit(1);
  });
