-- ============================================================
-- Step 2 follow-up: trim search_text to title-only for trigram
-- ============================================================
-- Why: migration 0012 made search_text = lower(unaccent(title +
-- original_title + directors)). On films with long director lists
-- (e.g. Amélie's search_text is "amelie le fabuleux destin d'amelie
-- poulain jean-pierre jeunet"), the WHOLE-STRING trigram similarity
-- to a typo like "amelei" drops to ~0.07 — below the default 0.3
-- threshold for the `%` operator. Result: the typo doesn't find the
-- film via trigram.
--
-- Fix: search_text is for *typo-correcting on the title*. Director
-- and original_title are already in the tsvector B/A weights for
-- lexical match. Strip search_text to just the title (lowered +
-- unaccented). Now `'amelei' % 'amélie'` clears the 0.3 threshold.
-- ============================================================

CREATE OR REPLACE FUNCTION update_films_search()
RETURNS TRIGGER AS $$
DECLARE
  cast_names text;
BEGIN
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

  -- TRULY title-only for trigram. Even original_title bloats the string:
  -- "Amélie" + "Le Fabuleux Destin d'Amélie Poulain" drops the typo
  -- similarity below the 0.3 threshold. original_title is in the
  -- tsvector A-weight already — lexical exact matches still work.
  NEW.search_text := lower(unaccent(coalesce(NEW.title, '')));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

  -- Name-only for trigram. Chain + short_name are in tsvector A/B.
  NEW.search_text := lower(unaccent(coalesce(NEW.name, '')));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Backfill: force trigger to fire on every existing row.
UPDATE films   SET title = title;
UPDATE cinemas SET name  = name;
