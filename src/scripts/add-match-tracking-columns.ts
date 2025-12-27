/**
 * Migration: Add match tracking columns to films table
 *
 * Run with: npx tsx src/scripts/add-match-tracking-columns.ts
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL not set");
}

async function migrate() {
  console.log("Connecting to database...");
  const client = postgres(connectionString!, { max: 1 });
  const db = drizzle(client);

  console.log("Adding match tracking columns to films table...");

  try {
    // Add columns if they don't exist
    await db.execute(sql`
      ALTER TABLE films
      ADD COLUMN IF NOT EXISTS match_confidence REAL,
      ADD COLUMN IF NOT EXISTS match_strategy TEXT,
      ADD COLUMN IF NOT EXISTS matched_at TIMESTAMP WITH TIME ZONE
    `);

    console.log("✓ Columns added");

    // Create index
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_films_match_strategy
      ON films(match_strategy)
    `);

    console.log("✓ Index created");

    // Verify
    const result = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'films' AND column_name IN ('match_confidence', 'match_strategy', 'matched_at')
    `);

    console.log(`✓ Verified ${result.length} tracking columns exist`);

  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await client.end();
  }

  console.log("Migration complete!");
}

migrate();
