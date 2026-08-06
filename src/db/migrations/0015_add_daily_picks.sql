-- ============================================================================
-- THE SLEEPER: one acclaimed-but-under-seen repertory film per London day
--
-- Precomputed ~22 days ahead by the `sleeper` phase of /scrape, then read by
-- GET /api/sleepers. The row is an ADVISORY CACHE, not the truth — the read
-- path re-validates that the picked film still screens that day (screenings
-- get cancelled between weekly scrapes) and recomputes if it does not.
--
-- Why a table rather than an on-the-fly query: the 21-day no-repeat cooldown
-- is inherently stateful. Each day's pick depends on which films the previous
-- days consumed, so it cannot be expressed as a date-seeded pure function.
-- Drop the table and you drop the cooldown, and one long-running film then
-- wins every day.
--
-- Hand-written and applied out-of-band (psql / Supabase SQL editor):
-- meta/_journal.json stops at 0006, so `drizzle-kit generate` diffs against a
-- stale snapshot. `npm run db:migrate` will NOT apply this file.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "daily_picks" (
  -- London calendar date, NOT a timestamp. Read via Drizzle date({mode:"string"});
  -- mode:"date" yields UTC-midnight Dates that render as the previous day in BST.
  "pick_date"             date        PRIMARY KEY,

  -- CASCADE is required: db:cleanup-films deletes films that lose all their
  -- screenings, and a past pick's film can reach that state. Without it that
  -- script starts throwing FK violations.
  "film_id"               text        NOT NULL REFERENCES "films"("id") ON DELETE CASCADE,

  "score"                 real        NOT NULL,

  -- Signals snapshotted at pick time. vote_count drifts upward over time, so
  -- the live film row will not reproduce the score that was actually used.
  "letterboxd_rating"     real        NOT NULL,
  "tmdb_vote_count"       integer     NOT NULL,

  -- Observability: how many films cleared every gate that day. Warn below 3.
  "candidate_count"       integer     NOT NULL,

  -- Which cooldown tier produced this pick: 21 (full), 10 (relaxed), 0 (waived).
  -- Makes pool starvation visible instead of silently looking like a normal pick.
  "cooldown_days_applied" integer     NOT NULL,

  -- Bumped when K or a gate changes, so the refresh can replace rows computed
  -- under older settings rather than guessing whether scores are comparable.
  "algo_version"          integer     NOT NULL DEFAULT 1,

  "computed_at"           timestamptz NOT NULL DEFAULT now()
);

-- Cooldown lookback: "when was this film last picked?"
CREATE INDEX IF NOT EXISTS "daily_picks_film_date_idx"
  ON "daily_picks" ("film_id", "pick_date");
