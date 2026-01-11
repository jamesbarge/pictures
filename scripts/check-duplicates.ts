import { db } from "../src/db";
import { cinemas, screenings } from "../src/db/schema";
import { eq, sql } from "drizzle-orm";

async function checkAndCleanDuplicates() {
  const all = await db.select().from(cinemas);
  console.log("Total cinemas:", all.length);

  // Check for duplicates by name (normalized)
  const byName: Record<string, typeof all> = {};
  for (const c of all) {
    // Normalize: lowercase, remove "the ", remove "cinema"
    const key = c.name
      .toLowerCase()
      .replace(/^the\s+/, "")
      .replace(/\s+cinema$/, "")
      .trim();
    if (!byName[key]) byName[key] = [];
    byName[key].push(c);
  }

  console.log("\nDuplicates by normalized name:");
  const duplicateGroups: Array<{ key: string; cinemas: typeof all }> = [];

  for (const [name, list] of Object.entries(byName)) {
    if (list.length > 1) {
      duplicateGroups.push({ key: name, cinemas: list });
      console.log(`  ${name}:`);
      for (const c of list) {
        // Count screenings for this cinema
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(screenings)
          .where(eq(screenings.cinemaId, c.id));
        console.log(
          `    id=${c.id}, name=${c.name}, isActive=${c.isActive}, screenings=${count}`
        );
      }
    }
  }

  if (duplicateGroups.length === 0) {
    console.log("  (none)");
  }

  // If --fix flag is passed, clean up duplicates
  const shouldFix = process.argv.includes("--fix");

  if (duplicateGroups.length > 0 && shouldFix) {
    console.log("\n--- FIXING DUPLICATES ---\n");

    for (const group of duplicateGroups) {
      console.log(`Processing: ${group.key}`);

      // Get screening counts for each
      const withCounts = await Promise.all(
        group.cinemas.map(async (c) => {
          const [{ count }] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(screenings)
            .where(eq(screenings.cinemaId, c.id));
          return { ...c, screeningCount: count };
        })
      );

      // Sort by screenings (most first), then by id length (shorter is usually canonical)
      withCounts.sort((a, b) => {
        if (b.screeningCount !== a.screeningCount) {
          return b.screeningCount - a.screeningCount;
        }
        return a.id.length - b.id.length;
      });

      const primary = withCounts[0];
      const duplicates = withCounts.slice(1);

      console.log(`  Primary: ${primary.id} (${primary.screeningCount} screenings)`);

      for (const dup of duplicates) {
        console.log(`  Duplicate: ${dup.id} (${dup.screeningCount} screenings)`);

        if (dup.screeningCount > 0) {
          // Migrate screenings to primary
          console.log(`    Migrating ${dup.screeningCount} screenings to ${primary.id}...`);
          await db
            .update(screenings)
            .set({ cinemaId: primary.id })
            .where(eq(screenings.cinemaId, dup.id));
        }

        // Mark duplicate as inactive (safer than deleting)
        console.log(`    Marking ${dup.id} as inactive...`);
        await db
          .update(cinemas)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(cinemas.id, dup.id));
      }

      console.log(`  Done processing ${group.key}\n`);
    }

    console.log("Cleanup complete!");
  } else if (duplicateGroups.length > 0) {
    console.log("\nTo fix duplicates, run with --fix flag:");
    console.log("  npx tsx scripts/check-duplicates.ts --fix");
  }

  // Show summary
  console.log("\nAll cinemas (sorted by name):");
  const refreshed = await db.select().from(cinemas);
  refreshed
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((c) =>
      console.log(
        `  ${c.id.padEnd(25)} | ${c.name.padEnd(35)} | active=${c.isActive}`
      )
    );

  process.exit(0);
}

checkAndCleanDuplicates();

