import { db } from "@/db";
import { screenings, films } from "@/db/schema";
import { sql, eq, gte, inArray, and } from "drizzle-orm";

const TARGET_CINEMAS = [
  "electric-portobello",
  "electric-white-city",
  "peckhamplex",
  "close-up-cinema",
  "genesis",
  "bfi-southbank",
];

async function main() {
  // Per-cinema: bucket upcoming screenings by London hour-of-day; flag any in
  // the 00:00-09:59 window (the classic BST-off-by-one signature).
  const rows = await db
    .select({
      cinemaId: screenings.cinemaId,
      londonHour: sql<number>`EXTRACT(HOUR FROM ${screenings.datetime} AT TIME ZONE 'Europe/London')::int`,
      n: sql<number>`COUNT(*)::int`,
    })
    .from(screenings)
    .where(
      and(
        gte(screenings.datetime, new Date()),
        inArray(screenings.cinemaId, TARGET_CINEMAS),
      ),
    )
    .groupBy(
      screenings.cinemaId,
      sql`EXTRACT(HOUR FROM ${screenings.datetime} AT TIME ZONE 'Europe/London')`,
    )
    .orderBy(screenings.cinemaId, sql`EXTRACT(HOUR FROM ${screenings.datetime} AT TIME ZONE 'Europe/London')`);

  const byCinema = new Map<string, Map<number, number>>();
  for (const r of rows) {
    if (!byCinema.has(r.cinemaId)) byCinema.set(r.cinemaId, new Map());
    byCinema.get(r.cinemaId)!.set(r.londonHour, r.n);
  }

  console.log("\n=== Upcoming-screenings hour distribution (London local) ===\n");
  for (const cinemaId of TARGET_CINEMAS) {
    const dist = byCinema.get(cinemaId);
    if (!dist) {
      console.log(`${cinemaId}: NO ROWS`);
      continue;
    }
    const total = [...dist.values()].reduce((a, b) => a + b, 0);
    const suspicious = [...dist.entries()]
      .filter(([h]) => h >= 0 && h < 10)
      .reduce((a, [, n]) => a + n, 0);
    const distStr = [...dist.entries()]
      .map(([h, n]) => `${String(h).padStart(2, "0")}:${n}`)
      .join(" ");
    const flag = suspicious > 0 ? ` ⚠️  ${suspicious} in 00:00-09:59` : " ✓";
    console.log(`${cinemaId.padEnd(22)} total=${String(total).padStart(4)}  ${distStr}${flag}`);
  }

  // Sample 3 newest screenings per cinema (London time + film title)
  console.log("\n=== Sample screenings (London time + film) ===\n");
  for (const cinemaId of TARGET_CINEMAS) {
    const samples = await db
      .select({
        london: sql<string>`to_char(${screenings.datetime} AT TIME ZONE 'Europe/London', 'YYYY-MM-DD HH24:MI')`,
        title: films.title,
      })
      .from(screenings)
      .innerJoin(films, eq(screenings.filmId, films.id))
      .where(
        and(
          gte(screenings.datetime, new Date()),
          eq(screenings.cinemaId, cinemaId),
        ),
      )
      .orderBy(screenings.datetime)
      .limit(3);
    console.log(`-- ${cinemaId}`);
    for (const s of samples) console.log(`   ${s.london}  ${s.title}`);
    if (samples.length === 0) console.log("   (no upcoming rows)");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
