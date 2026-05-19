-- ============================================================
-- pictures.london global search layer — cmd+k palette
-- ============================================================
-- Enables weighted full-text + trigram fuzzy across films,
-- cinemas, screenings, festivals, and seasons. Designed for
-- Reciprocal Rank Fusion (k=60) over tsvector + pg_trgm.
--
-- Implementation note (revised 2026-05-19): uses BEFORE INSERT
-- OR UPDATE triggers rather than GENERATED STORED columns.
-- Reason: PG generated columns require every referenced function
-- to be IMMUTABLE. `to_tsvector(config_name, text)` with a string
-- literal config is STABLE (implicit regconfig cast). `unaccent`
-- is STABLE. `jsonb_array_elements` is STABLE. Triggers have none
-- of these restrictions and let us extract cast names from jsonb,
-- use the custom `pictures` config, and chain unaccent freely.
-- The cost (trigger fires per write) is negligible on a 20k-row
-- films table updated occasionally by scrapers.
-- ============================================================

SET maintenance_work_mem = '512MB';
-- session-scoped, intentional; the apply runner holds one connection

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
-- 3. films — columns + trigger
-- ------------------------------------------------------------
-- Plain (non-generated) columns maintained by trigger.
ALTER TABLE films ADD COLUMN IF NOT EXISTS search_tsv  tsvector;
ALTER TABLE films ADD COLUMN IF NOT EXISTS search_text text;

CREATE OR REPLACE FUNCTION update_films_search()
RETURNS TRIGGER AS $$
DECLARE
  cast_names text;
BEGIN
  -- Extract cast names from jsonb column (SRF allowed in trigger body).
  -- Defensive: at least one film row has `cast` as a non-array scalar
  -- (legacy data shape); jsonb_array_elements throws on scalars.
  IF jsonb_typeof(NEW."cast") = 'array' THEN
    cast_names := (
      SELECT coalesce(string_agg(elem->>'name', ' '), '')
      FROM jsonb_array_elements(NEW."cast") AS elem
      WHERE jsonb_typeof(elem) = 'object'
    );
  ELSE
    cast_names := '';
  END IF;

  NEW.search_tsv :=
    setweight(to_tsvector('pictures',
      coalesce(NEW.title, '') || ' ' || coalesce(NEW.original_title, '')
    ), 'A') ||
    setweight(to_tsvector('pictures',
      coalesce(array_to_string(NEW.directors, ' '), '') || ' ' || cast_names
    ), 'B') ||
    setweight(to_tsvector('pictures',
      coalesce(array_to_string(NEW.genres, ' '), '') || ' ' ||
      coalesce(array_to_string(NEW.countries, ' '), '') || ' ' ||
      coalesce(array_to_string(NEW.languages, ' '), '')
    ), 'C') ||
    setweight(to_tsvector('pictures',
      coalesce(NEW.synopsis, '') || ' ' || coalesce(NEW.tagline, '')
    ), 'D');

  NEW.search_text := lower(unaccent(
    coalesce(NEW.title, '') || ' ' ||
    coalesce(NEW.original_title, '') || ' ' ||
    coalesce(array_to_string(NEW.directors, ' '), '')
  ));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_films_search ON films;
CREATE TRIGGER trg_films_search
BEFORE INSERT OR UPDATE OF title, original_title, directors, "cast", genres, countries, languages, synopsis, tagline
ON films
FOR EACH ROW
EXECUTE FUNCTION update_films_search();

-- Backfill: no-op UPDATE triggers the BEFORE UPDATE.
-- The trigger watches `title` so updating title-to-itself fires it.
UPDATE films SET title = title WHERE search_tsv IS NULL;

-- ------------------------------------------------------------
-- 4. cinemas — columns + trigger
-- ------------------------------------------------------------
ALTER TABLE cinemas ADD COLUMN IF NOT EXISTS search_tsv  tsvector;
ALTER TABLE cinemas ADD COLUMN IF NOT EXISTS search_text text;

