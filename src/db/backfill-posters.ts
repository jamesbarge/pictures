/**
 * Poster Backfill Script
 *
 * Intelligently recovers missing posters by:
 * 1. Extracting years from titles like "Solaris (1972)"
 * 2. Cleaning event prefixes like "DRINK & DINE: When Harry Met Sally..."
 * 3. Re-running TMDB matching with better hints
 * 4. Fetching posters from multiple sources
 *
 * Run with: npx dotenv -e .env.local -- npx tsx src/db/backfill-posters.ts
 *
 * Options:
 *   --dry-run    Show what would be updated without making changes
 *   --limit=N    Process only N films (for testing)
 *   --verbose    Show detailed logging
 */

import { db } from "./index";
import { films, screenings } from "./schema";
import { eq, isNull, or, and } from "drizzle-orm";
import { matchFilmToTMDB, getTMDBClient } from "@/lib/tmdb";
import { getPosterService } from "@/lib/posters";
import {
  decodeHtmlEntities,
  EVENT_PREFIX_REGEXES,
  FESTIVAL_PREFIXES,
  LIVE_BROADCAST_KEYWORDS,
  NON_FILM_PATTERNS,
  PRESENTS_PATTERN,
  TITLE_SUFFIXES,
} from "@/lib/title-patterns";
import { getKnownNonFilmType } from "@/scrapers/utils/film-title-cleaner";

// Parse CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const VERBOSE = args.includes("--verbose");
const limitArg = args.find(a => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1]) : undefined;

// ============================================================================
// Title Cleaning Patterns
// ============================================================================

// ============================================================================
// Title Processing Functions
// ============================================================================

export interface ProcessedTitle {
  cleanedTitle: string;
  extractedYear: number | null;
  isNonFilm: boolean;
  isLiveBroadcast: boolean;
  isCompilation: boolean;
  changes: string[];
}

/**
 * Process a film title to extract the underlying film and year
 */
