ALTER TABLE "films" ADD COLUMN "letterboxd_slug" text;--> statement-breakpoint
ALTER TABLE "films" ADD COLUMN "letterboxd_enriched_at" timestamp;
-- NOTE: drizzle-kit also emitted `CREATE UNIQUE INDEX "idx_screenings_cinema_source" ...`
-- here because PR #658 declared that index in the Drizzle schema while it was
-- created out-of-band by 0011_screenings_cinema_source_unique.sql (the journal
-- only tracks 0000-0005). The index already exists in the database (verified
-- 2026-06-12), so the statement was removed to keep this migration to the two
-- pre-authorized ADD COLUMNs. The 0005 snapshot records the index, so future
-- generates will not re-emit it.