CREATE OR REPLACE FUNCTION update_cinemas_search()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('pictures',
      coalesce(NEW.name, '') || ' ' || coalesce(NEW.short_name, '')
    ), 'A') ||
    setweight(to_tsvector('pictures', coalesce(NEW.chain, '')), 'B') ||
    setweight(to_tsvector('pictures',
      coalesce(NEW.address->>'area', '') || ' ' ||
      coalesce(NEW.address->>'postcode', '') || ' ' ||
      coalesce(NEW.address->>'street', '')
    ), 'C') ||
    setweight(to_tsvector('pictures', coalesce(NEW.description, '')), 'D');

  NEW.search_text := lower(unaccent(
    coalesce(NEW.name, '') || ' ' ||
    coalesce(NEW.short_name, '') || ' ' ||
    coalesce(NEW.chain, '')
  ));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cinemas_search ON cinemas;
CREATE TRIGGER trg_cinemas_search
BEFORE INSERT OR UPDATE OF name, short_name, chain, address, description
ON cinemas
FOR EACH ROW
EXECUTE FUNCTION update_cinemas_search();

UPDATE cinemas SET name = name WHERE search_tsv IS NULL;

-- ------------------------------------------------------------
-- 5. screenings — column + trigger (B weight metadata only)
-- ------------------------------------------------------------
ALTER TABLE screenings ADD COLUMN IF NOT EXISTS search_tsv tsvector;

CREATE OR REPLACE FUNCTION update_screenings_search()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_tsv := setweight(to_tsvector('pictures',
    coalesce(NEW.format, '') || ' ' ||
    coalesce(NEW.screen, '') || ' ' ||
    coalesce(NEW.season, '') || ' ' ||
    coalesce(NEW.event_type, '') || ' ' ||
    coalesce(NEW.event_description, '') || ' ' ||
    coalesce(NEW.subtitle_language, '')
  ), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_screenings_search ON screenings;
CREATE TRIGGER trg_screenings_search
BEFORE INSERT OR UPDATE OF format, screen, season, event_type, event_description, subtitle_language
ON screenings
FOR EACH ROW
EXECUTE FUNCTION update_screenings_search();

-- Backfill — use a small column update to fire trigger on existing rows.
-- (datetime not in trigger WHEN list, so updating it doesn't help — touch format)
UPDATE screenings SET format = format WHERE search_tsv IS NULL;

-- ------------------------------------------------------------
-- 6. festivals — column + trigger
-- ------------------------------------------------------------
ALTER TABLE festivals ADD COLUMN IF NOT EXISTS search_tsv tsvector;

CREATE OR REPLACE FUNCTION update_festivals_search()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('pictures',
      coalesce(NEW.name, '') || ' ' || coalesce(NEW.short_name, '')
    ), 'A') ||
    setweight(to_tsvector('pictures', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('pictures',
      coalesce(array_to_string(NEW.genre_focus, ' '), '')
    ), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_festivals_search ON festivals;
CREATE TRIGGER trg_festivals_search
BEFORE INSERT OR UPDATE OF name, short_name, description, genre_focus
ON festivals
FOR EACH ROW
EXECUTE FUNCTION update_festivals_search();

UPDATE festivals SET name = name WHERE search_tsv IS NULL;

-- ------------------------------------------------------------
-- 7. seasons — column + trigger
-- ------------------------------------------------------------
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS search_tsv tsvector;

CREATE OR REPLACE FUNCTION update_seasons_search()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('pictures',
      coalesce(NEW.name, '') || ' ' || coalesce(NEW.director_name, '')
    ), 'A') ||
    setweight(to_tsvector('pictures', coalesce(NEW.description, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_seasons_search ON seasons;
CREATE TRIGGER trg_seasons_search
BEFORE INSERT OR UPDATE OF name, director_name, description
ON seasons
FOR EACH ROW
EXECUTE FUNCTION update_seasons_search();

UPDATE seasons SET name = name WHERE search_tsv IS NULL;

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
CREATE INDEX IF NOT EXISTS idx_films_rep_year
  ON films (is_repertory, year DESC);

CREATE INDEX IF NOT EXISTS idx_films_content_type_year
  ON films (content_type, year DESC);

CREATE INDEX IF NOT EXISTS idx_films_decade
  ON films (decade)
  WHERE decade IS NOT NULL;

-- NOTE: an `idx_screenings_film_datetime` btree on (film_id, datetime)
-- already exists from migration 0000 (see src/db/schema/screenings.ts).
-- That index handles the LATERAL "next upcoming screening per film"
-- subquery in the films RRF recency boost without needing a separate
-- partial index. (We tried `... WHERE datetime > now()` but `now()` is
-- STABLE and PG rejects it as an index predicate.)
