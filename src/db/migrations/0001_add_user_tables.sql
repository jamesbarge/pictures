-- Add user management tables for cloud sync functionality

-- Users table (linked to Clerk auth)
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- User film statuses (watchlist, seen, not interested)
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
);

-- User preferences and filter state
CREATE TABLE IF NOT EXISTS "user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"preferences" jsonb DEFAULT '{"selectedCinemas":[],"defaultView":"list","showRepertoryOnly":false,"hidePastScreenings":true,"defaultDateRange":"all","preferredFormats":[]}'::jsonb NOT NULL,
	"persisted_filters" jsonb DEFAULT '{"cinemaIds":[],"formats":[],"programmingTypes":[],"decades":[],"genres":[],"timesOfDay":[],"hideSeen":false,"hideNotInterested":true}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Foreign keys
ALTER TABLE "user_film_statuses" ADD CONSTRAINT "user_film_statuses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "user_film_unique" ON "user_film_statuses" USING btree ("user_id","film_id");
