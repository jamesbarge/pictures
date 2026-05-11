import { db } from "@/db";
import { screenings, films, cinemas } from "@/db/schema";
import { sql, eq, gte, and, ilike } from "drizzle-orm";

async function main() {
  // All upcoming Hokum screenings, ordered by datetime
  const rows = await db
    .select({
      id: screenings.id,
      utc: screenings.datetime,
      london: sql<string>`to_char(${screenings.datetime} AT TIME ZONE 'Europe/London', 'YYYY-MM-DD HH24:MI:SS')`,
      bookingUrl: screenings.bookingUrl,
      cinemaName: cinemas.name,
      cinemaId: screenings.cinemaId,
      title: films.title,
    })
    .from(screenings)
    .innerJoin(films, eq(screenings.filmId, films.id))
    .innerJoin(cinemas, eq(screenings.cinemaId, cinemas.id))
    .where(
      and(
        gte(screenings.datetime, new Date()),
        ilike(films.title, "Hokum%"),
      ),
    )
    .orderBy(screenings.datetime);

  console.log(`All upcoming Hokum screenings (${rows.length}):\n`);
  for (const r of rows) {
    console.log(`  ${r.cinemaName.padEnd(28)} ${r.london} London  (${r.utc.toISOString()} UTC)`);
    console.log(`    booking: ${r.bookingUrl}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
