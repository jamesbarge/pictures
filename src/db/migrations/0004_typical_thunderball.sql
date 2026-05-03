-- Append-only audit log for enrichment corrections.
-- Replaces the self-modifying .claude/data-check-learnings.json that
-- corrupted itself once (FM-25 in 07-internal-archaeology.md — pointed
-- Small Axe: Lovers Rock to a 1929 Walter Lantz cartoon). Self-modifying
-- authoritative state is the bug class this table eliminates.
--
-- See src/db/schema/enrichment-corrections.ts for the full design and
-- Pictures/Research/scraping-rethink-2026-05/06-enrichment.md for the
-- compensating-event pattern (never delete, append a reversal).
--
-- Hand-trimmed from drizzle-kit generate output 2026-05-03 — the auto-
-- generated migration also tried to recreate tables that already exist
-- (autoresearch_*, dqs_snapshots, health_snapshots, bfi_import_runs)
-- because the migrations/meta/ snapshot sequence is missing 0002.
-- Run `npx drizzle-kit introspect` to reconcile that drift separately.

CREATE TYPE "public"."enrichment_correction_kind" AS ENUM('tmdb_match', 'tmdb_block', 'prefix_strip', 'suffix_strip', 'non_film', 'merge', 'reversal');--> statement-breakpoint
CREATE TYPE "public"."enrichment_correction_source" AS ENUM('claude_code', 'human', 'llm_judge', 'migration');--> statement-breakpoint
CREATE TABLE "enrichment_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "enrichment_correction_kind" NOT NULL,
	"raw_title" text,
	"cinema_id" text,
	"film_id" uuid,
	"target_tmdb_id" integer,
	"target_film_id" uuid,
	"reverses_id" uuid,
	"source" "enrichment_correction_source" NOT NULL,
	"source_context" jsonb,
	"verified_by" text,
	"verified_at" timestamp with time zone,
	"verification_note" text,
	"rationale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Read-side indexes the matcher will hit. Verified-only is the hot path
-- (every TMDB match goes through it); raw_title + cinema_id is the
-- composite lookup key.
CREATE INDEX "enrichment_corrections_verified_lookup_idx"
  ON "enrichment_corrections" USING btree ("verified_at", "kind")
  WHERE "verified_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "enrichment_corrections_title_cinema_idx"
  ON "enrichment_corrections" USING btree ("raw_title", "cinema_id");
