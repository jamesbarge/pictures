/**
 * Season Cleanup Script
 *
 * Removes junk seasons that are scraper artefacts, events (not seasons),
 * or TV programmes that shouldn't appear as film seasons.
 *
 * Run with:
 *   npx tsx src/db/cleanup-seasons.ts           # Dry run - see what would be deleted
 *   npx tsx src/db/cleanup-seasons.ts --execute  # Actually delete
 */

import { db } from "@/db";
import { seasons, seasonFilms } from "@/db/schema";
import { inArray } from "drizzle-orm";

/**
 * Season names to delete — scraper artefacts, events, or TV programmes
 */
const JUNK_SEASON_NAMES = [
  "Find out more",
  "London Short Film Festival 2026",
  "Valentine's Day",
  "The World of Black Film Weekend",
  "Magic Rays of Light: Early Television",
  "Constructed, Told, Spoken: A Counter-History of Britain on TV",
  "Restored Special: Gamera Trilogy in 4K",
];

async function cleanupJunkSeasons() {
  console.log("Finding junk seasons to remove...\n");

  // Find matching seasons
  const junkSeasons = await db
    .select({ id: seasons.id, name: seasons.name })
    .from(seasons)
    .where(inArray(seasons.name, JUNK_SEASON_NAMES));

  console.log(`Found ${junkSeasons.length} junk seasons:\n`);
  for (const s of junkSeasons) {
    console.log(`  - "${s.name}" (${s.id.slice(0, 8)}...)`);
  }

  if (junkSeasons.length === 0) {
    console.log("No junk seasons found — already clean.");
    return;
  }

  const isDryRun = !process.argv.includes("--execute");

  if (isDryRun) {
    console.log(
      "\nDRY RUN — No changes made. Run with --execute to delete."
    );
    return;
  }

  // Delete season_films first (cascade should handle this, but be explicit)
  const seasonIds = junkSeasons.map((s) => s.id);
  await db.delete(seasonFilms).where(inArray(seasonFilms.seasonId, seasonIds));

  // Delete seasons
  await db.delete(seasons).where(inArray(seasons.id, seasonIds));

  console.log(`\nDeleted ${junkSeasons.length} junk seasons.`);
}

cleanupJunkSeasons()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
