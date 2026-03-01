/**
 * One-time script to reclassify known non-film content from the 2026-02-28 audit.
 * Targets 11 specific items that should not appear in the film calendar.
 *
 * Run: dotenv -e .env.local -- npx tsx scripts/fix-non-film-content.ts
 */

import { db } from "@/db";
import { films, screenings } from "@/db/schema";
import { eq, like, gte, and, sql } from "drizzle-orm";
import type { ContentType } from "@/types/film";

interface Reclassification {
  pattern: string;
  newType: ContentType;
  reason: string;
}

const RECLASSIFICATIONS: Reclassification[] = [
  { pattern: "%Quiz of Rassilon%", newType: "event", reason: "pub quiz" },
  { pattern: "%Big Ritzy Quiz%", newType: "event", reason: "pub quiz" },
  { pattern: "National Theatre Live:%", newType: "live_broadcast", reason: "NT Live broadcast" },
  { pattern: "%Royal Ballet:%", newType: "live_broadcast", reason: "ballet broadcast" },
  { pattern: "%London International Animation Festival%", newType: "event", reason: "festival shorts compilation" },
  { pattern: "Celebrating Peaky Blinders%", newType: "event", reason: "TV celebration event" },
  { pattern: "Elvis Presley in Concert%", newType: "concert", reason: "concert broadcast" },
];

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Reclassifying non-film content...\n`);

  const now = new Date();
  let totalUpdated = 0;

  for (const { pattern, newType, reason } of RECLASSIFICATIONS) {
    // Find matching films with upcoming screenings
    const matches = await db
      .selectDistinct({
        id: films.id,
        title: films.title,
        contentType: films.contentType,
      })
      .from(films)
      .innerJoin(screenings, eq(screenings.filmId, films.id))
      .where(
        and(
          like(films.title, pattern),
          eq(films.contentType, "film"),
          gte(screenings.datetime, now)
        )
      );

    if (matches.length === 0) {
      console.log(`  - No upcoming matches for pattern: ${pattern}`);
      continue;
    }

    for (const film of matches) {
      console.log(`  ${DRY_RUN ? "Would update" : "Updating"}: "${film.title}" → ${newType} (${reason})`);

      if (!DRY_RUN) {
        await db
          .update(films)
          .set({ contentType: newType, updatedAt: new Date() })
          .where(eq(films.id, film.id));
      }
      totalUpdated++;
    }
  }

  console.log(`\n${DRY_RUN ? "Would update" : "Updated"} ${totalUpdated} films.`);

  if (!DRY_RUN) {
    // Verify remaining non-film content
    const remaining = await db.execute(sql`
      SELECT content_type, COUNT(*) as count
      FROM films
      WHERE content_type != 'film'
      GROUP BY content_type
      ORDER BY count DESC
    `);
    console.log("\nContent type distribution (non-film):");
    const rows = remaining as unknown as Array<{ content_type: string; count: string }>;
    for (const row of rows) {
      console.log(`  ${row.content_type}: ${row.count}`);
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
