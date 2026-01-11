/**
 * Enrich seasons with TMDB director data
 *
 * Finds seasons that have a directorName but no directorTmdbId,
 * searches TMDB for the director, and updates the season.
 *
 * Usage: npm run db:enrich-directors
 */

import { db } from "./index";
import { seasons } from "./schema";
import { eq, isNull, isNotNull, and } from "drizzle-orm";
import { getTMDBClient, TMDBClient } from "@/lib/tmdb";

interface EnrichmentResult {
  total: number;
  enriched: number;
  failed: number;
  skipped: number;
}

async function enrichDirectors(): Promise<EnrichmentResult> {
  console.log("🎬 Enriching seasons with TMDB director data...\n");

  const client = getTMDBClient();

  // Find seasons with directorName but no directorTmdbId
  const seasonsToEnrich = await db
    .select()
    .from(seasons)
    .where(
      and(isNotNull(seasons.directorName), isNull(seasons.directorTmdbId))
    );

  console.log(`Found ${seasonsToEnrich.length} seasons to enrich\n`);

  if (seasonsToEnrich.length === 0) {
    console.log("No seasons need director enrichment.");
    return { total: 0, enriched: 0, failed: 0, skipped: 0 };
  }

  let enriched = 0;
  let failed = 0;
  let skipped = 0;

  // Group by director name to avoid duplicate TMDB lookups
  const directorCache = new Map<string, number | null>();

  for (const season of seasonsToEnrich) {
    const directorName = season.directorName!;

    try {
      console.log(`Processing: "${season.name}" (${directorName})...`);

      // Check cache first
      let directorId: number | null;

      if (directorCache.has(directorName)) {
        directorId = directorCache.get(directorName)!;
        console.log(`  Using cached TMDB ID: ${directorId || "not found"}`);
      } else {
        // Search TMDB for director
        directorId = await client.findDirectorId(directorName);
        directorCache.set(directorName, directorId);

        if (directorId) {
          // Get director details for logging
          const details = await client.getPersonDetails(directorId);
          console.log(`  Found: ${details.name} (TMDB ID: ${directorId})`);
          console.log(
            `  Known for: ${details.known_for_department}, Born: ${details.birthday || "unknown"}`
          );
        } else {
          console.log(`  ✗ No TMDB match found for "${directorName}"\n`);
          failed++;
          continue;
        }

        // Rate limiting - TMDB allows 40 requests per 10 seconds
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      if (!directorId) {
        console.log(`  ✗ Skipping (director not in TMDB)\n`);
        skipped++;
        continue;
      }

      // Update the season with director TMDB ID
      await db
        .update(seasons)
        .set({
          directorTmdbId: directorId,
          updatedAt: new Date(),
        })
        .where(eq(seasons.id, season.id));

      console.log(`  ✓ Updated season with director TMDB ID ${directorId}\n`);
      enriched++;
    } catch (error) {
      console.error(`  ✗ Error: ${error}\n`);
      failed++;
    }
  }

  return {
    total: seasonsToEnrich.length,
    enriched,
    failed,
    skipped,
  };
}

async function main() {
  const result = await enrichDirectors();

  console.log("\n========================================");
  console.log("Director Enrichment Summary");
  console.log("========================================");
  console.log(`Total seasons processed: ${result.total}`);
  console.log(`Successfully enriched:   ${result.enriched}`);
  console.log(`Failed:                  ${result.failed}`);
  console.log(`Skipped (cached miss):   ${result.skipped}`);
  console.log("========================================\n");

  process.exit(result.failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
