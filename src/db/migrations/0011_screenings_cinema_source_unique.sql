-- Prevent (cinema_id, source_id) duplicate rows on `screenings`.
--
-- Why: the existing unique index is on (film_id, cinema_id, datetime) which
-- doesn't catch two scrapes mapping the same (cinema_id, source_id) to
-- different rows — either via different film_id resolutions (e.g. Hard Boiled
-- @ The Nickel) or via BST off-by-one regressions producing datetime+1h
-- duplicates (e.g. Wake in Fright @ The Gate, Shrek @ Everyman Maida Vale).
--
-- The partial WHERE clause excludes rows without a source_id; some legacy
-- scrapers may still emit null source_ids, and we still want them to insert.
--
-- Companion change: the upsert in `processScreenings` (src/scrapers/pipeline.ts)
-- now uses (cinema_id, source_id) as conflict target when source_id is set,
-- so a re-scrape with corrected datetime UPDATEs in place instead of inserting
-- a new row.

CREATE UNIQUE INDEX IF NOT EXISTS idx_screenings_cinema_source
  ON screenings (cinema_id, source_id)
  WHERE source_id IS NOT NULL;
