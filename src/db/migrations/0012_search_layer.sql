-- ============================================================
-- pictures.london global search layer — cmd+k palette
-- ============================================================
-- Enables weighted full-text + trigram fuzzy across films,
-- cinemas, screenings, festivals, and seasons. Designed for
-- Reciprocal Rank Fusion (k=60) over tsvector + pg_trgm.
--
-- IMPORTANT: run with maintenance_work_mem bumped; Supabase Pro
-- silently clamps but the SET is still worth it for the films
-- GIN build (~3500 to 20k rows).
-- ============================================================

SET maintenance_work_mem = '512MB';

-- ------------------------------------------------------------
-- 1. Extensions
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- ------------------------------------------------------------
-- 2. Custom text search config with unaccent
-- ------------------------------------------------------------
-- Idempotent: drop+recreate so re-running the migration is safe.
DROP TEXT SEARCH CONFIGURATION IF EXISTS pictures;
CREATE TEXT SEARCH CONFIGURATION pictures (COPY = english);
ALTER TEXT SEARCH CONFIGURATION pictures
  ALTER MAPPING FOR hword, hword_part, word
  WITH unaccent, english_stem;
-- to_tsvector('pictures','Amélie') = to_tsvector('pictures','amelie').

-- ------------------------------------------------------------
-- 3. films.search_tsv + search_text
-- ------------------------------------------------------------
-- Weighted A/B/C/D:
--   A: title + original_title
--   B: directors[] + cast jsonb (names extracted)
--   C: genres + countries + languages
--   D: synopsis + tagline
--
-- The cast jsonb extraction uses ARRAY(SELECT jsonb_array_elements_text(jsonb_path_query_array(...)))
-- because plain `jsonb_array_elements` is STABLE not IMMUTABLE — PG ≤16 rejects
-- it inside a generated column. jsonb_path_query_array IS IMMUTABLE.
ALTER TABLE films
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('pictures',
      coalesce(title, '') || ' ' || coalesce(original_title, '')
    ), 'A') ||
    setweight(to_tsvector('pictures',
      coalesce(array_to_string(directors, ' '), '') || ' ' ||
      coalesce(
        array_to_string(
          ARRAY(SELECT jsonb_array_elements_text(
            jsonb_path_query_array(coalesce("cast", '[]'::jsonb), '$[*].name')
          )),
          ' '
        ),
        ''
      )
    ), 'B') ||
    setweight(to_tsvector('pictures',
      coalesce(array_to_string(genres, ' '), '') || ' ' ||
      coalesce(array_to_string(countries, ' '), '') || ' ' ||
      coalesce(array_to_string(languages, ' '), '')
    ), 'C') ||
    setweight(to_tsvector('pictures',
      coalesce(synopsis, '') || ' ' || coalesce(tagline, '')
    ), 'D')
  ) STORED;

ALTER TABLE films
  ADD COLUMN IF NOT EXISTS search_text text
  GENERATED ALWAYS AS (
    lower(unaccent(
      coalesce(title, '') || ' ' ||
      coalesce(original_title, '') || ' ' ||
      coalesce(array_to_string(directors, ' '), '')
    ))
  ) STORED;

-- ------------------------------------------------------------
-- 4. cinemas.search_tsv + search_text
-- ------------------------------------------------------------
-- address is jsonb — extract area / postcode / street via ->>.
ALTER TABLE cinemas
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('pictures',
      coalesce(name, '') || ' ' || coalesce(short_name, '')
    ), 'A') ||
    setweight(to_tsvector('pictures', coalesce(chain, '')), 'B') ||
    setweight(to_tsvector('pictures',
      coalesce(address->>'area', '') || ' ' ||
      coalesce(address->>'postcode', '') || ' ' ||
      coalesce(address->>'street', '')
    ), 'C') ||
    setweight(to_tsvector('pictures', coalesce(description, '')), 'D')
  ) STORED;

ALTER TABLE cinemas
  ADD COLUMN IF NOT EXISTS search_text text
  GENERATED ALWAYS AS (
    lower(unaccent(
      coalesce(name, '') || ' ' ||
      coalesce(short_name, '') || ' ' ||
      coalesce(chain, '')
    ))
  ) STORED;

-- ------------------------------------------------------------
-- 5. screenings.search_tsv (B weight only — metadata, not titles)
-- ------------------------------------------------------------
ALTER TABLE screenings
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('pictures',
      coalesce(format, '') || ' ' ||
      coalesce(screen, '') || ' ' ||
      coalesce(season, '') || ' ' ||
      coalesce(event_type, '') || ' ' ||
      coalesce(event_description, '') || ' ' ||
      coalesce(subtitle_language, '')
    ), 'B')
  ) STORED;

-- ------------------------------------------------------------
-- 6. festivals.search_tsv
-- ------------------------------------------------------------
ALTER TABLE festivals
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('pictures',
      coalesce(name, '') || ' ' || coalesce(short_name, '')
    ), 'A') ||
    setweight(to_tsvector('pictures', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('pictures',
      coalesce(array_to_string(genre_focus, ' '), '')
    ), 'C')
  ) STORED;

-- ------------------------------------------------------------
-- 7. seasons.search_tsv
-- ------------------------------------------------------------
ALTER TABLE seasons
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('pictures',
      coalesce(name, '') || ' ' || coalesce(director_name, '')
    ), 'A') ||
    setweight(to_tsvector('pictures', coalesce(description, '')), 'B')
  ) STORED;

-- ------------------------------------------------------------
-- 8. GIN indexes
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_films_search_tsv
  ON films USING gin (search_tsv);
CREATE INDEX IF NOT EXISTS idx_films_search_trgm
  ON films USING gin (search_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_cinemas_search_tsv
  ON cinemas USING gin (search_tsv);
CREATE INDEX IF NOT EXISTS idx_cinemas_search_trgm
  ON cinemas USING gin (search_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_screenings_search_tsv
  ON screenings USING gin (search_tsv);

CREATE INDEX IF NOT EXISTS idx_festivals_search_tsv
  ON festivals USING gin (search_tsv);

CREATE INDEX IF NOT EXISTS idx_seasons_search_tsv
  ON seasons USING gin (search_tsv);

-- ------------------------------------------------------------
-- 9. Compound btree indexes for filtered hybrid queries
-- ------------------------------------------------------------
-- "repertory 80s" — both predicates together
CREATE INDEX IF NOT EXISTS idx_films_rep_year
  ON films (is_repertory, year DESC);

-- contentType filtering by year (event/film/livebroadcast/season)
CREATE INDEX IF NOT EXISTS idx_films_content_type_year
  ON films (content_type, year DESC);

-- decade lookup
CREATE INDEX IF NOT EXISTS idx_films_decade
  ON films (decade)
  WHERE decade IS NOT NULL;

-- Hot path for the LATERAL "next upcoming screening per film"
-- subquery used in the films RRF recency boost.
CREATE INDEX IF NOT EXISTS idx_screenings_film_future
  ON screenings (film_id, datetime)
  WHERE datetime > now();
-- NOTE: WHERE now() is non-IMMUTABLE so this is a partial-index
-- predicate evaluated at index-creation time. Postgres will still
-- use it for queries with `WHERE datetime > now()`. If the index
-- ever feels stale (rare), `REINDEX` it; we expect to recreate it
-- nightly via a tiny cron in a future iteration. Cheaper for v1.
