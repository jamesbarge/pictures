/**
 * Film Data Quality Analysis Script
 *
 * Analyzes the database for:
 * 1. Films missing posters/images
 * 2. Films with festival/event prefixes in titles (not cleaned properly)
 * 3. Films without TMDB matches
 * 4. Duplicate films
 *
 * Run with: npx dotenv -e .env.local -- npx tsx -r tsconfig-paths/register src/scripts/analyze-film-data-quality.ts
 */

import { db } from "@/db";
import { films, screenings } from "@/db/schema";
import { gte } from "drizzle-orm";

// Patterns that indicate a title wasn't properly cleaned
const PROBLEMATIC_TITLE_PATTERNS = [
  // Festival patterns
  /\bFilm\s+Festival\s*:/i,
  /\bFest\s*:/i,
  /\bFestival\s*:/i,
  /^Anne['']s\s+Film\s+Festival/i,
  /^LSFF\s*:/i,
  /^LFF\s*:/i,
  /^BFI\s+Flare\s*:/i,
  /^Raindance\s*:/i,
  /^FrightFest\s*:/i,

  // Event series that should have been stripped
  /^Saturday\s+Morning\s+Picture\s+Club\s*:/i,
  /^Kids['']?\s*Club\s*:/i,
  /^Family\s+Film\s*:/i,
  /^Classic\s+Matinee\s*:/i,
  /^Varda\s+Film\s+Club\s*:/i,
  /^Arabic\s+Cinema\s+Club\s*:/i,
  /^The\s+Liberated\s+Film\s+Club\s*:/i,
  /^Queer\s+Horror\s+Nights\s*:/i,
  /^Drink\s+&\s+Dine\s*:/i,
  /^DINE\s+&\s+DRINK\s*:/i,
  /^Doc\s*['N\s]*Roll\s*:/i,
  /^Underscore\s+Cinema\s*:/i,

  // Premiere patterns
  /^UK\s+Premiere\s*[\|:]/i,
  /^World\s+Premiere\s*[\|:]/i,
  /^Preview\s*:/i,

  // Format prefixes
  /^35mm\s*:/i,
  /^70mm\s*:/i,
  /^4K\s*:/i,
  /^IMAX\s*:/i,

  // Live broadcasts that should be categorized differently
  /^Met\s+Opera\s+(Live|Encore)\s*:/i,
  /^National\s+Theatre\s+Live\s*:/i,
  /^NT\s+Live\s*:/i,
  /^Royal\s+(Opera|Ballet)\s*:/i,
  /^ROH\s+Live\s*:/i,

  // Double/triple bills not handled
  /Double[-\s]?Bill/i,
  /Triple[-\s]?Bill/i,
];

// Live broadcast patterns (should have contentType = "live_broadcast")
const LIVE_BROADCAST_PATTERNS = [
  /\bMet\s+Opera\b/i,
  /\bNational\s+Theatre\s+Live\b/i,
  /\bNT\s+Live\b/i,
  /\bRoyal\s+(Opera|Ballet)\b/i,
  /\bROH\s+Live\b/i,
  /\bBolshoi\s+Ballet\b/i,
  /\bBerliner\s+Philharmoniker\b/i,
  /\bExhibition\s+on\s+Screen\b/i,
];

interface AnalysisResult {
  totalFilms: number;
  filmsMissingPoster: number;
  filmsMissingTmdbId: number;
  filmsMissingYear: number;
  filmsMissingDirectors: number;
  problematicTitles: Array<{
    id: string;
    title: string;
    pattern: string;
    posterUrl: string | null;
    tmdbId: number | null;
  }>;
  liveBroadcastsMisclassified: Array<{
    id: string;
    title: string;
    contentType: string;
  }>;
  potentialDuplicates: Array<{
    title1: string;
    title2: string;
    year1: number | null;
    year2: number | null;
    id1: string;
    id2: string;
  }>;
  filmsWithoutUpcomingScreenings: number;
}

async function analyzeFilmDataQuality(): Promise<AnalysisResult> {
  console.log("🔍 Analyzing Film Data Quality...\n");

  // Get all films
  const allFilms = await db.select().from(films);
  console.log(`Total films in database: ${allFilms.length}`);

  // Count films missing posters
  const filmsMissingPoster = allFilms.filter(
    (f) => !f.posterUrl || f.posterUrl === ""
  );
  console.log(`Films missing posters: ${filmsMissingPoster.length}`);

  // Count films missing TMDB ID
  const filmsMissingTmdbId = allFilms.filter((f) => !f.tmdbId);
  console.log(`Films without TMDB ID: ${filmsMissingTmdbId.length}`);

  // Count films missing year
  const filmsMissingYear = allFilms.filter((f) => !f.year);
  console.log(`Films without year: ${filmsMissingYear.length}`);

  // Count films missing directors
  const filmsMissingDirectors = allFilms.filter(
    (f) => !f.directors || f.directors.length === 0
  );
  console.log(`Films without directors: ${filmsMissingDirectors.length}`);

  // Find problematic titles
  console.log("\n🔍 Checking for problematic titles...");
  const problematicTitles = [];
  for (const film of allFilms) {
    for (const pattern of PROBLEMATIC_TITLE_PATTERNS) {
      if (pattern.test(film.title)) {
        problematicTitles.push({
          id: film.id,
          title: film.title,
          pattern: pattern.source,
          posterUrl: film.posterUrl,
          tmdbId: film.tmdbId,
        });
        break; // Only count each film once
      }
    }
  }
  console.log(`Films with problematic titles: ${problematicTitles.length}`);

  // Find live broadcasts misclassified as films
  console.log("\n🔍 Checking for misclassified live broadcasts...");
  const liveBroadcastsMisclassified = [];
  for (const film of allFilms) {
    if (film.contentType === "film") {
      for (const pattern of LIVE_BROADCAST_PATTERNS) {
        if (pattern.test(film.title)) {
          liveBroadcastsMisclassified.push({
            id: film.id,
            title: film.title,
            contentType: film.contentType,
          });
          break;
        }
      }
    }
  }
  console.log(`Live broadcasts misclassified as films: ${liveBroadcastsMisclassified.length}`);

  // Find potential duplicates (same normalized title, same year)
  console.log("\n🔍 Checking for potential duplicates...");
  const potentialDuplicates = [];
  const titleMap = new Map<string, typeof allFilms>();

  for (const film of allFilms) {
    if (!film.year) continue;
    const normalized = film.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = `${normalized}_${film.year}`;

    if (!titleMap.has(key)) {
      titleMap.set(key, []);
    }
    titleMap.get(key)!.push(film);
  }

  for (const [, films] of titleMap) {
    if (films.length > 1) {
      for (let i = 0; i < films.length - 1; i++) {
        for (let j = i + 1; j < films.length; j++) {
          potentialDuplicates.push({
            title1: films[i].title,
            title2: films[j].title,
            year1: films[i].year,
            year2: films[j].year,
            id1: films[i].id,
            id2: films[j].id,
          });
        }
      }
    }
  }
  console.log(`Potential duplicate pairs: ${potentialDuplicates.length}`);

  // Count films without upcoming screenings
  console.log("\n🔍 Checking for orphaned films...");
  const now = new Date();
  const upcomingScreenings = await db
    .select({ filmId: screenings.filmId })
    .from(screenings)
    .where(gte(screenings.datetime, now));

  const filmsWithUpcomingScreenings = new Set(upcomingScreenings.map((s) => s.filmId));
  const filmsWithoutUpcomingScreenings = allFilms.filter(
    (f) => !filmsWithUpcomingScreenings.has(f.id)
  );
  console.log(`Films without upcoming screenings: ${filmsWithoutUpcomingScreenings.length}`);

  return {
    totalFilms: allFilms.length,
    filmsMissingPoster: filmsMissingPoster.length,
    filmsMissingTmdbId: filmsMissingTmdbId.length,
    filmsMissingYear: filmsMissingYear.length,
    filmsMissingDirectors: filmsMissingDirectors.length,
    problematicTitles,
    liveBroadcastsMisclassified,
    potentialDuplicates,
    filmsWithoutUpcomingScreenings: filmsWithoutUpcomingScreenings.length,
  };
}

function printDetailedResults(results: AnalysisResult) {
  console.log("\n" + "=".repeat(80));
  console.log("DETAILED ANALYSIS RESULTS");
  console.log("=".repeat(80));

  // Print problematic titles
  if (results.problematicTitles.length > 0) {
    console.log("\n🚨 PROBLEMATIC TITLES (need cleaning):");
    console.log("-".repeat(80));
    // Group by pattern for easier review
    const grouped = results.problematicTitles.reduce((acc, item) => {
      const pattern = item.pattern;
      if (!acc[pattern]) acc[pattern] = [];
      acc[pattern].push(item);
      return acc;
    }, {} as Record<string, typeof results.problematicTitles>);

    for (const [pattern, items] of Object.entries(grouped)) {
      console.log(`\nPattern: ${pattern}`);
      for (const item of items.slice(0, 5)) {
        const posterStatus = item.posterUrl ? "✓" : "✗";
        const tmdbStatus = item.tmdbId ? "✓" : "✗";
        console.log(`  [poster:${posterStatus} tmdb:${tmdbStatus}] "${item.title}"`);
      }
      if (items.length > 5) {
        console.log(`  ... and ${items.length - 5} more`);
      }
    }
  }

  // Print live broadcasts misclassified
  if (results.liveBroadcastsMisclassified.length > 0) {
    console.log("\n📺 LIVE BROADCASTS MISCLASSIFIED AS FILMS:");
    console.log("-".repeat(80));
    for (const item of results.liveBroadcastsMisclassified.slice(0, 20)) {
      console.log(`  "${item.title}"`);
    }
    if (results.liveBroadcastsMisclassified.length > 20) {
      console.log(`  ... and ${results.liveBroadcastsMisclassified.length - 20} more`);
    }
  }

  // Print potential duplicates
  if (results.potentialDuplicates.length > 0) {
    console.log("\n👯 POTENTIAL DUPLICATES:");
    console.log("-".repeat(80));
    for (const dup of results.potentialDuplicates.slice(0, 10)) {
      console.log(`  "${dup.title1}" (${dup.year1})`);
      console.log(`  "${dup.title2}" (${dup.year2})`);
      console.log(`  IDs: ${dup.id1} / ${dup.id2}\n`);
    }
    if (results.potentialDuplicates.length > 10) {
      console.log(`  ... and ${results.potentialDuplicates.length - 10} more`);
    }
  }

  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  console.log(`Total films:                    ${results.totalFilms}`);
  console.log(`Missing posters:                ${results.filmsMissingPoster} (${((results.filmsMissingPoster / results.totalFilms) * 100).toFixed(1)}%)`);
  console.log(`Missing TMDB ID:                ${results.filmsMissingTmdbId} (${((results.filmsMissingTmdbId / results.totalFilms) * 100).toFixed(1)}%)`);
  console.log(`Missing year:                   ${results.filmsMissingYear} (${((results.filmsMissingYear / results.totalFilms) * 100).toFixed(1)}%)`);
  console.log(`Problematic titles:             ${results.problematicTitles.length}`);
  console.log(`Misclassified live broadcasts:  ${results.liveBroadcastsMisclassified.length}`);
  console.log(`Potential duplicates:           ${results.potentialDuplicates.length}`);
  console.log(`Without upcoming screenings:    ${results.filmsWithoutUpcomingScreenings}`);
}

async function main() {
  try {
    const results = await analyzeFilmDataQuality();
    printDetailedResults(results);

    console.log("\n" + "=".repeat(80));
    console.log("RECOMMENDED ACTIONS");
    console.log("=".repeat(80));

    if (results.problematicTitles.length > 0) {
      console.log("\n1. Fix problematic titles:");
      console.log("   - Add missing event patterns to src/lib/title-patterns.ts");
      console.log("   - Run: npm run db:backfill-posters -- --limit=100");
    }

    if (results.filmsMissingPoster > 0) {
      console.log("\n2. Backfill missing posters:");
      console.log("   - Run: npm run db:backfill-posters");
      console.log("   - For dry run: npm run db:backfill-posters -- --dry-run");
    }

    if (results.filmsMissingTmdbId > 0) {
      console.log("\n3. Enrich films with TMDB data:");
      console.log("   - Run: npm run db:enrich");
    }

    if (results.liveBroadcastsMisclassified.length > 0) {
      console.log("\n4. Fix misclassified live broadcasts:");
      console.log("   - Update contentType to 'live_broadcast' for these films");
    }

    if (results.potentialDuplicates.length > 0) {
      console.log("\n5. Merge duplicate films:");
      console.log("   - Run: npm run db:check-duplicates");
      console.log("   - Run: npm run db:fix-duplicates");
    }

    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