export function processTitle(rawTitle: string): ProcessedTitle {
  let title = rawTitle.trim();
  const changes: string[] = [];
  let isLiveBroadcast = false;
  let isCompilation = false;

  // Check if this is a non-film event
  if (getKnownNonFilmType(title) || NON_FILM_PATTERNS.some((pattern) => pattern.test(title))) {
    return {
      cleanedTitle: title,
      extractedYear: null,
      isNonFilm: true,
      isLiveBroadcast: false,
      isCompilation: false,
      changes: ["Identified as non-film event"],
    };
  }

  // Decode HTML entities
  title = decodeHtmlEntities(title);

  // Extract from "presents" pattern: Funeral Parade presents "Caravaggio"
  const presentsMatch = title.match(PRESENTS_PATTERN);
  if (presentsMatch) {
    title = presentsMatch[1];
    changes.push("Extracted from 'presents' pattern");
  }

  // Strip event prefixes
  for (const prefix of EVENT_PREFIX_REGEXES) {
    if (prefix.test(title)) {
      // Check for live broadcast
      const normalized = title.toLowerCase();
      isLiveBroadcast = LIVE_BROADCAST_KEYWORDS.some((keyword) => normalized.includes(keyword));
      // Check for compilation
      isCompilation = FESTIVAL_PREFIXES.some((festival) => normalized.includes(festival.toLowerCase()));

      title = title.replace(prefix, "").trim();
      changes.push(`Stripped event prefix`);
      break;
    }
  }

  // Strip suffixes
  for (const suffix of TITLE_SUFFIXES) {
    if (suffix.test(title)) {
      title = title.replace(suffix, "").trim();
      changes.push("Stripped suffix");
    }
  }

  // Handle double features - extract first film
  // "The Gruffalo + The Gruffalo's Child Double-Bill" → "The Gruffalo"
  // "The Darjeeling Limited + Hotel Chevalier" → "The Darjeeling Limited"
  if (title.includes(" + ")) {
    const firstFilm = title.split(" + ")[0].trim();
    if (firstFilm.length > 3) {
      title = firstFilm;
      changes.push("Extracted first film from double feature");
    }
  }

  // Extract year from title - BEFORE cleaning year suffix
  // Patterns: "Film Name (1984)", "Film Name 1984"
  let extractedYear: number | null = null;

  // Pattern 1: Year in parentheses at end
  const yearParenMatch = title.match(/^(.+?)\s*\((\d{4})\)\s*$/);
  if (yearParenMatch) {
    const potentialYear = parseInt(yearParenMatch[2]);
    // Validate it's a reasonable film year (1880-2030)
    if (potentialYear >= 1880 && potentialYear <= 2030) {
      extractedYear = potentialYear;
      title = yearParenMatch[1].trim();
      changes.push(`Extracted year: ${extractedYear}`);
    }
  }

  // Pattern 2: Naked year at end (less common but used by some cinemas)
  if (!extractedYear) {
    const yearNakedMatch = title.match(/^(.+?)\s+(\d{4})\s*$/);
    if (yearNakedMatch) {
      const potentialYear = parseInt(yearNakedMatch[2]);
      if (potentialYear >= 1880 && potentialYear <= new Date().getFullYear()) {
        extractedYear = potentialYear;
        title = yearNakedMatch[1].trim();
        changes.push(`Extracted year from end: ${extractedYear}`);
      }
    }
  }

  // Calculate year from anniversary if we don't have one
  if (!extractedYear) {
    const anniversaryMatch = rawTitle.match(/(\d+)(?:th|st|nd|rd)?\s+Anniversary/i);
    if (anniversaryMatch) {
      const years = parseInt(anniversaryMatch[1]);
      const currentYear = new Date().getFullYear();
      extractedYear = currentYear - years;
      changes.push(`Calculated year from anniversary: ${extractedYear}`);
    }
  }

  // Clean up remaining artifacts
  title = title
    .replace(/\s+/g, " ")
    .replace(/^["'"']+|["'"']+$/g, "")  // Remove surrounding quotes
    .trim();

  return {
    cleanedTitle: title,
    extractedYear,
    isNonFilm: false,
    isLiveBroadcast,
    isCompilation,
    changes,
  };
}

// ============================================================================
// Main Backfill Logic
// ============================================================================

interface BackfillResult {
  filmId: string;
  originalTitle: string;
  cleanedTitle: string;
  extractedYear: number | null;
  previousTmdbId: number | null;
  newTmdbId: number | null;
  posterFound: boolean;
  posterSource: string | null;
  skipped: boolean;
  skipReason: string | null;
  merged: boolean;
  mergedIntoId: string | null;
}

/**
 * Find if a film with this TMDB ID already exists
 */
export async function findFilmByTmdbId(tmdbId: number): Promise<typeof films.$inferSelect | null> {
  const [existing] = await db
    .select()
    .from(films)
    .where(eq(films.tmdbId, tmdbId))
    .limit(1);
  return existing ?? null;
}

/**
 * Merge a duplicate film into the canonical film
 * Moves all screenings and deletes the duplicate
 */
export async function mergeDuplicateFilm(
  duplicateId: string,
  canonicalId: string,
  duplicateTitle: string,
  canonicalTitle: string,
  dryRun?: boolean
): Promise<number> {
  if (dryRun ?? DRY_RUN) {
    console.log(`  [DRY RUN] Would merge "${duplicateTitle}" into "${canonicalTitle}"`);
    return 0;
  }

  // Move all screenings from duplicate to canonical
  await db
    .update(screenings)
    .set({ filmId: canonicalId })
    .where(eq(screenings.filmId, duplicateId));

  // Delete the duplicate film
  await db.delete(films).where(eq(films.id, duplicateId));

  console.log(`  ✓ Merged "${duplicateTitle}" → "${canonicalTitle}"`);
  return 1; // Simplified - we don't track exact count
}

async function backfillPosters(): Promise<void> {
  console.log("🎬 Poster Backfill Script");
  console.log("=".repeat(60));
  if (DRY_RUN) console.log("⚠️  DRY RUN MODE - No changes will be made\n");

  // Find films that need attention
  const filmsToProcess = await db
    .select()
    .from(films)
    .where(
      or(
        // Films without posters
        isNull(films.posterUrl),
        eq(films.posterUrl, ""),
        // Films without TMDB ID (might find better matches)
        and(
          isNull(films.tmdbId),
          or(isNull(films.posterUrl), eq(films.posterUrl, ""))
        )
      )
    )
    .limit(LIMIT ?? 1000);

  console.log(`Found ${filmsToProcess.length} films to process\n`);

  const results: BackfillResult[] = [];
  const stats = {
    processed: 0,
    postersFound: 0,
    tmdbMatched: 0,
    merged: 0,
    skippedNonFilm: 0,
    skippedLiveBroadcast: 0,
    skippedCompilation: 0,
    failed: 0,
  };

  const tmdbClient = getTMDBClient();
  const posterService = getPosterService();

  for (const film of filmsToProcess) {
    stats.processed++;

    // Process the title
    const processed = processTitle(film.title);

    if (VERBOSE) {
      console.log(`\n[${stats.processed}/${filmsToProcess.length}] "${film.title}"`);
      if (processed.changes.length > 0) {
        console.log(`  Changes: ${processed.changes.join(", ")}`);
        console.log(`  Cleaned: "${processed.cleanedTitle}"`);
      }
    }

    // Skip non-films
    if (processed.isNonFilm) {
      stats.skippedNonFilm++;
      results.push({
        filmId: film.id,
        originalTitle: film.title,
        cleanedTitle: processed.cleanedTitle,
        extractedYear: null,
        previousTmdbId: film.tmdbId,
        newTmdbId: null,
        posterFound: false,
        posterSource: null,
        skipped: true,
        skipReason: "Non-film event",
        merged: false,
        mergedIntoId: null,
      });
      if (VERBOSE) console.log(`  ⏭️  Skipped: Non-film event`);
      continue;
    }

    // Skip compilations (unless they already have TMDB ID)
    if (processed.isCompilation && !film.tmdbId) {
      stats.skippedCompilation++;
      results.push({
        filmId: film.id,
        originalTitle: film.title,
        cleanedTitle: processed.cleanedTitle,
        extractedYear: null,
        previousTmdbId: film.tmdbId,
        newTmdbId: null,
        posterFound: false,
        posterSource: null,
        skipped: true,
        skipReason: "Festival compilation",
        merged: false,
        mergedIntoId: null,
      });
      if (VERBOSE) console.log(`  ⏭️  Skipped: Festival compilation`);
      continue;
    }

    // Use extracted year or existing year
    const yearHint = processed.extractedYear ?? film.year ?? undefined;
    const directorHint = film.directors?.[0];

    let newTmdbId: number | null = film.tmdbId;
    let posterUrl: string | null = film.posterUrl;
    let posterSource: string | null = null;
    let wasMerged = false;
    let mergedIntoId: string | null = null;

    try {
      // If no TMDB ID, try to match
      if (!film.tmdbId) {
        const match = await matchFilmToTMDB(processed.cleanedTitle, {
          year: yearHint,
          director: directorHint,
          skipAmbiguityCheck: true, // We're backfilling, be more aggressive
        });

        if (match) {
          newTmdbId = match.tmdbId;
          stats.tmdbMatched++;

          if (VERBOSE) {
            console.log(`  ✓ TMDB match: ${match.title} (${match.year}) [${(match.confidence * 100).toFixed(0)}%]`);
          }

          // Check if another film already has this TMDB ID (duplicate detection)
          const existingFilm = await findFilmByTmdbId(match.tmdbId);

          if (existingFilm) {
            // This is a duplicate! Merge instead of update
            await mergeDuplicateFilm(film.id, existingFilm.id, film.title, existingFilm.title);
            wasMerged = true;
            mergedIntoId = existingFilm.id;
            posterUrl = existingFilm.posterUrl; // Use the canonical film's poster
            posterSource = "merged";
            stats.merged++;
            if (existingFilm.posterUrl) stats.postersFound++; // Count as found since the canonical has it

            results.push({
              filmId: film.id,
              originalTitle: film.title,
              cleanedTitle: processed.cleanedTitle,
              extractedYear: processed.extractedYear,
              previousTmdbId: film.tmdbId,
              newTmdbId: match.tmdbId,
              posterFound: !!existingFilm.posterUrl,
              posterSource: "merged",
              skipped: false,
              skipReason: null,
              merged: true,
              mergedIntoId: existingFilm.id,
            });
            continue; // Move to next film
          }

          // No duplicate - get full details and update
          const details = await tmdbClient.getFullFilmData(match.tmdbId);

          if (details.details.poster_path) {
            posterUrl = `https://image.tmdb.org/t/p/w500${details.details.poster_path}`;
            posterSource = "tmdb";
          }

          // Update film with TMDB data (if not dry run)
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
                directors: details.directors.length > 0 ? details.directors : film.directors,
                genres: details.details.genres.map((g) => g.name.toLowerCase()),
                synopsis: details.details.overview || film.synopsis,
                posterUrl: posterUrl || film.posterUrl,
                backdropUrl: details.details.backdrop_path
                  ? `https://image.tmdb.org/t/p/w1280${details.details.backdrop_path}`
                  : film.backdropUrl,
                tmdbRating: details.details.vote_average,
                tmdbPopularity: details.details.popularity,
                matchStrategy: "backfill-with-year",
                matchConfidence: match.confidence,
                matchedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(films.id, film.id));
          }
        }
      }

      // If still no poster, try poster service
      if (!posterUrl && newTmdbId) {
        const posterResult = await posterService.findPoster({
          title: processed.cleanedTitle,
          year: yearHint,
          tmdbId: newTmdbId,
          imdbId: film.imdbId ?? undefined,
          contentType: film.contentType ?? "film",
          scraperPosterUrl: film.sourceImageUrl ?? undefined,
        });

        if (posterResult.source !== "placeholder") {
          posterUrl = posterResult.url;
          posterSource = posterResult.source;

          if (!DRY_RUN) {
            await db
              .update(films)
              .set({
                posterUrl,
                updatedAt: new Date(),
              })
              .where(eq(films.id, film.id));
          }
        }
      }

      // Also try poster service without TMDB for live broadcasts
      if (!posterUrl && processed.isLiveBroadcast) {
        const posterResult = await posterService.findPoster({
          title: processed.cleanedTitle,
          year: yearHint,
          contentType: "live_broadcast",
          scraperPosterUrl: film.sourceImageUrl ?? undefined,
        });

        if (posterResult.source !== "placeholder") {
          posterUrl = posterResult.url;
          posterSource = posterResult.source;

          if (!DRY_RUN) {
            await db
              .update(films)
              .set({
                posterUrl,
                updatedAt: new Date(),
              })
              .where(eq(films.id, film.id));
          }
        }
      }

      if (posterUrl && posterUrl !== film.posterUrl) {
        stats.postersFound++;
        if (VERBOSE) console.log(`  ✓ Poster found: ${posterSource?.toUpperCase()}`);
      }

      results.push({
        filmId: film.id,
        originalTitle: film.title,
        cleanedTitle: processed.cleanedTitle,
        extractedYear: processed.extractedYear,
        previousTmdbId: film.tmdbId,
        newTmdbId,
        posterFound: !!posterUrl && posterUrl !== film.posterUrl,
        posterSource,
        skipped: false,
        skipReason: null,
        merged: wasMerged,
        mergedIntoId,
      });

    } catch (error) {
      stats.failed++;
      console.error(`  ✗ Error processing "${film.title}":`, error);
      results.push({
        filmId: film.id,
        originalTitle: film.title,
        cleanedTitle: processed.cleanedTitle,
        extractedYear: processed.extractedYear,
        previousTmdbId: film.tmdbId,
        newTmdbId: null,
        posterFound: false,
        posterSource: null,
        skipped: false,
        skipReason: `Error: ${error}`,
        merged: false,
        mergedIntoId: null,
      });
    }

    // Rate limiting
    await new Promise((r) => setTimeout(r, 300));
  }

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("BACKFILL SUMMARY");
  console.log("=".repeat(60));
  console.log(`Processed:           ${stats.processed}`);
  console.log(`New TMDB matches:    ${stats.tmdbMatched}`);
  console.log(`Duplicates merged:   ${stats.merged}`);
  console.log(`Posters found:       ${stats.postersFound}`);
  console.log(`Skipped (non-film):  ${stats.skippedNonFilm}`);
  console.log(`Skipped (broadcast): ${stats.skippedLiveBroadcast}`);
  console.log(`Skipped (compile):   ${stats.skippedCompilation}`);
  console.log(`Failed:              ${stats.failed}`);

  // Show some examples of what was processed
  const successfulMatches = results.filter(r => r.posterFound);
  if (successfulMatches.length > 0) {
    console.log("\n📸 Sample successful matches:");
    for (const r of successfulMatches.slice(0, 10)) {
      console.log(`  "${r.originalTitle}"`);
      if (r.cleanedTitle !== r.originalTitle) {
        console.log(`    → Cleaned: "${r.cleanedTitle}"`);
      }
      if (r.extractedYear) {
        console.log(`    → Year: ${r.extractedYear}`);
      }
      console.log(`    → Poster: ${r.posterSource?.toUpperCase()}`);
    }
  }

  // Show films that still need attention
  const stillMissing = results.filter(r => !r.posterFound && !r.skipped);
  if (stillMissing.length > 0) {
    console.log(`\n⚠️  ${stillMissing.length} films still need posters:`);
    for (const r of stillMissing.slice(0, 15)) {
      console.log(`  - "${r.originalTitle}" (cleaned: "${r.cleanedTitle}")`);
    }
    if (stillMissing.length > 15) {
      console.log(`  ... and ${stillMissing.length - 15} more`);
    }
  }

  if (DRY_RUN) {
    console.log("\n⚠️  This was a DRY RUN. Run without --dry-run to apply changes.");
  }
}

// Only run when executed directly (not when imported)
import { fileURLToPath } from "url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  backfillPosters()
    .then(() => {
      console.log("\n✅ Backfill complete!");
      process.exit(0);
    })
    .catch((err) => {
      console.error("\n❌ Backfill failed:", err);
      process.exit(1);
    });
}
