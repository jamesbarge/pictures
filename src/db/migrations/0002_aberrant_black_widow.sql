CREATE TYPE "public"."anomaly_type" AS ENUM('low_count', 'zero_results', 'error', 'high_count');--> statement-breakpoint
CREATE TYPE "public"."cinema_tier" AS ENUM('top', 'standard');--> statement-breakpoint
CREATE TYPE "public"."scraper_run_status" AS ENUM('success', 'failed', 'anomaly', 'partial');--> statement-breakpoint
CREATE TABLE "admin_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" text NOT NULL,
	"admin_email" text,
	"action_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"old_value" jsonb,
	"new_value" jsonb,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cinema_baselines" (
	"cinema_id" text PRIMARY KEY NOT NULL,
	"tier" "cinema_tier" DEFAULT 'standard' NOT NULL,
	"weekday_avg" integer,
	"weekend_avg" integer,
	"tolerance_percent" integer DEFAULT 30 NOT NULL,
	"manual_override" boolean DEFAULT false NOT NULL,
	"last_calculated" timestamp with time zone,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scraper_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cinema_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"status" "scraper_run_status" NOT NULL,
	"screening_count" integer,
	"baseline_count" integer,
	"anomaly_type" "anomaly_type",
	"anomaly_details" jsonb,
	"auto_fixed" boolean DEFAULT false NOT NULL,
	"auto_retried" boolean DEFAULT false NOT NULL,
	"fixed_by_ai" boolean DEFAULT false NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season_films" (
	"season_id" text NOT NULL,
	"film_id" text NOT NULL,
	"order_index" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_films_season_id_film_id_pk" PRIMARY KEY("season_id","film_id")
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"director_name" text,
	"director_tmdb_id" integer,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"poster_url" text,
	"website_url" text,
	"source_url" text,
	"source_cinemas" text[] DEFAULT '{}',
	"is_active" boolean DEFAULT true NOT NULL,
	"scraped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "films" ADD COLUMN "content_type" text DEFAULT 'film' NOT NULL;--> statement-breakpoint
ALTER TABLE "films" ADD COLUMN "source_image_url" text;--> statement-breakpoint
ALTER TABLE "films" ADD COLUMN "letterboxd_rating" real;--> statement-breakpoint
ALTER TABLE "cinema_baselines" ADD CONSTRAINT "cinema_baselines_cinema_id_cinemas_id_fk" FOREIGN KEY ("cinema_id") REFERENCES "public"."cinemas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scraper_runs" ADD CONSTRAINT "scraper_runs_cinema_id_cinemas_id_fk" FOREIGN KEY ("cinema_id") REFERENCES "public"."cinemas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_films" ADD CONSTRAINT "season_films_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_films" ADD CONSTRAINT "season_films_film_id_films_id_fk" FOREIGN KEY ("film_id") REFERENCES "public"."films"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_season_films_season" ON "season_films" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "idx_season_films_film" ON "season_films" USING btree ("film_id");--> statement-breakpoint
CREATE INDEX "idx_seasons_dates" ON "seasons" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "idx_seasons_director" ON "seasons" USING btree ("director_name");--> statement-breakpoint
CREATE INDEX "idx_seasons_active" ON "seasons" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_seasons_slug" ON "seasons" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_films_content_type" ON "films" USING btree ("content_type");