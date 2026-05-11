import { db } from "@/db";
import { films, screenings, cinemas } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getTMDBClient } from "@/lib/tmdb";

const FILM_ID = "960847a6-d5ec-4ab7-bed5-4b54e93e0464";

async function main() {
  const [f] = await db.select().from(films).where(eq(films.id, FILM_ID));
  if (!f) return console.error("Not found");
  console.log("Current DB row:");
  console.log(JSON.stringify(f, null, 2));

  const ss = await db
    .select({
      datetime: screenings.datetime,
      cinema: cinemas.name,
      booking: screenings.bookingUrl,
    })
    .from(screenings)
    .innerJoin(cinemas, eq(screenings.cinemaId, cinemas.id))
    .where(sql`${screenings.filmId} = ${FILM_ID} AND ${screenings.datetime} >= NOW()`)
    .orderBy(screenings.datetime)
    .limit(5);
  console.log(`\nUpcoming screenings (${ss.length}):`);
  for (const s of ss) console.log(`  ${s.cinema}  ${s.datetime.toISOString()}  ${s.booking}`);

  if (f.tmdbId) {
    const tmdb = getTMDBClient();
    try {
      const d = await tmdb.getFullFilmData(f.tmdbId);
      console.log(`\nCurrent TMDB ${f.tmdbId}: title="${d.details.title}", orig="${d.details.original_title}", release=${d.details.release_date}`);
    } catch (e) {
      console.log(`\nTMDB ${f.tmdbId} fetch failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
