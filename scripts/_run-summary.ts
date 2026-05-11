import { db } from "@/db";
import { scraperRuns } from "@/db/schema";
import { sql, gte } from "drizzle-orm";

async function main() {
  const since = new Date("2026-05-10T20:25:00.000Z");
  const grouped = await db
    .select({
      status: scraperRuns.status,
      n: sql<number>`count(*)::int`,
    })
    .from(scraperRuns)
    .where(gte(scraperRuns.startedAt, since))
    .groupBy(scraperRuns.status);
  console.log(`Scraper runs since ${since.toISOString()} (grouped by status):`);
  for (const row of grouped) {
    console.log(`  ${row.status.padEnd(12)} ${row.n}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
