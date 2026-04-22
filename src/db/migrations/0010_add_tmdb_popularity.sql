ALTER TABLE "films"
  ADD COLUMN IF NOT EXISTS "tmdb_popularity" real;
