import { sql } from "drizzle-orm";
import { db } from "./index";

async function runFestivalMigration() {
  console.log("Running festival tables migration...\n");

  // Create festivals table
  console.log("1. Creating festivals table...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "festivals" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "slug" text NOT NULL,
      "short_name" text,
      "year" integer NOT NULL,
      "description" text,
      "website_url" text,
      "logo_url" text,
      "start_date" date NOT NULL,
      "end_date" date NOT NULL,
      "programme_announced_date" date,
      "member_sale_date" timestamp with time zone,
      "public_sale_date" timestamp with time zone,
      "genre_focus" text[] DEFAULT '{}',
      "venues" text[] DEFAULT '{}',
      "is_active" boolean DEFAULT true NOT NULL,
      "scraped_at" timestamp with time zone,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "festivals_slug_unique" UNIQUE("slug")
    )
  `);
  console.log("   ✓ festivals table created\n");

  // Create festival_screenings table
  console.log("2. Creating festival_screenings table...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "festival_screenings" (
      "festival_id" text NOT NULL,
      "screening_id" text NOT NULL,
      "festival_section" text,
      "is_premiere" boolean DEFAULT false NOT NULL,
      "premiere_type" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "festival_screenings_festival_id_screening_id_pk" PRIMARY KEY("festival_id","screening_id")
    )
  `);
  console.log("   ✓ festival_screenings table created\n");

  // Create user_festival_interests table
  console.log("3. Creating user_festival_interests table...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "user_festival_interests" (
      "user_id" text NOT NULL,
      "festival_id" text NOT NULL,
      "interest_level" text DEFAULT 'following' NOT NULL,
      "notify_on_sale" boolean DEFAULT true NOT NULL,
      "notify_programme" boolean DEFAULT true NOT NULL,
      "notify_reminders" boolean DEFAULT true NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "user_festival_interests_user_id_festival_id_pk" PRIMARY KEY("user_id","festival_id")
    )
  `);
  console.log("   ✓ user_festival_interests table created\n");

  // Create user_festival_schedule table
  console.log("4. Creating user_festival_schedule table...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "user_festival_schedule" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "screening_id" text NOT NULL,
      "festival_id" text NOT NULL,
      "status" text DEFAULT 'wishlist' NOT NULL,
      "booking_confirmation" text,
      "notes" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `);
  console.log("   ✓ user_festival_schedule table created\n");

  // Add columns to screenings table
  console.log("5. Adding festival columns to screenings table...");
  try {
    await db.execute(sql`
      ALTER TABLE "screenings" ADD COLUMN IF NOT EXISTS "is_festival_screening" boolean DEFAULT false NOT NULL
    `);
    console.log("   ✓ is_festival_screening column added");
  } catch (e: any) {
    if (e.code === "42701") console.log("   - is_festival_screening already exists");
    else throw e;
  }

  try {
    await db.execute(sql`
      ALTER TABLE "screenings" ADD COLUMN IF NOT EXISTS "availability_status" text
    `);
    console.log("   ✓ availability_status column added");
  } catch (e: any) {
    if (e.code === "42701") console.log("   - availability_status already exists");
    else throw e;
  }

  try {
    await db.execute(sql`
      ALTER TABLE "screenings" ADD COLUMN IF NOT EXISTS "availability_checked_at" timestamp with time zone
    `);
    console.log("   ✓ availability_checked_at column added\n");
  } catch (e: any) {
    if (e.code === "42701") console.log("   - availability_checked_at already exists\n");
    else throw e;
  }

  // Add foreign key constraints
  console.log("6. Adding foreign key constraints...");

  try {
    await db.execute(sql`
      ALTER TABLE "festival_screenings"
      ADD CONSTRAINT "festival_screenings_festival_id_festivals_id_fk"
      FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade
    `);
    console.log("   ✓ FK festival_screenings -> festivals");
  } catch (e: any) {
    if (e.code === "42710") console.log("   - FK festival_screenings -> festivals already exists");
    else throw e;
  }

  try {
    await db.execute(sql`
      ALTER TABLE "festival_screenings"
      ADD CONSTRAINT "festival_screenings_screening_id_screenings_id_fk"
      FOREIGN KEY ("screening_id") REFERENCES "public"."screenings"("id") ON DELETE cascade
    `);
    console.log("   ✓ FK festival_screenings -> screenings");
  } catch (e: any) {
    if (e.code === "42710") console.log("   - FK festival_screenings -> screenings already exists");
    else throw e;
  }

  try {
    await db.execute(sql`
      ALTER TABLE "user_festival_interests"
      ADD CONSTRAINT "user_festival_interests_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
    `);
    console.log("   ✓ FK user_festival_interests -> users");
  } catch (e: any) {
    if (e.code === "42710") console.log("   - FK user_festival_interests -> users already exists");
    else throw e;
  }

  try {
    await db.execute(sql`
      ALTER TABLE "user_festival_interests"
      ADD CONSTRAINT "user_festival_interests_festival_id_festivals_id_fk"
      FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade
    `);
    console.log("   ✓ FK user_festival_interests -> festivals");
  } catch (e: any) {
    if (e.code === "42710") console.log("   - FK user_festival_interests -> festivals already exists");
    else throw e;
  }

  try {
    await db.execute(sql`
      ALTER TABLE "user_festival_schedule"
      ADD CONSTRAINT "user_festival_schedule_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
    `);
    console.log("   ✓ FK user_festival_schedule -> users");
  } catch (e: any) {
    if (e.code === "42710") console.log("   - FK user_festival_schedule -> users already exists");
    else throw e;
  }

  try {
    await db.execute(sql`
      ALTER TABLE "user_festival_schedule"
      ADD CONSTRAINT "user_festival_schedule_screening_id_screenings_id_fk"
      FOREIGN KEY ("screening_id") REFERENCES "public"."screenings"("id") ON DELETE cascade
    `);
    console.log("   ✓ FK user_festival_schedule -> screenings");
  } catch (e: any) {
    if (e.code === "42710") console.log("   - FK user_festival_schedule -> screenings already exists");
    else throw e;
  }

  try {
    await db.execute(sql`
      ALTER TABLE "user_festival_schedule"
      ADD CONSTRAINT "user_festival_schedule_festival_id_festivals_id_fk"
      FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade
    `);
    console.log("   ✓ FK user_festival_schedule -> festivals\n");
  } catch (e: any) {
    if (e.code === "42710") console.log("   - FK user_festival_schedule -> festivals already exists\n");
    else throw e;
  }

  // Create indexes
  console.log("7. Creating indexes...");

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "idx_festival_screenings_festival"
    ON "festival_screenings" USING btree ("festival_id")
  `);
  console.log("   ✓ idx_festival_screenings_festival");

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "idx_festival_screenings_screening"
    ON "festival_screenings" USING btree ("screening_id")
  `);
  console.log("   ✓ idx_festival_screenings_screening");

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "idx_festivals_dates"
    ON "festivals" USING btree ("start_date","end_date")
  `);
  console.log("   ✓ idx_festivals_dates");

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "idx_festivals_year"
    ON "festivals" USING btree ("year")
  `);
  console.log("   ✓ idx_festivals_year");

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "idx_festivals_active"
    ON "festivals" USING btree ("is_active")
  `);
  console.log("   ✓ idx_festivals_active");

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "idx_user_festival_interests_user"
    ON "user_festival_interests" USING btree ("user_id")
  `);
  console.log("   ✓ idx_user_festival_interests_user");

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "idx_user_festival_interests_festival"
    ON "user_festival_interests" USING btree ("festival_id")
  `);
  console.log("   ✓ idx_user_festival_interests_festival");

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "idx_user_festival_schedule_user_festival"
    ON "user_festival_schedule" USING btree ("user_id","festival_id")
  `);
  console.log("   ✓ idx_user_festival_schedule_user_festival");

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_festival_schedule_unique"
    ON "user_festival_schedule" USING btree ("user_id","screening_id")
  `);
  console.log("   ✓ idx_user_festival_schedule_unique");

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "idx_user_festival_schedule_status"
    ON "user_festival_schedule" USING btree ("user_id","status")
  `);
  console.log("   ✓ idx_user_festival_schedule_status\n");

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Festival migration completed successfully!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  process.exit(0);
}

runFestivalMigration().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
