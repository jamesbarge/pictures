import { db } from "@/db";
import { films } from "@/db/schema";
import { count } from "drizzle-orm";

async function main() {
  const [result] = await db.select({ count: count() }).from(films);
  console.log("Total films in database:", result.count);
}

main().catch(console.error).finally(() => process.exit());
