CREATE TABLE "cinemas" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"chain" text,
	"address" jsonb,
	"coordinates" jsonb,
	"screens" integer,
	"features" text[] DEFAULT '{}' NOT NULL,
	"programming_focus" text[] DEFAULT '{}' NOT NULL,
	"website" text NOT NULL,
	"booking_url" text,
	"data_source_type" text,
	"data_source_endpoint" text,
	"last_scraped_at" timestamp with time zone,
	"description" text,
	"image_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "films" (
	"id" text PRIMARY KEY NOT NULL,
	"tmdb_id" integer,
	"imdb_id" text,
	"title" text NOT NULL,
	"original_title" text,
	"year" integer,
	"runtime" integer,
	"directors" text[] DEFAULT '{}' NOT NULL,
	"cast" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"genres" text[] DEFAULT '{}' NOT NULL,
	"countries" text[] DEFAULT '{}' NOT NULL,
	"languages" text[] DEFAULT '{}' NOT NULL,
	"certification" text,
	"synopsis" text,
	"tagline" text,
	"poster_url" text,
	"backdrop_url" text,
	"trailer_url" text,
	"is_repertory" boolean DEFAULT false NOT NULL,
	"release_status" text,
	"decade" text,
	"tmdb_rating" real,
	"letterboxd_url" text,
	"match_confidence" real,
	"match_strategy" text,
	"matched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "films_tmdb_id_unique" UNIQUE("tmdb_id")
);
--> statement-breakpoint
CREATE TABLE "screenings" (
	"id" text PRIMARY KEY NOT NULL,
	"film_id" text NOT NULL,
	"cinema_id" text NOT NULL,
	"datetime" timestamp with time zone NOT NULL,
	"screen" text,
	"format" text,
	"is_3d" boolean DEFAULT false NOT NULL,
	"is_special_event" boolean DEFAULT false NOT NULL,
	"event_type" text,
	"event_description" text,
	"season" text,
	"booking_url" text NOT NULL,
	"is_sold_out" boolean DEFAULT false NOT NULL,
	"has_subtitles" boolean DEFAULT false NOT NULL,
	"subtitle_language" text,
	"has_audio_description" boolean DEFAULT false NOT NULL,
	"is_relaxed_screening" boolean DEFAULT false NOT NULL,
	"source_id" text,
	"scraped_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_issues" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"description" text NOT NULL,
	"suggested_fix" text,
	"confidence" real NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"agent_name" text NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_film_statuses" (
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
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"preferences" jsonb DEFAULT '{"selectedCinemas":[],"defaultView":"list","showRepertoryOnly":false,"hidePastScreenings":true,"defaultDateRange":"all","preferredFormats":[]}'::jsonb NOT NULL,
	"persisted_filters" jsonb DEFAULT '{"cinemaIds":[],"formats":[],"programmingTypes":[],"decades":[],"genres":[],"timesOfDay":[],"hideSeen":false,"hideNotInterested":true}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "screenings" ADD CONSTRAINT "screenings_film_id_films_id_fk" FOREIGN KEY ("film_id") REFERENCES "public"."films"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenings" ADD CONSTRAINT "screenings_cinema_id_cinemas_id_fk" FOREIGN KEY ("cinema_id") REFERENCES "public"."cinemas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_film_statuses" ADD CONSTRAINT "user_film_statuses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_films_title" ON "films" USING btree ("title");--> statement-breakpoint
CREATE INDEX "idx_films_repertory" ON "films" USING btree ("is_repertory");--> statement-breakpoint
CREATE INDEX "idx_films_year" ON "films" USING btree ("year");--> statement-breakpoint
CREATE INDEX "idx_films_match_strategy" ON "films" USING btree ("match_strategy");--> statement-breakpoint
CREATE INDEX "idx_screenings_datetime" ON "screenings" USING btree ("datetime");--> statement-breakpoint
CREATE INDEX "idx_screenings_film_datetime" ON "screenings" USING btree ("film_id","datetime");--> statement-breakpoint
CREATE INDEX "idx_screenings_cinema_datetime" ON "screenings" USING btree ("cinema_id","datetime");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_screenings_unique" ON "screenings" USING btree ("film_id","cinema_id","datetime");--> statement-breakpoint
CREATE INDEX "idx_data_issues_status" ON "data_issues" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_data_issues_entity" ON "data_issues" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_data_issues_type" ON "data_issues" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_data_issues_detected" ON "data_issues" USING btree ("detected_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_film_unique" ON "user_film_statuses" USING btree ("user_id","film_id");