import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/db/schema/index.ts";
import { eq } from "drizzle-orm";

const client = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const db = drizzle(client, { schema });

async function run() {
  const fixed = await db
    .update(schema.films)
    .set({
      title: "The Grandmaster",
      tmdbId: 76203,
      matchedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.films.id, "c4b3efb7-81f0-43d1-a1ca-7f48bb89e011"))
    .returning({ id: schema.films.id, title: schema.films.title });

  console.log("Title fixed + re-enrichment triggered:", JSON.stringify(fixed));
  await client.end();
}

run().catch((e) => {
  console.error(e);
  client.end().then(() => process.exit(1));
});
