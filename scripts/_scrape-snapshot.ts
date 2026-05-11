import { db } from "@/db";
import { screenings, scraperRuns } from "@/db/schema";
import { sql, desc } from "drizzle-orm";

async function main() {
  const total = await db.select({ n: sql<number>`count(*)::int` }).from(screenings);
  const lastRun = await db
    .select({ at: scraperRuns.startedAt })
    .from(scraperRuns)
    .orderBy(desc(scraperRuns.startedAt))
    .limit(1);
  console.log("SCREENINGS_COUNT", total[0]?.n ?? 0);
  console.log("LAST_RUN_AT", lastRun[0]?.at ?? "never");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
