import { sql } from "drizzle-orm";
import { db } from "./index";

async function runMigration() {
  console.log("Creating user tables...");
  
  // Create users table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "users" (
      "id" text PRIMARY KEY NOT NULL,
      "email" text,
      "display_name" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `);
  console.log("Created users table");
  
  // Create user_film_statuses table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "user_film_statuses" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "film_id" text NOT NULL,
      "status" text NOT NULL,
      "added_at" timestamp with time zone NOT NULL,
      "seen_at" timestamp with time zone,
      "rating" integer,
      "notes" text,
      "film_title" text,
      "film_year" integer,
      "film_directors" text[],
      "film_poster_url" text,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `);
  console.log("Created user_film_statuses table");
  
  // Create user_preferences table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "user_preferences" (
      "user_id" text PRIMARY KEY NOT NULL,
      "preferences" jsonb DEFAULT '{"selectedCinemas":[],"defaultView":"list","showRepertoryOnly":false,"hidePastScreenings":true,"defaultDateRange":"all","preferredFormats":[]}'::jsonb NOT NULL,
      "persisted_filters" jsonb DEFAULT '{"cinemaIds":[],"formats":[],"programmingTypes":[],"decades":[],"genres":[],"timesOfDay":[],"hideSeen":false,"hideNotInterested":true}'::jsonb NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `);
  console.log("Created user_preferences table");
  
  // Add foreign key constraints (ignore if exists)
  try {
    await db.execute(sql`
      ALTER TABLE "user_film_statuses"
      ADD CONSTRAINT "user_film_statuses_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
    `);
    console.log("Added FK: user_film_statuses -> users");
  } catch (e: any) {
    if (e.code === "42710") console.log("FK user_film_statuses already exists");
    else throw e;
  }
  
  try {
    await db.execute(sql`
      ALTER TABLE "user_preferences"
      ADD CONSTRAINT "user_preferences_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
    `);
    console.log("Added FK: user_preferences -> users");
  } catch (e: any) {
    if (e.code === "42710") console.log("FK user_preferences already exists");
    else throw e;
  }
  
  // Create unique index
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "user_film_unique" 
    ON "user_film_statuses" USING btree ("user_id","film_id")
  `);
  console.log("Created unique index");
  
  console.log("Migration completed!");
  process.exit(0);
}

runMigration().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
