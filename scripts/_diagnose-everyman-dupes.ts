import { db } from "@/db";
import { screenings } from "@/db/schema";
import { sql } from "drizzle-orm";

async function main() {
  // For the duplicate set we saw earlier, show all columns including sourceId.
  const url = "https://purchase.everymancinema.com/launch/ticketing/4bef1f81-608a-5645-9e87-4614201a3629";
  const rows = await db
    .select({
      id: screenings.id,
      sourceId: screenings.sourceId,
      datetime: screenings.datetime,
      scrapedAt: screenings.scrapedAt,
      cinemaId: screenings.cinemaId,
    })
    .from(screenings)
    .where(sql`${screenings.bookingUrl} = ${url}`);
  console.log(`Rows for booking URL …4bef1f81…:`);
  for (const r of rows) {
    console.log(`  id=${r.id.slice(0, 8)}  src=${r.sourceId ?? "<null>"}`);
    console.log(`    datetime=${r.datetime.toISOString()}  scraped=${r.scrapedAt.toISOString()}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
