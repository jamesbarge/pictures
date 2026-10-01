-- ============================================================================
-- THE SLEEPER: obscurity signal
--
-- TMDB's `vote_count` has always been present in the API response
-- (src/lib/tmdb/types.ts) and returned by every getFilmDetails call, but was
-- never persisted — only `vote_average` (-> tmdb_rating) and `popularity`.
--
-- THE SLEEPER needs "how many people have actually seen this", and
-- tmdb_popularity is the wrong tool: it is a decaying *trending* score, so a
-- 1970s masterpiece and an obscure dud both sit near zero. vote_count is
-- cumulative and therefore an honest proxy for reach.
--
-- Nullable: films with no tmdb_id can never have one, and those rows are
-- simply ineligible to be picked.
--
-- Hand-written and applied out-of-band (psql / Supabase SQL editor):
-- meta/_journal.json stops at 0006, so `drizzle-kit generate` would diff
-- against that stale snapshot and try to re-add tmdb_popularity,
-- letterboxd_slug and friends. `npm run db:migrate` will NOT apply this file.
-- ============================================================================

ALTER TABLE "films"
  ADD COLUMN IF NOT EXISTS "tmdb_vote_count" integer;
