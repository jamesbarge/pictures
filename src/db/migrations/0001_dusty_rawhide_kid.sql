CREATE TABLE "festival_screenings" (
	"festival_id" text NOT NULL,
	"screening_id" text NOT NULL,
	"festival_section" text,
	"is_premiere" boolean DEFAULT false NOT NULL,
	"premiere_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "festival_screenings_festival_id_screening_id_pk" PRIMARY KEY("festival_id","screening_id")
);
--> statement-breakpoint
CREATE TABLE "festivals" (
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
);
--> statement-breakpoint
CREATE TABLE "user_festival_interests" (
	"user_id" text NOT NULL,
	"festival_id" text NOT NULL,
	"interest_level" text DEFAULT 'following' NOT NULL,
	"notify_on_sale" boolean DEFAULT true NOT NULL,
	"notify_programme" boolean DEFAULT true NOT NULL,
	"notify_reminders" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_festival_interests_user_id_festival_id_pk" PRIMARY KEY("user_id","festival_id")
);
--> statement-breakpoint
CREATE TABLE "user_festival_schedule" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"screening_id" text NOT NULL,
	"festival_id" text NOT NULL,
	"status" text DEFAULT 'wishlist' NOT NULL,
	"booking_confirmation" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "screenings" ADD COLUMN "is_festival_screening" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "screenings" ADD COLUMN "availability_status" text;--> statement-breakpoint
ALTER TABLE "screenings" ADD COLUMN "availability_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "festival_screenings" ADD CONSTRAINT "festival_screenings_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_screenings" ADD CONSTRAINT "festival_screenings_screening_id_screenings_id_fk" FOREIGN KEY ("screening_id") REFERENCES "public"."screenings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_festival_interests" ADD CONSTRAINT "user_festival_interests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_festival_interests" ADD CONSTRAINT "user_festival_interests_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_festival_schedule" ADD CONSTRAINT "user_festival_schedule_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_festival_schedule" ADD CONSTRAINT "user_festival_schedule_screening_id_screenings_id_fk" FOREIGN KEY ("screening_id") REFERENCES "public"."screenings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_festival_schedule" ADD CONSTRAINT "user_festival_schedule_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_festival_screenings_festival" ON "festival_screenings" USING btree ("festival_id");--> statement-breakpoint
CREATE INDEX "idx_festival_screenings_screening" ON "festival_screenings" USING btree ("screening_id");--> statement-breakpoint
CREATE INDEX "idx_festivals_dates" ON "festivals" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "idx_festivals_year" ON "festivals" USING btree ("year");--> statement-breakpoint
CREATE INDEX "idx_festivals_active" ON "festivals" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_user_festival_interests_user" ON "user_festival_interests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_festival_interests_festival" ON "user_festival_interests" USING btree ("festival_id");--> statement-breakpoint
CREATE INDEX "idx_user_festival_schedule_user_festival" ON "user_festival_schedule" USING btree ("user_id","festival_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_festival_schedule_unique" ON "user_festival_schedule" USING btree ("user_id","screening_id");--> statement-breakpoint
CREATE INDEX "idx_user_festival_schedule_status" ON "user_festival_schedule" USING btree ("user_id","status");