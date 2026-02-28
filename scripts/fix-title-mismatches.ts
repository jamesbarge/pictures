/**
 * Fix film title mismatches found in audit.
 *
 * Run: npx dotenv -e .env.local -- npx tsx scripts/fix-title-mismatches.ts
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Checking mismatched film titles...\n");

  const ids = [
    "98266aa4-012d-4c28-add8-1ec3630b049d", // "All You Need Is Kill" vs "All You Need is Kill"
    "5ecb21ad-fc28-43dd-bfc2-20fd7edef25f", // "Wuthering Heights" with extra quotes
    "9611ad8d-92b4-44bc-9dd9-4cb3dbfc65f4", // "The Ashes" vs "In Ashes"
  ];

  for (const id of ids) {
    const rows = await db.execute(
      sql`SELECT id, title, tmdb_id FROM films WHERE id = ${id}`
    );
    const film = (rows as unknown as Array<{ id: string; title: string; tmdb_id: number | null }>)[0];
    if (film) {
      console.log(`ID: ${film.id}`);
      console.log(`  Title: "${film.title}"`);
      console.log(`  TMDB: ${film.tmdb_id || "none"}`);
      console.log();
    } else {
      console.log(`ID: ${id} — NOT FOUND\n`);
    }
  }

  // Also check the title_not_clean films
  const cleanIds = [
    "ba563d42-ef12-4508-a960-f255aa14474a", // "Toddler Club: Lilo & Stitch (2002)"
    "2e9d4c79-3a20-4050-a176-ae984103f0c3", // "IMAX exclusive preview week – EPiC: Elvis Presley in Concert"
  ];

  console.log("Checking title_not_clean films...\n");
  for (const id of cleanIds) {
    const rows = await db.execute(
      sql`SELECT id, title, tmdb_id FROM films WHERE id = ${id}`
    );
    const film = (rows as unknown as Array<{ id: string; title: string; tmdb_id: number | null }>)[0];
    if (film) {
      console.log(`ID: ${film.id}`);
      console.log(`  Title: "${film.title}"`);
      console.log(`  TMDB: ${film.tmdb_id || "none"}`);
      console.log();
    }
  }

  // Apply fixes
  const DRY_RUN = process.argv.includes("--dry-run");

  const fixes: Array<{ id: string; oldTitle: string; newTitle: string; reason: string }> = [
    {
      id: "5ecb21ad-fc28-43dd-bfc2-20fd7edef25f",
      oldTitle: '"Wuthering Heights"',
      newTitle: "Wuthering Heights",
      reason: "Remove literal quote characters from title",
    },
    {
      id: "98266aa4-012d-4c28-add8-1ec3630b049d",
      oldTitle: "All You Need is Kill",
      newTitle: "All You Need Is Kill",
      reason: "Correct casing: 'Is' should be capitalized (official title)",
    },
    {
      id: "ba563d42-ef12-4508-a960-f255aa14474a",
      oldTitle: "Toddler Club: Lilo & Stitch (2002)",
      newTitle: "Lilo & Stitch",
      reason: "Remove 'Toddler Club:' prefix and year from title",
    },
    {
      id: "2e9d4c79-3a20-4050-a176-ae984103f0c3",
      oldTitle: "IMAX exclusive preview week – EPiC: Elvis Presley in Concert",
      newTitle: "EPiC: Elvis Presley in Concert",
      reason: "Remove 'IMAX exclusive preview week –' prefix",
    },
  ];

  console.log(`\n${DRY_RUN ? "[DRY RUN] " : ""}Applying title fixes...\n`);

  for (const fix of fixes) {
    console.log(`"${fix.oldTitle}" → "${fix.newTitle}" (${fix.reason})`);
    if (!DRY_RUN) {
      await db.execute(
        sql`UPDATE films SET title = ${fix.newTitle}, updated_at = NOW() WHERE id = ${fix.id}`
      );
      console.log("  ✓ Updated\n");
    } else {
      console.log("  [skipped — dry run]\n");
    }
  }

  // "The Ashes" vs "In Ashes" — audit false positive (no "The Ashes" film exists in DB)
  console.log("\n--- Notes ---");
  console.log('"The Ashes" / "In Ashes" (9611ad8d): Audit false positive — card text extraction was imprecise.');

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
