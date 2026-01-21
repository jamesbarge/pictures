-- Migration: Enable Row Level Security (RLS) for all tables
-- Purpose: Fix Supabase linter errors and add defense-in-depth security
--
-- Security Model:
--   - Application uses Clerk for authentication (not Supabase Auth)
--   - Database accessed via service_role connection (bypasses RLS)
--   - RLS protects against direct PostgREST API access if anon key is exposed
--
-- Table Categories:
--   1. Public Content: Anonymous read, service_role writes
--   2. User Data: Service_role only (app handles user isolation)
--   3. Admin/Internal: Service_role only

-- =============================================================================
-- PUBLIC CONTENT TABLES
-- Allow anonymous read access, restrict writes to service_role
-- =============================================================================

-- cinemas
ALTER TABLE public.cinemas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to cinemas"
  ON public.cinemas FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow service_role full access to cinemas"
  ON public.cinemas FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- films
ALTER TABLE public.films ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to films"
  ON public.films FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow service_role full access to films"
  ON public.films FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- screenings
ALTER TABLE public.screenings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to screenings"
  ON public.screenings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow service_role full access to screenings"
  ON public.screenings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- seasons
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to seasons"
  ON public.seasons FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow service_role full access to seasons"
  ON public.seasons FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- season_films
ALTER TABLE public.season_films ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to season_films"
  ON public.season_films FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow service_role full access to season_films"
  ON public.season_films FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- festivals
ALTER TABLE public.festivals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to festivals"
  ON public.festivals FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow service_role full access to festivals"
  ON public.festivals FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- festival_screenings
ALTER TABLE public.festival_screenings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to festival_screenings"
  ON public.festival_screenings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow service_role full access to festival_screenings"
  ON public.festival_screenings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- bfi_sources
ALTER TABLE public.bfi_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to bfi_sources"
  ON public.bfi_sources FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow service_role full access to bfi_sources"
  ON public.bfi_sources FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- bfi_publication_schedule
ALTER TABLE public.bfi_publication_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to bfi_publication_schedule"
  ON public.bfi_publication_schedule FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow service_role full access to bfi_publication_schedule"
  ON public.bfi_publication_schedule FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- USER DATA TABLES
-- Service_role only - application handles user isolation via Clerk auth
-- =============================================================================

-- users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service_role full access to users"
  ON public.users FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- user_preferences
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service_role full access to user_preferences"
  ON public.user_preferences FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- user_film_statuses
ALTER TABLE public.user_film_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service_role full access to user_film_statuses"
  ON public.user_film_statuses FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- user_festival_interests
ALTER TABLE public.user_festival_interests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service_role full access to user_festival_interests"
  ON public.user_festival_interests FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- user_festival_schedule
ALTER TABLE public.user_festival_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service_role full access to user_festival_schedule"
  ON public.user_festival_schedule FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- ADMIN/INTERNAL TABLES
-- Service_role only - no public access
-- =============================================================================

-- admin_actions
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service_role full access to admin_actions"
  ON public.admin_actions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- scraper_runs
ALTER TABLE public.scraper_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service_role full access to scraper_runs"
  ON public.scraper_runs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- cinema_baselines
ALTER TABLE public.cinema_baselines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service_role full access to cinema_baselines"
  ON public.cinema_baselines FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- data_issues (if exists - may not be in all environments)
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'data_issues'
  ) THEN
    ALTER TABLE public.data_issues ENABLE ROW LEVEL SECURITY;

    -- Check if policy already exists before creating
    IF NOT EXISTS (
      SELECT FROM pg_policies
      WHERE tablename = 'data_issues'
      AND policyname = 'Allow service_role full access to data_issues'
    ) THEN
      EXECUTE 'CREATE POLICY "Allow service_role full access to data_issues"
        ON public.data_issues FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true)';
    END IF;
  END IF;
END $$;
